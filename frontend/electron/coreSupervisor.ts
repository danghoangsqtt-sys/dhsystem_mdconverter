import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';

const CORE_PORT = 8088;
const HEALTH_TIMEOUT_MS = 1_500;
const START_TIMEOUT_MS = 90_000;
const START_POLL_MS = 250;
const LEASE_INTERVAL_MS = 5_000;
const LEASE_STALE_MS = 20_000;

// Clean up any stale startup lock on module load (e.g., from a previous crash)
function cleanupStaleLockOnStartup(lockPath: string) {
  try {
    const lock = readJson<{ pid: number; createdAt: number }>(lockPath);
    if (!lock || (!isProcessAlive(lock.pid) && Date.now() - Number(lock.createdAt || 0) > 1_000)) {
      fs.unlinkSync(lockPath);
    }
  } catch {
    // Ignore - file may not exist or be unreadable
  }
}

function readJson<T>(filePath: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
  } catch {
    return null;
  }
}

function writeJsonAtomic(filePath: string, value: unknown) {
  const temporaryPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  fs.writeFileSync(temporaryPath, JSON.stringify(value), { encoding: 'utf8', mode: 0o600, flag: 'wx' });
  try {
    fs.renameSync(temporaryPath, filePath);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== 'EEXIST' && code !== 'EPERM') {
      try { fs.unlinkSync(temporaryPath); } catch { /* best-effort cleanup */ }
      throw error;
    }
    // Windows does not replace an existing destination with renameSync.
    // Leases are disposable heartbeat files, so replace only that exact file.
    try { fs.unlinkSync(filePath); } catch (unlinkError) {
      if ((unlinkError as NodeJS.ErrnoException).code !== 'ENOENT') throw unlinkError;
    }
    fs.renameSync(temporaryPath, filePath);
  }
}

function copyDirectoryMissing(sourceDir: string, destinationDir: string) {
  if (!fs.existsSync(sourceDir)) return;
  fs.mkdirSync(destinationDir, { recursive: true, mode: 0o700 });
  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    const sourcePath = path.join(sourceDir, entry.name);
    const destinationPath = path.join(destinationDir, entry.name);
    const sourceInfo = fs.lstatSync(sourcePath);
    if (sourceInfo.isSymbolicLink()) continue;
    if (entry.isDirectory()) {
      copyDirectoryMissing(sourcePath, destinationPath);
    } else if (entry.isFile() && !fs.existsSync(destinationPath)) {
      try {
        fs.copyFileSync(sourcePath, destinationPath, fs.constants.COPYFILE_EXCL);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      }
    }
  }
}

export class TiniCoreSupervisor {
  private readonly options: CoreSupervisorOptions;
  private readonly suiteRoot: string;
  private readonly coreRoot: string;
  private readonly clientsDir: string;
  private readonly descriptorPath: string;
  private readonly lockPath: string;
  private readonly dataDir: string;
  private readonly clientId = randomUUID();
  private readonly leasePath: string;
  private session: CoreDescriptor | null = null;
  private leaseTimer: NodeJS.Timeout | null = null;
  private maintenanceRunning = false;
  private disposed = false;

  constructor(options: CoreSupervisorOptions) {
    this.options = options;
    this.suiteRoot = path.join(options.appDataDir, 'Tini Suite');
    this.coreRoot = path.join(this.suiteRoot, 'core');
    this.clientsDir = path.join(this.coreRoot, 'clients');
    this.descriptorPath = path.join(this.coreRoot, 'session.json');
    this.lockPath = path.join(this.coreRoot, 'startup.lock');
    this.dataDir = path.join(this.suiteRoot, 'data');
    this.leasePath = path.join(this.clientsDir, `${this.clientId}.json`);
    // Clean up any stale lock file from a previous crash
    cleanupStaleLockOnStartup(this.lockPath);
  }

  async connect(): Promise<CoreSession> {
    this.prepareDirectoriesAndMigration();
    this.cleanupStaleLeases();
    this.session = await this.attachOrStart();
    this.writeLease();
    this.leaseTimer = setInterval(() => {
      this.writeLease();
      void this.maintainSession();
    }, LEASE_INTERVAL_MS);
    this.leaseTimer.unref();
    return this.publicSession(this.session);
  }

  async dispose(graceMilliseconds = 1_500): Promise<void> {
    this.disposed = true;
    if (this.leaseTimer) clearInterval(this.leaseTimer);
    this.leaseTimer = null;
    try { fs.unlinkSync(this.leasePath); } catch { /* already removed */ }
    await delay(graceMilliseconds);
    this.cleanupStaleLeases();
    if (this.activeLeases().length > 0 || !this.session) return;

    const current = readJson<CoreDescriptor>(this.descriptorPath);
    if (!current || current.instanceId !== this.session.instanceId) return;
    if (await this.isHealthy(current)) this.stopProcess(current.pid);
    try { fs.unlinkSync(this.descriptorPath); } catch { /* stale/removed */ }
    try { fs.unlinkSync(this.lockPath); } catch { /* stale/removed */ }
  }

  private prepareDirectoriesAndMigration() {
    fs.mkdirSync(this.clientsDir, { recursive: true, mode: 0o700 });
    fs.mkdirSync(this.dataDir, { recursive: true, mode: 0o700 });
    const legacyDataDir = path.join(this.options.legacyUserDataDir, 'data');
    if (path.resolve(legacyDataDir) !== path.resolve(this.dataDir)) {
      copyDirectoryMissing(legacyDataDir, this.dataDir);
    }
  }

  private async attachOrStart(): Promise<CoreDescriptor> {
    const existing = readJson<CoreDescriptor>(this.descriptorPath);
    if (existing && await this.isHealthy(existing)) return existing;

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const lockHandle = this.tryAcquireStartupLock();
      if (lockHandle !== null) {
        try {
          const rechecked = readJson<CoreDescriptor>(this.descriptorPath);
          if (rechecked && await this.isHealthy(rechecked)) return rechecked;
          if (rechecked) {
            // Unhealthy but still occupying CORE_PORT (e.g. a version
            // mismatch left over from a previous install) — stopProcess
            // no-ops if it already died, so this is safe either way, and
            // it guarantees startCore() below gets the port free.
            this.stopProcess(rechecked.pid);
            try { fs.unlinkSync(this.descriptorPath); } catch { /* stale */ }
          }
          return await this.startCore();
        } finally {
          fs.closeSync(lockHandle);
          try { fs.unlinkSync(this.lockPath); } catch { /* another recovery removed it */ }
        }
      }

      await this.recoverStaleLock();
      const attached = await this.waitForDescriptor(START_TIMEOUT_MS);
      if (attached) return attached;
    }
    throw new Error('Tini Core không thể khởi động hoặc attach trong thời gian cho phép.');
  }

  private tryAcquireStartupLock(): number | null {
    try {
      const handle = fs.openSync(this.lockPath, 'wx', 0o600);
      fs.writeFileSync(handle, JSON.stringify({ pid: process.pid, createdAt: Date.now() }));
      return handle;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') return null;
      throw error;
    }
  }

  private async recoverStaleLock() {
    const lock = readJson<{ pid: number; createdAt: number }>(this.lockPath);
    if (!lock || (!isProcessAlive(lock.pid) && Date.now() - Number(lock.createdAt || 0) > 1_000)) {
      try { fs.unlinkSync(this.lockPath); } catch { /* active process won race */ }
    }
  }

  private async waitForDescriptor(timeoutMilliseconds: number): Promise<CoreDescriptor | null> {
    const deadline = Date.now() + timeoutMilliseconds;
    while (Date.now() < deadline) {
      const descriptor = readJson<CoreDescriptor>(this.descriptorPath);
      if (descriptor && await this.isHealthy(descriptor)) return descriptor;
      const lock = readJson<{ pid: number }>(this.lockPath);
      if (!lock) return null;
      if (lock && !isProcessAlive(lock.pid)) return null;
      await delay(START_POLL_MS);
    }
    return null;
  }

  private async startCore(previousSession?: CoreDescriptor): Promise<CoreDescriptor> {
    const token = previousSession?.token ?? randomBytes(32).toString('base64url');
    const pythonCandidates = this.options.packaged
      ? [path.join(this.options.projectRoot, 'python_runtime', 'python.exe')]
      : [
          path.join(this.options.projectRoot, 'docling-env', 'Scripts', 'python.exe'),
          path.join(this.options.projectRoot, 'python_runtime', 'python.exe'),
        ];
    const pythonExe = pythonCandidates.find(candidate => fs.existsSync(candidate));
    if (!pythonExe) throw new Error(`Không tìm thấy Python runtime: ${pythonCandidates.join(', ')}`);

    const runServerScript = path.join(this.options.projectRoot, 'backend', 'run_server.py');
    if (!fs.existsSync(runServerScript)) throw new Error(`Không tìm thấy Tini Core: ${runServerScript}`);
    const offlineModelsPath = path.join(this.options.projectRoot, 'offline_models');
    if (this.options.packaged && !fs.existsSync(offlineModelsPath)) {
      throw new Error(`Không tìm thấy model offline: ${offlineModelsPath}`);
    }

    const environment: NodeJS.ProcessEnv = {
      ...process.env,
      DOCUMARK_API_TOKEN: token,
      DOCUMARK_DATA_DIR: this.dataDir,
    };
    if (this.options.packaged) {
      environment.DOCUMARK_OFFLINE_MODE = '1';
      environment.DOCLING_ARTIFACTS_PATH = offlineModelsPath;
      environment.DOCUMARK_TRANSLATION_MODEL_PATH = path.join(offlineModelsPath, 'translation');
      environment.HF_HUB_OFFLINE = '1';
      environment.TRANSFORMERS_OFFLINE = '1';
      environment.PYTHONNOUSERSITE = '1';
    }

    const child = spawn(pythonExe, ['-s', runServerScript], {
      cwd: this.options.projectRoot,
      detached: true,
      stdio: 'ignore',
      env: environment,
      windowsHide: true,
    });
    await this.waitForSpawn(child);
    child.unref();
    if (!child.pid) throw new Error('Tini Core không trả PID sau khi spawn.');

    const descriptor: CoreDescriptor = {
      version: 1,
      instanceId: previousSession?.instanceId ?? randomUUID(),
      pid: child.pid,
      port: CORE_PORT,
      token,
      dataDir: this.dataDir,
      startedAt: new Date().toISOString(),
      appVersion: this.options.appVersion,
    };
    writeJsonAtomic(this.descriptorPath, descriptor);
    const attached = await this.waitForDescriptor(START_TIMEOUT_MS);
    if (!attached) {
      this.stopProcess(child.pid);
      try { fs.unlinkSync(this.descriptorPath); } catch { /* cleanup */ }
      throw new Error('Tini Core đã spawn nhưng health check không sẵn sàng.');
    }
    this.options.log?.(`[Tini Core] Started PID ${child.pid}`);
    return attached;
  }

  private async maintainSession(): Promise<void> {
    if (this.disposed || this.maintenanceRunning || !this.session) return;
    this.maintenanceRunning = true;
    try {
      if (await this.isHealthy(this.session)) return;
      this.options.log?.(`[Tini Core] Lost PID ${this.session.pid}; attempting recovery`);

      const lockHandle = this.tryAcquireStartupLock();
      if (lockHandle !== null) {
        try {
          const rechecked = readJson<CoreDescriptor>(this.descriptorPath);
          if (rechecked && await this.isHealthy(rechecked)) {
            if (rechecked.token === this.session.token) this.session = rechecked;
            return;
          }
          if (this.disposed) return;
          // this.session is unhealthy (process died, or is alive but wedged
          // and not answering /api/health) — stop it before restarting so
          // the replacement isn't left trying to bind an already-occupied
          // CORE_PORT. stopProcess no-ops if it's already dead.
          this.stopProcess(this.session.pid);
          this.session = await this.startCore(this.session);
        } finally {
          fs.closeSync(lockHandle);
          try { fs.unlinkSync(this.lockPath); } catch { /* another recovery removed it */ }
        }
        return;
      }

      await this.recoverStaleLock();
      const attached = await this.waitForDescriptor(START_TIMEOUT_MS);
      if (attached && attached.token === this.session.token) this.session = attached;
    } catch (error) {
      this.options.log?.(`[Tini Core] Recovery failed: ${error instanceof Error ? error.message : error}`);
    } finally {
      this.maintenanceRunning = false;
    }
  }

  private waitForSpawn(child: ChildProcess): Promise<void> {
    return new Promise((resolve, reject) => {
      child.once('spawn', resolve);
      child.once('error', reject);
    });
  }

  private async isHealthy(descriptor: CoreDescriptor): Promise<boolean> {
    if (descriptor.version !== 1 || descriptor.port !== CORE_PORT || !descriptor.token) return false;
    // A descriptor left behind by a different install (upgrade/downgrade,
    // or a stale one predating this field) must never be reattached to —
    // it may be running stale code, a stale data migration, or simply be a
    // leaked process an installer failed to terminate. Treat any version
    // mismatch as unhealthy so the caller starts a fresh Core instead.
    if (descriptor.appVersion !== this.options.appVersion) return false;
    if (!isProcessAlive(descriptor.pid)) return false;
    try {
      const response = await fetch(`http://127.0.0.1:${descriptor.port}/api/health`, {
        headers: { 'X-DocuMark-Token': descriptor.token },
        signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  private writeLease() {
    const lease: ClientLease = {
      version: 1,
      clientId: this.clientId,
      pid: process.pid,
      productId: this.options.productId,
      heartbeatAt: Date.now(),
    };
    writeJsonAtomic(this.leasePath, lease);
  }

  private cleanupStaleLeases() {
    if (!fs.existsSync(this.clientsDir)) return;
    for (const name of fs.readdirSync(this.clientsDir)) {
      if (!/^[0-9a-f-]{36}\.json$/i.test(name)) continue;
      const leasePath = path.join(this.clientsDir, name);
      const lease = readJson<ClientLease>(leasePath);
      if (!lease || !isProcessAlive(lease.pid) || Date.now() - Number(lease.heartbeatAt || 0) > LEASE_STALE_MS) {
        try { fs.unlinkSync(leasePath); } catch { /* concurrent cleanup */ }
      }
    }
  }

  private activeLeases(): ClientLease[] {
    if (!fs.existsSync(this.clientsDir)) return [];
    return fs.readdirSync(this.clientsDir)
      .filter(name => /^[0-9a-f-]{36}\.json$/i.test(name))
      .map(name => readJson<ClientLease>(path.join(this.clientsDir, name)))
      .filter((lease): lease is ClientLease => Boolean(
        lease && isProcessAlive(lease.pid) && Date.now() - lease.heartbeatAt <= LEASE_STALE_MS,
      ));
  }

  private stopProcess(pid: number) {
    if (!isProcessAlive(pid)) return;
    if (process.platform === 'win32') {
      spawnSync('taskkill', ['/pid', String(pid), '/f', '/t'], { windowsHide: true, stdio: 'ignore' });
    } else {
      try { process.kill(pid, 'SIGTERM'); } catch { /* already stopped */ }
    }
  }

  private publicSession(descriptor: CoreDescriptor): CoreSession {
    return {
      instanceId: descriptor.instanceId,
      pid: descriptor.pid,
      port: descriptor.port,
      token: descriptor.token,
      dataDir: descriptor.dataDir,
    };
  }
}

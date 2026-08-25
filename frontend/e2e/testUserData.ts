import os from 'node:os';
import path from 'node:path';

// electron.launch() attaches to the real, shared Tini Core profile by
// default: Electron's own userData (Chromium localStorage/IndexedDB/cache)
// defaults to a path derived from the app name, and TiniCoreSupervisor's
// "Tini Suite" data/session root (see coreSupervisor.ts) is derived from
// app.getPath('appData') - neither depends on how the test launches the
// process. Left alone, e2e runs would read stale UI state (e.g. a
// persisted collapsed sidebar) and write real conversion history into the
// user's actual %APPDATA%\Tini Suite profile. These constants redirect
// both to a temp directory instead; globalSetup.ts wipes it fresh before
// every run.
export const TEST_PROFILE_ROOT = path.join(os.tmpdir(), 'tini-suite-e2e-userdata');
export const TEST_ELECTRON_USER_DATA_DIR = path.join(TEST_PROFILE_ROOT, 'electron-userdata');
export const TEST_APP_DATA_DIR = path.join(TEST_PROFILE_ROOT, 'appdata');
// Mirrors TiniCoreSupervisor's own suiteRoot/descriptorPath computation
// (path.join(appDataDir, 'Tini Suite', 'core', 'session.json')).
export const TEST_CORE_DESCRIPTOR = path.join(TEST_APP_DATA_DIR, 'Tini Suite', 'core', 'session.json');

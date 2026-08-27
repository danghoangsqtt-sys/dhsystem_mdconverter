import os from 'node:os';
import path from 'node:path';

export const TEST_PROFILE_ROOT = path.join(os.tmpdir(), 'mark-tini-e2e-userdata');
export const TEST_ELECTRON_USER_DATA_DIR = path.join(TEST_PROFILE_ROOT, 'electron-userdata');
export const TEST_APP_DATA_DIR = path.join(TEST_PROFILE_ROOT, 'appdata');
export const TEST_CORE_DESCRIPTOR = path.join(TEST_APP_DATA_DIR, 'Mark Tini', 'core', 'session.json');

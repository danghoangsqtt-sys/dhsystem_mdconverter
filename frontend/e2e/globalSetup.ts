import fs from 'node:fs';
import { TEST_PROFILE_ROOT } from './testUserData';

// Runs once before the whole suite. Wiping and recreating here (rather than
// relying on electron.launch() to create an empty dir on first use)
// guarantees each full run starts from a clean, isolated profile even if a
// previous run crashed mid-test and left state behind.
export default function globalSetup() {
  fs.rmSync(TEST_PROFILE_ROOT, { recursive: true, force: true });
  fs.mkdirSync(TEST_PROFILE_ROOT, { recursive: true });
}

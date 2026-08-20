export {};

declare global {
  interface Window {
    // Only present when running inside the Electron shell (see
    // electron/preload.ts). Absent in plain-browser dev mode, so callers
    // must fall back to window.open when this is undefined.
    documark?: {
      apiToken: string;
      openExternal: (url: string) => Promise<void>;
      ensureOllama: () => Promise<'running' | 'started' | 'not_installed' | 'start_failed'>;
    };
  }
}

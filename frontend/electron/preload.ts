import { ipcRenderer, contextBridge } from 'electron'

const tokenArgument = process.argv.find(argument => argument.startsWith('--documark-api-token='))
const apiToken = tokenArgument?.slice('--documark-api-token='.length) ?? ''

// Purpose-named bridge so renderer code calls a specific API instead of
// poking raw IPC channel strings (no generic ipcRenderer passthrough is
// exposed). See src/electron.d.ts for the Window typing and electron/main.ts
// for the 'open-external' handler.
contextBridge.exposeInMainWorld('documark', {
  apiToken,
  openExternal: (url: string) => ipcRenderer.invoke('open-external', url),
  ensureOllama: () => ipcRenderer.invoke('ensure-ollama'),
  saveWordFile: (fileName: string, bytes: Uint8Array) => ipcRenderer.invoke('save-word-file', fileName, bytes),
})

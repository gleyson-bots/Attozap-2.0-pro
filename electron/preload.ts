import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('attozap', {
  app: {
    version: () => ipcRenderer.invoke('app:get-version') as Promise<string>,
    platform: () => ipcRenderer.invoke('app:get-platform') as Promise<string>,
  },
});

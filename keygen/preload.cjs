const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('keygen', {
  generateKeys: () => ipcRenderer.invoke('keys:generate'),
  selectPrivateKey: () => ipcRenderer.invoke('keys:select-private'),
  issueLicense: payload => ipcRenderer.invoke('license:issue', payload),
  saveLicense: (encoded, suggestedName) => ipcRenderer.invoke('license:save', encoded, suggestedName),
  copy: text => ipcRenderer.invoke('clipboard:copy', text),
});

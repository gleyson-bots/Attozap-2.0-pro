import { contextBridge, ipcRenderer } from 'electron';

type Listener = (payload: any) => void;
const on = (channel: string, callback: Listener) => {
  const handler = (_event: Electron.IpcRendererEvent, payload: any) => callback(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
};

contextBridge.exposeInMainWorld('attozap', {
  app: {
    version: () => ipcRenderer.invoke('app:get-version') as Promise<string>,
    platform: () => ipcRenderer.invoke('app:get-platform') as Promise<string>,
  },
  accounts: {
    list: () => ipcRenderer.invoke('accounts:list'),
    create: (name: string) => ipcRenderer.invoke('accounts:create', name),
    rename: (id: string, name: string) => ipcRenderer.invoke('accounts:rename', id, name),
    setProxy: (id: string, proxy?: string) => ipcRenderer.invoke('accounts:set-proxy', id, proxy),
    connect: (id: string) => ipcRenderer.invoke('accounts:connect', id),
    disconnect: (id: string, logout = false) => ipcRenderer.invoke('accounts:disconnect', id, logout),
    remove: (id: string) => ipcRenderer.invoke('accounts:remove', id),
    onState: (callback: Listener) => on('accounts:state', callback),
    onQr: (callback: Listener) => on('accounts:qr', callback),
    onError: (callback: Listener) => on('accounts:error', callback),
  },
  campaigns: {
    create: (payload: any) => ipcRenderer.invoke('campaigns:create', payload),
    list: () => ipcRenderer.invoke('campaigns:list'),
    get: (id: string) => ipcRenderer.invoke('campaigns:get', id),
    recipients: (id: string) => ipcRenderer.invoke('campaigns:recipients', id),
    start: (id: string) => ipcRenderer.invoke('campaigns:start', id),
    pause: (id: string) => ipcRenderer.invoke('campaigns:pause', id),
    resume: (id: string) => ipcRenderer.invoke('campaigns:resume', id),
    stop: (id: string) => ipcRenderer.invoke('campaigns:stop', id),
    schedule: (id: string, runAt: string) => ipcRenderer.invoke('campaigns:schedule', id, runAt),
    schedules: () => ipcRenderer.invoke('campaigns:schedules'),
    onProgress: (callback: Listener) => on('campaigns:progress', callback),
    onError: (callback: Listener) => on('campaigns:error', callback),
  },
  contacts: {
    list: (search?: string) => ipcRenderer.invoke('contacts:list', search),
    import: (contacts: any[]) => ipcRenderer.invoke('contacts:import', contacts),
    block: (phone: string, blocked: boolean) => ipcRenderer.invoke('contacts:block', phone, blocked),
    friendly: (phone: string, friendly: boolean) => ipcRenderer.invoke('contacts:friendly', phone, friendly),
    blocked: () => ipcRenderer.invoke('contacts:blocked'),
    friendlyList: () => ipcRenderer.invoke('contacts:friendly-list'),
  },
  chats: {
    list: (accountId: string, includeGroups = false) => ipcRenderer.invoke('chats:list', accountId, includeGroups),
    grabContacts: (accountId: string) => ipcRenderer.invoke('chats:grab-contacts', accountId),
  },
  tools: {
    filterNumbers: (accountId: string, numbers: string[]) => ipcRenderer.invoke('tools:filter-numbers', accountId, numbers),
    generateNumbers: (payload: any) => ipcRenderer.invoke('tools:generate-numbers', payload),
  },
  groups: {
    sync: (accountId: string) => ipcRenderer.invoke('groups:sync', accountId),
    list: (accountId: string) => ipcRenderer.invoke('groups:list', accountId),
    members: (accountId: string, groupJid: string) => ipcRenderer.invoke('groups:members', accountId, groupJid),
    activeMembers: (accountId: string, groupJid: string, days = 30) => ipcRenderer.invoke('groups:active-members', accountId, groupJid, days),
    create: (accountId: string, subject: string, participants: string[]) => ipcRenderer.invoke('groups:create', accountId, subject, participants),
    createMany: (accountId: string, jobs: Array<{ subject: string; participants: string[] }>, delayMs = 1000) => ipcRenderer.invoke('groups:create-many', accountId, jobs, delayMs),
    add: (accountId: string, groupJid: string, participants: string[]) => ipcRenderer.invoke('groups:add', accountId, groupJid, participants),
    addMany: (accountId: string, jobs: Array<{ groupJid: string; participants: string[] }>, delayMs = 1000) => ipcRenderer.invoke('groups:add-many', accountId, jobs, delayMs),
    join: (accountId: string, invite: string) => ipcRenderer.invoke('groups:join', accountId, invite),
    verify: (accountId: string, invite: string) => ipcRenderer.invoke('groups:verify', accountId, invite),
    verifyMany: (accountId: string, invites: string[]) => ipcRenderer.invoke('groups:verify-many', accountId, invites),
    invite: (accountId: string, groupJid: string) => ipcRenderer.invoke('groups:invite', accountId, groupJid),
  },
  templates: {
    list: () => ipcRenderer.invoke('templates:list'),
    create: (payload: any) => ipcRenderer.invoke('templates:create', payload),
    update: (id: string, payload: any) => ipcRenderer.invoke('templates:update', id, payload),
    remove: (id: string) => ipcRenderer.invoke('templates:remove', id),
  },
  polls: {
    list: (accountId?: string) => ipcRenderer.invoke('polls:list', accountId),
    onUpdate: (callback: Listener) => on('polls:update', callback),
  },
  autoReply: {
    list: (accountId?: string) => ipcRenderer.invoke('autoreply:list', accountId),
    create: (payload: any) => ipcRenderer.invoke('autoreply:create', payload),
    update: (id: string, payload: any) => ipcRenderer.invoke('autoreply:update', id, payload),
    remove: (id: string) => ipcRenderer.invoke('autoreply:remove', id),
  },
  license: {
    status: () => ipcRenderer.invoke('license:status'),
    activate: (encoded: string) => ipcRenderer.invoke('license:activate', encoded),
    deactivate: () => ipcRenderer.invoke('license:deactivate'),
  },
  files: {
    pick: (options?: any) => ipcRenderer.invoke('files:pick', options),
  },
  settings: {
    get: (key: string) => ipcRenderer.invoke('settings:get', key),
    set: (key: string, value: string) => ipcRenderer.invoke('settings:set', key, value),
  },
  audit: { list: () => ipcRenderer.invoke('audit:list') },
  messages: { onIncoming: (callback: Listener) => on('messages:incoming', callback) },
});

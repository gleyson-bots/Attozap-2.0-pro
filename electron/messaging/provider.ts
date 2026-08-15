export type ConnectionState = 'disconnected' | 'connecting' | 'qr' | 'connected' | 'reconnecting';

export type MessageResult = {
  id: string;
  remoteJid: string;
  timestamp: number;
};

export type ProviderEvents = {
  onState?: (state: ConnectionState) => void;
  onQr?: (qr: string) => void;
  onError?: (error: Error) => void;
  onMessage?: (message: IncomingMessage) => void;
};

export type IncomingMessage = {
  id: string;
  remoteJid: string;
  participant?: string;
  text: string;
  fromMe: boolean;
  timestamp: number;
};

export type ContactPresence = {
  input: string;
  jid?: string;
  exists: boolean;
};

export type SendMediaInput = {
  path: string;
  caption?: string;
  fileName?: string;
  mimetype?: string;
  ptt?: boolean;
};

export type LocationInput = {
  latitude: number;
  longitude: number;
  name?: string;
  address?: string;
};

export type ContactCardInput = {
  displayName: string;
  phone: string;
  organization?: string;
};

export type PollInput = {
  name: string;
  values: string[];
  selectableCount?: number;
};

export type GroupSummary = {
  id: string;
  subject: string;
  description?: string;
  size: number;
  owner?: string;
};

export type GroupInviteInfo = GroupSummary & {
  inviteCode?: string;
};

export interface MessagingProvider {
  readonly id: string;
  connect(events?: ProviderEvents): Promise<void>;
  disconnect(logout?: boolean): Promise<void>;
  sendText(remoteJid: string, text: string): Promise<MessageResult>;
  sendImage(remoteJid: string, input: SendMediaInput): Promise<MessageResult>;
  sendVideo(remoteJid: string, input: SendMediaInput): Promise<MessageResult>;
  sendDocument(remoteJid: string, input: SendMediaInput): Promise<MessageResult>;
  sendAudio(remoteJid: string, input: SendMediaInput): Promise<MessageResult>;
  sendSticker(remoteJid: string, input: SendMediaInput): Promise<MessageResult>;
  sendLocation(remoteJid: string, input: LocationInput): Promise<MessageResult>;
  sendContact(remoteJid: string, input: ContactCardInput): Promise<MessageResult>;
  sendPoll(remoteJid: string, input: PollInput): Promise<MessageResult>;
  checkNumbers(numbers: string[]): Promise<ContactPresence[]>;
  listGroups(): Promise<GroupSummary[]>;
  getGroupMetadata(groupJid: string): Promise<GroupSummary & { participants: string[] }>;
  createGroup(subject: string, participants: string[]): Promise<GroupSummary>;
  addGroupParticipants(groupJid: string, participants: string[]): Promise<Array<{ jid: string; status: string }>>;
  joinGroup(invite: string): Promise<string>;
  verifyGroupInvite(invite: string): Promise<GroupInviteInfo>;
  getGroupInvite(groupJid: string): Promise<string>;
  isConnected(): boolean;
  getSelfJid(): string | undefined;
}

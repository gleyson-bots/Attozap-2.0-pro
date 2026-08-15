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
};

export interface MessagingProvider {
  readonly id: string;
  connect(events?: ProviderEvents): Promise<void>;
  disconnect(): Promise<void>;
  sendText(remoteJid: string, text: string): Promise<MessageResult>;
  isConnected(): boolean;
}

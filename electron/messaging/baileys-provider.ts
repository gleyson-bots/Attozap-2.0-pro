import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  useMultiFileAuthState,
  type WASocket,
} from '@whiskeysockets/baileys';
import P from 'pino';
import type { MessagingProvider, MessageResult, ProviderEvents } from './provider.js';

export class BaileysProvider implements MessagingProvider {
  readonly id = 'baileys';
  private socket: WASocket | null = null;
  private connected = false;

  constructor(private readonly authDirectory: string) {}

  async connect(events: ProviderEvents = {}) {
    events.onState?.('connecting');
    const { state, saveCreds } = await useMultiFileAuthState(this.authDirectory);
    const { version } = await fetchLatestBaileysVersion();

    const socket = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: false,
      logger: P({ level: 'silent' }),
      markOnlineOnConnect: false,
      syncFullHistory: false,
      generateHighQualityLinkPreview: false,
    });

    this.socket = socket;
    socket.ev.on('creds.update', saveCreds);
    socket.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
      if (qr) {
        events.onState?.('qr');
        events.onQr?.(qr);
      }

      if (connection === 'open') {
        this.connected = true;
        events.onState?.('connected');
      }

      if (connection === 'close') {
        this.connected = false;
        const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
        const loggedOut = statusCode === DisconnectReason.loggedOut;
        events.onState?.('disconnected');
        if (!loggedOut) {
          events.onState?.('reconnecting');
          try { await this.connect(events); } catch (error) { events.onError?.(error as Error); }
        }
      }
    });
  }

  async disconnect() {
    this.connected = false;
    if (this.socket) {
      await this.socket.logout().catch(() => undefined);
      this.socket = null;
    }
  }

  async sendText(remoteJid: string, text: string): Promise<MessageResult> {
    if (!this.socket || !this.connected) throw new Error('Messaging provider is not connected');
    const result = await this.socket.sendMessage(remoteJid, { text });
    if (!result?.key?.id || !result.key.remoteJid) throw new Error('Provider returned an invalid message receipt');
    return {
      id: result.key.id,
      remoteJid: result.key.remoteJid,
      timestamp: Date.now(),
    };
  }

  isConnected() {
    return this.connected;
  }
}

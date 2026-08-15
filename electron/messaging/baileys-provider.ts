import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  isLidUser,
  isPnUser,
  jidNormalizedUser,
  useMultiFileAuthState,
  type WAMessage,
  type WASocket,
} from '@whiskeysockets/baileys';
import { randomUUID } from 'node:crypto';
import P from 'pino';
import { identityFromPair, mergeIdentity, normalizeJid, phoneFromPnJid } from './identity.js';
import type {
  ContactCardInput,
  ContactPresence,
  GroupInviteInfo,
  GroupParticipantIdentity,
  GroupSummary,
  IncomingMessage,
  LocationInput,
  MessagingProvider,
  MessageResult,
  PollInput,
  ProviderEvents,
  SendMediaInput,
} from './provider.js';

function digits(value: string) {
  return value.replace(/\D/g, '');
}

function userJid(value: string) {
  if (value.includes('@')) return normalizeJid(value) ?? value;
  return `${digits(value)}@s.whatsapp.net`;
}

function inviteCode(value: string) {
  const clean = value.trim();
  const match = clean.match(/chat\.whatsapp\.com\/([A-Za-z0-9_-]+)/i);
  return match?.[1] ?? clean;
}

function messageText(message: WAMessage): string {
  const content = message.message;
  if (!content) return '';
  return content.conversation
    ?? content.extendedTextMessage?.text
    ?? content.imageMessage?.caption
    ?? content.videoMessage?.caption
    ?? content.documentMessage?.caption
    ?? content.interactiveMessage?.body?.text
    ?? content.interactiveMessage?.header?.imageMessage?.caption
    ?? content.interactiveMessage?.header?.videoMessage?.caption
    ?? '';
}

function receipt(result: WAMessage | undefined): MessageResult {
  if (!result?.key?.id || !result.key.remoteJid) throw new Error('Provider returned an invalid message receipt');
  return { id: result.key.id, remoteJid: result.key.remoteJid, timestamp: Date.now() };
}

export class BaileysProvider implements MessagingProvider {
  readonly id = 'baileys';
  private socket: WASocket | null = null;
  private connected = false;
  private manuallyClosing = false;
  private events: ProviderEvents = {};

  constructor(private readonly authDirectory: string) {}

  async connect(events: ProviderEvents = {}) {
    this.events = events;
    this.manuallyClosing = false;
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
    socket.ev.on('messages.upsert', ({ messages }) => {
      for (const message of messages) {
        const remoteJid = message.key.remoteJid;
        if (!remoteJid || remoteJid === 'status@broadcast') continue;
        const incoming: IncomingMessage = {
          id: message.key.id ?? randomUUID(),
          remoteJid,
          remoteJidAlt: message.key.remoteJidAlt ?? undefined,
          participant: message.key.participant ?? undefined,
          participantAlt: message.key.participantAlt ?? undefined,
          addressingMode: message.key.addressingMode ?? undefined,
          pushName: message.pushName ?? undefined,
          text: messageText(message),
          fromMe: Boolean(message.key.fromMe),
          timestamp: Number(message.messageTimestamp ?? Math.floor(Date.now() / 1000)) * 1000,
        };
        this.events.onMessage?.(incoming);
      }
    });

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
        events.onState?.('disconnected');
        if (this.manuallyClosing) return;
        const statusCode = (lastDisconnect?.error as { output?: { statusCode?: number } } | undefined)?.output?.statusCode;
        if (statusCode !== DisconnectReason.loggedOut) {
          events.onState?.('reconnecting');
          try { await this.connect(events); } catch (error) { events.onError?.(error as Error); }
        }
      }
    });
  }

  async disconnect(logout = false) {
    this.connected = false;
    this.manuallyClosing = true;
    const socket = this.socket;
    this.socket = null;
    if (!socket) return;
    if (logout) await socket.logout().catch(() => undefined);
    else socket.end(new Error('Manual disconnect'));
  }

  private requireSocket() {
    if (!this.socket || !this.connected) throw new Error('A conta do WhatsApp não está conectada');
    return this.socket;
  }

  async resolveIdentity(jid: string, alternateJid?: string): Promise<ContactPresence> {
    const socket = this.requireSocket();
    const normalized = normalizeJid(jid) ?? jid;
    const alternate = normalizeJid(alternateJid);
    let identity = identityFromPair(normalized, alternate);

    if (isLidUser(normalized) && !identity?.pnJid) {
      const pnJid = await socket.signalRepository.lidMapping.getPNForLID(normalized).catch(() => undefined);
      identity = mergeIdentity(identity, identityFromPair(normalized, pnJid));
    } else if (isPnUser(normalized) && !identity?.lid) {
      const lid = await socket.signalRepository.lidMapping.getLIDForPN(normalized).catch(() => undefined);
      identity = mergeIdentity(identity, identityFromPair(lid, normalized), identityFromPair(normalized, lid));
    }

    return {
      input: jid,
      jid: identity?.jid ?? normalized,
      lid: identity?.lid,
      pnJid: identity?.pnJid,
      phone: identity?.phone ?? phoneFromPnJid(identity?.pnJid),
      exists: true,
    };
  }

  async sendText(remoteJid: string, text: string) {
    return receipt(await this.requireSocket().sendMessage(userJid(remoteJid), { text }));
  }

  async sendImage(remoteJid: string, input: SendMediaInput) {
    return receipt(await this.requireSocket().sendMessage(userJid(remoteJid), { image: { url: input.path }, caption: input.caption }));
  }

  async sendVideo(remoteJid: string, input: SendMediaInput) {
    return receipt(await this.requireSocket().sendMessage(userJid(remoteJid), { video: { url: input.path }, caption: input.caption, mimetype: input.mimetype }));
  }

  async sendDocument(remoteJid: string, input: SendMediaInput) {
    return receipt(await this.requireSocket().sendMessage(userJid(remoteJid), {
      document: { url: input.path },
      caption: input.caption,
      fileName: input.fileName,
      mimetype: input.mimetype ?? 'application/octet-stream',
    }));
  }

  async sendAudio(remoteJid: string, input: SendMediaInput) {
    return receipt(await this.requireSocket().sendMessage(userJid(remoteJid), {
      audio: { url: input.path },
      mimetype: input.mimetype ?? 'audio/mpeg',
      ptt: input.ptt ?? false,
    }));
  }

  async sendSticker(remoteJid: string, input: SendMediaInput) {
    return receipt(await this.requireSocket().sendMessage(userJid(remoteJid), { sticker: { url: input.path } }));
  }

  async sendLocation(remoteJid: string, input: LocationInput) {
    return receipt(await this.requireSocket().sendMessage(userJid(remoteJid), {
      location: { degreesLatitude: input.latitude, degreesLongitude: input.longitude, name: input.name, address: input.address },
    }));
  }

  async sendContact(remoteJid: string, input: ContactCardInput) {
    const phone = digits(input.phone);
    const vcard = [
      'BEGIN:VCARD', 'VERSION:3.0', `FN:${input.displayName}`,
      input.organization ? `ORG:${input.organization}` : undefined,
      `TEL;type=CELL;type=VOICE;waid=${phone}:+${phone}`,
      'END:VCARD',
    ].filter(Boolean).join('\n');
    return receipt(await this.requireSocket().sendMessage(userJid(remoteJid), {
      contacts: { displayName: input.displayName, contacts: [{ displayName: input.displayName, vcard }] },
    }));
  }

  async sendPoll(remoteJid: string, input: PollInput) {
    return receipt(await this.requireSocket().sendMessage(userJid(remoteJid), {
      poll: { name: input.name, values: input.values, selectableCount: input.selectableCount ?? 1 },
    }));
  }

  async checkNumbers(numbers: string[]): Promise<ContactPresence[]> {
    const socket = this.requireSocket();
    const unique = [...new Set(numbers.map(digits).filter(Boolean))];
    const result = await socket.onWhatsApp(...unique);
    const byNumber = new Map((result ?? []).map(item => [digits(item.jid), item]));
    const output: ContactPresence[] = [];

    for (const input of unique) {
      const match = byNumber.get(input);
      if (!match?.exists) {
        output.push({ input, exists: false });
        continue;
      }
      const resolved = await this.resolveIdentity(match.jid);
      output.push({ ...resolved, input, exists: true, phone: resolved.phone ?? input });
    }
    return output;
  }

  async listGroups(): Promise<GroupSummary[]> {
    const groups = await this.requireSocket().groupFetchAllParticipating();
    return Object.values(groups).map(group => ({
      id: group.id,
      subject: group.subject,
      description: group.desc,
      size: group.participants.length,
      owner: group.owner,
    })).sort((a, b) => a.subject.localeCompare(b.subject));
  }

  async getGroupMetadata(groupJid: string) {
    const group = await this.requireSocket().groupMetadata(groupJid);
    const participants: GroupParticipantIdentity[] = [];
    for (const participant of group.participants) {
      const resolved = await this.resolveIdentity(participant.id, participant.phoneNumber ?? participant.lid);
      participants.push({
        jid: resolved.jid ?? participant.id,
        lid: resolved.lid ?? participant.lid,
        pnJid: resolved.pnJid ?? participant.phoneNumber,
        phone: resolved.phone ?? phoneFromPnJid(participant.phoneNumber),
        admin: participant.admin,
      });
    }
    return {
      id: group.id,
      subject: group.subject,
      description: group.desc,
      size: group.participants.length,
      owner: group.owner,
      participants,
    };
  }

  async createGroup(subject: string, participants: string[]) {
    const group = await this.requireSocket().groupCreate(subject, participants.map(userJid));
    return { id: group.id, subject: group.subject, description: group.desc, size: group.participants.length, owner: group.owner };
  }

  async addGroupParticipants(groupJid: string, participants: string[]): Promise<Array<{ jid: string; status: string }>> {
    const normalized = participants.map(userJid);
    const result = await this.requireSocket().groupParticipantsUpdate(groupJid, normalized, 'add');
    return result
      .map((item, index) => ({ jid: item.jid ?? normalized[index] ?? '', status: item.status }))
      .filter(item => Boolean(item.jid));
  }

  async joinGroup(invite: string) {
    const jid = await this.requireSocket().groupAcceptInvite(inviteCode(invite));
    if (!jid) throw new Error('O WhatsApp não retornou o grupo após aceitar o convite');
    return jid;
  }

  async verifyGroupInvite(invite: string): Promise<GroupInviteInfo> {
    const code = inviteCode(invite);
    const group = await this.requireSocket().groupGetInviteInfo(code);
    return { id: group.id, subject: group.subject, description: group.desc, size: group.participants.length, owner: group.owner, inviteCode: code };
  }

  async getGroupInvite(groupJid: string) {
    const code = await this.requireSocket().groupInviteCode(groupJid);
    if (!code) throw new Error('Não foi possível obter o convite do grupo');
    return `https://chat.whatsapp.com/${code}`;
  }

  isConnected() { return this.connected; }
  getSelfJid() { return this.socket?.user?.id ? jidNormalizedUser(this.socket.user.id) : undefined; }
}

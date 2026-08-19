import makeWASocket, {
  DisconnectReason,
  downloadMediaMessage,
  fetchLatestBaileysVersion,
  getAggregateVotesInPollMessage,
  getContentType,
  isLidUser,
  isPnUser,
  jidNormalizedUser,
  useMultiFileAuthState,
  type WAMessage,
  type WASocket,
} from '@whiskeysockets/baileys';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { basename, extname, isAbsolute, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import P from 'pino';
import { identityFromPair, mergeIdentity, normalizeJid, phoneFromPnJid } from './identity.js';
import type {
  ContactCardInput,
  ContactPresence,
  GroupInviteInfo,
  GroupJoinResult,
  GroupParticipantIdentity,
  GroupSummary,
  IncomingMessage,
  IncomingMessageType,
  LocationInput,
  MessageDeliveryStatus,
  MessagingProvider,
  MessageResult,
  PollInput,
  ProviderEvents,
  SendMediaInput,
} from './provider.js';

const logger = P({ level: 'silent' });

function digits(value: string) { return value.replace(/\D/g, ''); }

async function localMediaBuffer(input: SendMediaInput): Promise<Buffer> {
  const rawPath = String(input.path ?? '').trim();
  if (!rawPath) throw new Error('Arquivo de mídia não informado');
  const filePath = isAbsolute(rawPath) ? rawPath : resolve(rawPath);
  let details;
  try {
    details = await stat(filePath);
  } catch {
    throw new Error(`Arquivo de mídia não encontrado: ${basename(filePath)}`);
  }
  if (!details.isFile()) throw new Error(`O caminho de mídia não é um arquivo: ${basename(filePath)}`);
  if (details.size <= 0) throw new Error(`O arquivo de mídia está vazio: ${basename(filePath)}`);
  if (details.size > 100 * 1024 * 1024) throw new Error(`O arquivo de mídia excede o limite de 100 MiB: ${basename(filePath)}`);
  try {
    return await readFile(filePath);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Não foi possível ler a mídia ${basename(filePath)}: ${message}`);
  }
}

function userJid(value: string) {
  if (value.includes('@')) return normalizeJid(value) ?? value;
  return `${digits(value)}@s.whatsapp.net`;
}

function inviteCode(value: string) {
  const clean = value.trim();
  if (!clean) throw new Error('Informe um link ou código de convite do grupo');
  const link = clean.match(/(?:https?:\/\/)?chat\.whatsapp\.com\/([A-Za-z0-9_-]{8,128})/i);
  const candidate = link?.[1] ?? clean.replace(/[?#].*$/, '').trim();
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(candidate)) throw new Error('Convite de grupo inválido. Use https://chat.whatsapp.com/CODIGO ou somente o código do convite.');
  return candidate;
}

const visibleMessageKeys = [
  'conversation', 'extendedTextMessage', 'imageMessage', 'videoMessage', 'audioMessage',
  'stickerMessage', 'documentMessage', 'pollCreationMessage', 'pollCreationMessageV2',
  'pollCreationMessageV3', 'contactMessage', 'contactsArrayMessage', 'locationMessage',
  'liveLocationMessage', 'interactiveMessage',
];

function unwrapContent(content: any, depth = 0): any {
  if (!content || depth > 6) return content;
  if (visibleMessageKeys.some(key => content?.[key])) return content;
  const direct = content?.ephemeralMessage?.message
    ?? content?.viewOnceMessage?.message
    ?? content?.viewOnceMessageV2?.message
    ?? content?.viewOnceMessageV2Extension?.message
    ?? content?.deviceSentMessage?.message
    ?? content?.documentWithCaptionMessage?.message
    ?? content?.editedMessage?.message
    ?? content?.protocolMessage?.editedMessage
    ?? content?.groupMentionedMessage?.message
    ?? content?.botInvokeMessage?.message;
  if (direct) return unwrapContent(direct, depth + 1);
  for (const [key, value] of Object.entries(content)) {
    if (!key.endsWith('Message') || !value || typeof value !== 'object') continue;
    const nested = (value as any).message;
    if (nested) {
      const resolved = unwrapContent(nested, depth + 1);
      if (resolved && visibleMessageKeys.some(candidate => resolved?.[candidate])) return resolved;
    }
  }
  return content;
}

function messageText(message: WAMessage): string {
  const content = unwrapContent(message.message);
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

function messageInfo(message: WAMessage): { type: IncomingMessageType; fileName?: string; mimetype?: string; metadata?: Record<string, unknown> } {
  const content = unwrapContent(message.message);
  const key = getContentType(content) ?? '';
  const node = key ? content?.[key] : undefined;
  if (key === 'imageMessage') return { type: 'image', mimetype: node?.mimetype ?? 'image/jpeg' };
  if (key === 'videoMessage') return { type: 'video', mimetype: node?.mimetype ?? 'video/mp4', metadata: { gifPlayback: Boolean(node?.gifPlayback) } };
  if (key === 'audioMessage') return { type: 'audio', mimetype: node?.mimetype ?? 'audio/ogg', metadata: { ptt: Boolean(node?.ptt), seconds: Number(node?.seconds ?? 0) } };
  if (key === 'stickerMessage') return { type: 'sticker', mimetype: node?.mimetype ?? 'image/webp', metadata: { animated: Boolean(node?.isAnimated) } };
  if (key === 'documentMessage') return { type: 'document', mimetype: node?.mimetype ?? 'application/octet-stream', fileName: node?.fileName ?? 'documento' };
  if (key.startsWith('pollCreationMessage')) {
    const options = Array.isArray(node?.options) ? node.options.map((item: any) => String(item?.optionName ?? item?.name ?? '')).filter(Boolean) : [];
    return { type: 'poll', metadata: { question: String(node?.name ?? ''), options, selectableCount: Number(node?.selectableOptionsCount ?? 1) } };
  }
  if (key === 'conversation' || key === 'extendedTextMessage') return { type: 'text' };
  return { type: 'unknown', metadata: key ? { baileysType: key } : undefined };
}

function safeName(value: string) { return value.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100); }
function extensionFor(type: IncomingMessageType, mimetype?: string, fileName?: string) {
  const original = fileName ? extname(fileName) : '';
  if (original && original.length <= 10) return original;
  const mime = String(mimetype ?? '').toLowerCase();
  if (mime.includes('webp')) return '.webp';
  if (mime.includes('png')) return '.png';
  if (mime.includes('jpeg') || mime.includes('jpg')) return '.jpg';
  if (mime.includes('mp4')) return '.mp4';
  if (mime.includes('ogg') || mime.includes('opus')) return '.ogg';
  if (mime.includes('mpeg')) return type === 'audio' ? '.mp3' : '.mpeg';
  if (mime.includes('pdf')) return '.pdf';
  return type === 'image' ? '.jpg' : type === 'video' ? '.mp4' : type === 'audio' ? '.ogg' : type === 'sticker' ? '.webp' : '.bin';
}

function deliveryStatus(raw: unknown): MessageDeliveryStatus | undefined {
  const value = Number(raw);
  if (!Number.isFinite(value)) return undefined;
  if (value === 0) return 'failed';
  if (value >= 5) return 'played';
  if (value >= 4) return 'read';
  if (value >= 3) return 'delivered';
  if (value >= 2) return 'sent';
  return undefined;
}

function receipt(result: WAMessage | undefined): MessageResult {
  if (!result?.key?.id || !result.key.remoteJid) throw new Error('Provider returned an invalid message receipt');
  return { id: result.key.id, remoteJid: result.key.remoteJid, timestamp: Date.now() };
}

function validateProxy(proxy?: string) {
  const value = proxy?.trim();
  if (!value) return undefined;
  let parsed: URL;
  try { parsed = new URL(value); } catch { throw new Error('Proxy inválido. Use http://usuario:senha@host:porta ou https://host:porta'); }
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Este build aceita proxy HTTP/HTTPS');
  return value;
}

function groupSummary(group: any, invite?: string): GroupInviteInfo {
  return { id: String(group.id), subject: String(group.subject ?? 'Grupo sem nome'), description: group.desc ?? undefined, size: Number(group.size ?? group.participants?.length ?? 0), owner: group.owner ?? undefined, inviteCode: invite, joinApprovalMode: Boolean(group.joinApprovalMode) };
}
function groupExists(groups: Record<string, any> | undefined, id: string) { return Boolean(groups && (groups[id] || Object.values(groups).some(group => group?.id === id))); }
function groupJoinError(error: unknown) {
  const value = error as { output?: { statusCode?: number; payload?: { message?: string } }; message?: string };
  const status = value?.output?.statusCode;
  const source = value?.output?.payload?.message || value?.message || String(error);
  if (status === 404) return new Error('Convite não encontrado. O link pode ter sido revogado ou expirado.');
  if (status === 409) return new Error('Esta conta já participa do grupo ou já possui uma solicitação pendente. Sincronize os grupos para confirmar.');
  if (status === 401 || status === 403) return new Error(`O WhatsApp recusou a entrada no grupo (${status}). Verifique se o convite continua válido e se o grupo exige aprovação de novos participantes.`);
  if (status === 429) return new Error('O WhatsApp limitou temporariamente tentativas de entrada em grupos. Aguarde e tente novamente mais tarde.');
  return new Error(`Não foi possível entrar no grupo${status ? ` (${status})` : ''}: ${source}`);
}

export class BaileysProvider implements MessagingProvider {
  readonly id = 'baileys';
  private socket: WASocket | null = null;
  private connected = false;
  private manuallyClosing = false;
  private events: ProviderEvents = {};
  private proxyUrl?: string;
  private readonly pollCreations = new Map<string, { remoteJid: string; question: string; message: NonNullable<WAMessage['message']> }>();
  private readonly pictureCache = new Map<string, { url?: string; expires: number }>();

  constructor(private readonly authDirectory: string, proxyUrl?: string) { this.proxyUrl = validateProxy(proxyUrl); }
  setProxy(proxyUrl?: string) { this.proxyUrl = validateProxy(proxyUrl); }

  async connect(events: ProviderEvents = {}) {
    this.events = events;
    this.manuallyClosing = false;
    events.onState?.('connecting');
    const { state, saveCreds } = await useMultiFileAuthState(this.authDirectory);
    const { version } = await fetchLatestBaileysVersion();
    const proxyAgent = this.proxyUrl ? new HttpsProxyAgent(this.proxyUrl) : undefined;
    const socket = makeWASocket({ version, auth: state, printQRInTerminal: false, logger, markOnlineOnConnect: false, syncFullHistory: false, generateHighQualityLinkPreview: false, agent: proxyAgent, fetchAgent: proxyAgent });

    this.socket = socket;
    socket.ev.on('creds.update', saveCreds);
    socket.ev.on('messages.upsert', ({ messages }) => {
      for (const message of messages) void this.emitIncoming(message);
    });
    socket.ev.on('contacts.update', updates => {
      for (const item of updates) void this.emitContact(item as any);
    });
    socket.ev.on('contacts.upsert', contacts => {
      for (const item of contacts) void this.emitContact(item as any);
    });

    socket.ev.on('messages.update', updates => {
      for (const { key, update } of updates) {
        if (key.id) {
          const rawStatus = Number((update as any).status);
          const status = deliveryStatus(rawStatus);
          if (status) {
            const rawFailureCode = status === 'failed' ? (update as any).messageStubParameters?.[0] : undefined;
            const failureCode = typeof rawFailureCode === 'undefined' || rawFailureCode === null ? '' : String(rawFailureCode).trim();
            const error = status === 'failed'
              ? failureCode ? `WhatsApp rejeitou a mensagem (código ${failureCode})` : 'WhatsApp rejeitou a mensagem'
              : undefined;
            this.events.onMessageStatus?.({ id: key.id, remoteJid: key.remoteJid ?? undefined, participant: key.participant ?? undefined, status, rawStatus, timestamp: Date.now(), error });
          }
        }
        if (!key.id || !update.pollUpdates?.length) continue;
        const creation = this.pollCreations.get(key.id);
        if (!creation) continue;
        try {
          const aggregate = getAggregateVotesInPollMessage({ message: creation.message, pollUpdates: update.pollUpdates }) as Array<{ name?: string; voters?: string[] }>;
          this.events.onPollUpdate?.({ pollId: key.id, remoteJid: key.remoteJid ?? creation.remoteJid, question: creation.question, votes: aggregate.map(item => ({ name: String(item.name ?? ''), voters: (item.voters ?? []).map(String) })) });
        } catch (error) { this.events.onError?.(error instanceof Error ? error : new Error(String(error))); }
      }
    });

    socket.ev.on('message-receipt.update', updates => {
      for (const item of updates) {
        const key = item.key;
        const receiptInfo = item.receipt as any;
        if (!key?.id || !receiptInfo) continue;
        const status: MessageDeliveryStatus | undefined = receiptInfo.playedTimestamp ? 'played' : receiptInfo.readTimestamp ? 'read' : receiptInfo.receiptTimestamp ? 'delivered' : undefined;
        if (!status) continue;
        const rawTime = Number(receiptInfo.playedTimestamp ?? receiptInfo.readTimestamp ?? receiptInfo.receiptTimestamp ?? 0);
        this.events.onMessageStatus?.({
          id: key.id,
          remoteJid: key.remoteJid ?? undefined,
          participant: receiptInfo.userJid ?? key.participant ?? undefined,
          status,
          timestamp: rawTime > 0 ? rawTime * 1000 : Date.now(),
        });
      }
    });

    socket.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
      if (qr) { events.onState?.('qr'); events.onQr?.(qr); }
      if (connection === 'open') { this.connected = true; events.onState?.('connected'); }
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

  private async emitContact(item: any) {
    const rawJid = String(item?.id ?? '').trim();
    if (!rawJid || rawJid.endsWith('@g.us') || rawJid.endsWith('@broadcast') || rawJid.includes('@newsletter')) return;
    const jid = normalizeJid(rawJid) ?? rawJid;
    const alternateJid = normalizeJid(item?.lid ?? item?.phoneNumber ?? item?.pnJid);
    if (typeof item?.imgUrl !== 'undefined') {
      this.pictureCache.delete(jid);
      if (alternateJid) this.pictureCache.delete(alternateJid);
    }
    const pushName = String(item?.notify ?? item?.name ?? item?.verifiedName ?? '').trim() || undefined;
    const profilePictureUrl = await this.profilePictureUrl(jid).catch(() => undefined);
    this.events.onContact?.({ jid, alternateJid, pushName, profilePictureUrl });
  }

  private async emitIncoming(message: WAMessage) {
    const remoteJid = message.key.remoteJid;
    if (!remoteJid || remoteJid === 'status@broadcast') return;
    const info = messageInfo(message);
    const text = messageText(message);
    if (info.type === 'unknown' && !text) return;
    let mediaPath: string | undefined;
    if (['image', 'video', 'document', 'audio', 'sticker'].includes(info.type)) {
      try { mediaPath = await this.downloadIncoming(message, info.type, info.mimetype, info.fileName); }
      catch (error) { this.events.onError?.(new Error(`Falha ao baixar mídia ${message.key.id ?? ''}: ${error instanceof Error ? error.message : String(error)}`)); }
    }
    const profilePictureUrl = await this.profilePictureUrl(remoteJid).catch(() => undefined);
    const incoming: IncomingMessage = {
      id: message.key.id ?? randomUUID(), remoteJid, remoteJidAlt: message.key.remoteJidAlt ?? undefined,
      participant: message.key.participant ?? undefined, participantAlt: message.key.participantAlt ?? undefined,
      addressingMode: message.key.addressingMode ?? undefined, pushName: message.pushName ?? undefined,
      profilePictureUrl, text, messageType: info.type, mediaPath, fileName: info.fileName,
      mimetype: info.mimetype, metadata: info.metadata, fromMe: Boolean(message.key.fromMe),
      timestamp: Number(message.messageTimestamp ?? Math.floor(Date.now() / 1000)) * 1000,
    };
    this.events.onMessage?.(incoming);
  }

  private async downloadIncoming(message: WAMessage, type: IncomingMessageType, mimetype?: string, fileName?: string) {
    const socket = this.requireSocket();
    const mediaDir = join(this.authDirectory, 'media');
    await mkdir(mediaDir, { recursive: true });
    const id = safeName(message.key.id ?? randomUUID());
    const path = join(mediaDir, `${id}${extensionFor(type, mimetype, fileName)}`);
    const buffer = await downloadMediaMessage(message, 'buffer', {}, { logger, reuploadRequest: socket.updateMediaMessage });
    await writeFile(path, buffer);
    return path;
  }

  async disconnect(logout = false) {
    this.connected = false; this.manuallyClosing = true;
    const socket = this.socket; this.socket = null;
    if (!socket) return;
    if (logout) await socket.logout().catch(() => undefined); else socket.end(new Error('Manual disconnect'));
  }
  private requireSocket() { if (!this.socket || !this.connected) throw new Error('A conta do WhatsApp não está conectada'); return this.socket; }

  private async outboundJid(remoteJid: string) {
    const normalized = userJid(remoteJid);
    if (normalized.endsWith('@g.us') || normalized.endsWith('@broadcast') || normalized.includes('@newsletter') || isLidUser(normalized)) return normalized;
    if (!isPnUser(normalized)) return normalized;
    const socket = this.requireSocket();
    const mappedLid = await socket.signalRepository.lidMapping.getLIDForPN(normalized).catch(() => undefined);
    const lid = normalizeJid(mappedLid);
    return lid && isLidUser(lid) ? lid : normalized;
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
    return { input: jid, jid: identity?.jid ?? normalized, lid: identity?.lid, pnJid: identity?.pnJid, phone: identity?.phone ?? phoneFromPnJid(identity?.pnJid), exists: true };
  }

  async profilePictureUrl(jid: string) {
    const normalized = normalizeJid(jid) ?? jid;
    const identity = await this.resolveIdentity(normalized).catch(() => undefined);
    const candidates = [...new Set([identity?.pnJid, normalized, identity?.lid, identity?.jid].filter(Boolean) as string[])];
    const now = Date.now();
    for (const candidate of candidates) {
      const cached = this.pictureCache.get(candidate);
      if (cached && cached.expires > now && cached.url) return cached.url;
    }
    const socket = this.requireSocket();
    for (const candidate of candidates) {
      const url = await socket.profilePictureUrl(candidate, 'preview').catch(() => undefined);
      this.pictureCache.set(candidate, { url, expires: Date.now() + (url ? 60 * 60 * 1000 : 30 * 1000) });
      if (url) {
        for (const alias of candidates) this.pictureCache.set(alias, { url, expires: Date.now() + 60 * 60 * 1000 });
        return url;
      }
    }
    return undefined;
  }

  async sendPresence(remoteJid: string, state: 'composing' | 'paused') {
    const jid = await this.outboundJid(remoteJid);
    await this.requireSocket().sendPresenceUpdate(state, jid);
  }

  async sendText(remoteJid: string, text: string) {
    const jid = await this.outboundJid(remoteJid);
    return receipt(await this.requireSocket().sendMessage(jid, { text }));
  }
  async sendImage(remoteJid: string, input: SendMediaInput) {
    const jid = await this.outboundJid(remoteJid);
    const image = await localMediaBuffer(input);
    return receipt(await this.requireSocket().sendMessage(jid, { image, caption: input.caption }));
  }
  async sendVideo(remoteJid: string, input: SendMediaInput) {
    const jid = await this.outboundJid(remoteJid);
    const video = await localMediaBuffer(input);
    return receipt(await this.requireSocket().sendMessage(jid, { video, caption: input.caption, mimetype: input.mimetype }));
  }
  async sendDocument(remoteJid: string, input: SendMediaInput) {
    const jid = await this.outboundJid(remoteJid);
    const document = await localMediaBuffer(input);
    return receipt(await this.requireSocket().sendMessage(jid, { document, caption: input.caption, fileName: input.fileName, mimetype: input.mimetype ?? 'application/octet-stream' }));
  }
  async sendAudio(remoteJid: string, input: SendMediaInput) {
    const jid = await this.outboundJid(remoteJid);
    const audio = await localMediaBuffer(input);
    return receipt(await this.requireSocket().sendMessage(jid, { audio, mimetype: input.mimetype ?? 'audio/mpeg', ptt: input.ptt ?? false }));
  }
  async sendSticker(remoteJid: string, input: SendMediaInput) {
    const jid = await this.outboundJid(remoteJid);
    const sticker = await localMediaBuffer(input);
    return receipt(await this.requireSocket().sendMessage(jid, { sticker }));
  }
  async sendLocation(remoteJid: string, input: LocationInput) {
    const jid = await this.outboundJid(remoteJid);
    return receipt(await this.requireSocket().sendMessage(jid, { location: { degreesLatitude: input.latitude, degreesLongitude: input.longitude, name: input.name, address: input.address } }));
  }
  async sendContact(remoteJid: string, input: ContactCardInput) {
    const jid = await this.outboundJid(remoteJid);
    const phone = digits(input.phone);
    const vcard = ['BEGIN:VCARD', 'VERSION:3.0', `FN:${input.displayName}`, input.organization ? `ORG:${input.organization}` : undefined, `TEL;type=CELL;type=VOICE;waid=${phone}:+${phone}`, 'END:VCARD'].filter(Boolean).join('\n');
    return receipt(await this.requireSocket().sendMessage(jid, { contacts: { displayName: input.displayName, contacts: [{ displayName: input.displayName, vcard }] } }));
  }
  async sendPoll(remoteJid: string, input: PollInput) {
    const jid = await this.outboundJid(remoteJid);
    const result = await this.requireSocket().sendMessage(jid, { poll: { name: input.name, values: input.values, selectableCount: input.selectableCount ?? 1 } });
    if (result?.key.id && result.message) this.pollCreations.set(result.key.id, { remoteJid: result.key.remoteJid ?? jid, question: input.name, message: result.message });
    return receipt(result);
  }

  async checkNumbers(numbers: string[]): Promise<ContactPresence[]> {
    const socket = this.requireSocket();
    const unique = [...new Set(numbers.map(digits).filter(Boolean))];
    const result = await socket.onWhatsApp(...unique);
    const byNumber = new Map((result ?? []).map(item => [digits(item.jid), item]));
    const output: ContactPresence[] = [];
    for (const input of unique) {
      const match = byNumber.get(input);
      if (!match?.exists) { output.push({ input, exists: false }); continue; }
      const resolved = await this.resolveIdentity(match.jid);
      output.push({ ...resolved, input, exists: true, phone: resolved.phone ?? input });
    }
    return output;
  }

  async listGroups(): Promise<GroupSummary[]> {
    const groups = await this.requireSocket().groupFetchAllParticipating();
    return Object.values(groups).map(group => ({ id: group.id, subject: group.subject, description: group.desc, size: group.participants.length, owner: group.owner })).sort((a, b) => a.subject.localeCompare(b.subject));
  }
  async getGroupMetadata(groupJid: string) {
    const group = await this.requireSocket().groupMetadata(groupJid);
    const participants: GroupParticipantIdentity[] = [];
    for (const participant of group.participants) {
      const resolved = await this.resolveIdentity(participant.id, participant.phoneNumber ?? participant.lid);
      participants.push({ jid: resolved.jid ?? participant.id, lid: resolved.lid ?? participant.lid, pnJid: resolved.pnJid ?? participant.phoneNumber, phone: resolved.phone ?? phoneFromPnJid(participant.phoneNumber), admin: participant.admin });
    }
    return { id: group.id, subject: group.subject, description: group.desc, size: group.participants.length, owner: group.owner, participants };
  }
  async createGroup(subject: string, participants: string[]) {
    const group = await this.requireSocket().groupCreate(subject, participants.map(userJid));
    return { id: group.id, subject: group.subject, description: group.desc, size: group.participants.length, owner: group.owner };
  }
  async addGroupParticipants(groupJid: string, participants: string[]): Promise<Array<{ jid: string; status: string }>> {
    const normalized = participants.map(userJid);
    const result = await this.requireSocket().groupParticipantsUpdate(groupJid, normalized, 'add');
    return result.map((item, index) => ({ jid: item.jid ?? normalized[index] ?? '', status: item.status })).filter(item => Boolean(item.jid));
  }

  async joinGroup(invite: string): Promise<GroupJoinResult> {
    const socket = this.requireSocket(); const code = inviteCode(invite);
    const rawInfo = await socket.groupGetInviteInfo(code); const info = groupSummary(rawInfo, code);
    const before = await socket.groupFetchAllParticipating().catch(() => undefined);
    if (groupExists(before, info.id)) return { ...info, status: 'already_member' };
    try {
      const joinedJid = await socket.groupAcceptInvite(code);
      if (joinedJid) {
        const finalId = String(joinedJid);
        const metadata = await socket.groupMetadata(finalId).catch(() => undefined);
        return { ...(metadata ? groupSummary(metadata, code) : info), id: finalId, status: 'joined' };
      }
      const after = await socket.groupFetchAllParticipating().catch(() => undefined);
      if (groupExists(after, info.id)) return { ...info, status: 'joined' };
      if (info.joinApprovalMode) return { ...info, status: 'approval_required' };
      throw new Error('O WhatsApp aceitou a solicitação, mas não confirmou a entrada no grupo. Sincronize os grupos e tente novamente.');
    } catch (error) {
      const after = await socket.groupFetchAllParticipating().catch(() => undefined);
      if (groupExists(after, info.id)) return { ...info, status: 'joined' };
      throw groupJoinError(error);
    }
  }
  async verifyGroupInvite(invite: string): Promise<GroupInviteInfo> { const code = inviteCode(invite); return groupSummary(await this.requireSocket().groupGetInviteInfo(code), code); }
  async getGroupInvite(groupJid: string) { const code = await this.requireSocket().groupInviteCode(groupJid); if (!code) throw new Error('Não foi possível obter o convite do grupo'); return `https://chat.whatsapp.com/${code}`; }
  isConnected() { return this.connected; }
  getSelfJid() { return this.socket?.user?.id ? jidNormalizedUser(this.socket.user.id) : undefined; }
}

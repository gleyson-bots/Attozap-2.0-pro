import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  getAggregateVotesInPollMessage,
  isLidUser,
  isPnUser,
  jidNormalizedUser,
  useMultiFileAuthState,
  type WAMessage,
  type WASocket,
} from '@whiskeysockets/baileys';
import { HttpsProxyAgent } from 'https-proxy-agent';
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
  if (!clean) throw new Error('Informe um link ou código de convite do grupo');

  // Accept a full URL pasted on its own or inside a message, with optional query/hash.
  const link = clean.match(/(?:https?:\/\/)?chat\.whatsapp\.com\/([A-Za-z0-9_-]{8,128})/i);
  const candidate = link?.[1] ?? clean.replace(/[?#].*$/, '').trim();
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(candidate)) {
    throw new Error('Convite de grupo inválido. Use https://chat.whatsapp.com/CODIGO ou somente o código do convite.');
  }
  return candidate;
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

function validateProxy(proxy?: string) {
  const value = proxy?.trim();
  if (!value) return undefined;
  let parsed: URL;
  try { parsed = new URL(value); }
  catch { throw new Error('Proxy inválido. Use http://usuario:senha@host:porta ou https://host:porta'); }
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Este build aceita proxy HTTP/HTTPS');
  return value;
}

function groupSummary(group: any, invite?: string): GroupInviteInfo {
  return {
    id: String(group.id),
    subject: String(group.subject ?? 'Grupo sem nome'),
    description: group.desc ?? undefined,
    size: Number(group.size ?? group.participants?.length ?? 0),
    owner: group.owner ?? undefined,
    inviteCode: invite,
    joinApprovalMode: Boolean(group.joinApprovalMode),
  };
}

function groupExists(groups: Record<string, any> | undefined, id: string) {
  if (!groups) return false;
  if (groups[id]) return true;
  return Object.values(groups).some(group => group?.id === id);
}

function groupJoinError(error: unknown) {
  const value = error as { output?: { statusCode?: number; payload?: { message?: string } }; data?: unknown; message?: string };
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

  constructor(private readonly authDirectory: string, proxyUrl?: string) {
    this.proxyUrl = validateProxy(proxyUrl);
  }

  setProxy(proxyUrl?: string) {
    this.proxyUrl = validateProxy(proxyUrl);
  }

  async connect(events: ProviderEvents = {}) {
    this.events = events;
    this.manuallyClosing = false;
    events.onState?.('connecting');
    const { state, saveCreds } = await useMultiFileAuthState(this.authDirectory);
    const { version } = await fetchLatestBaileysVersion();
    const proxyAgent = this.proxyUrl ? new HttpsProxyAgent(this.proxyUrl) : undefined;

    const socket = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: false,
      logger: P({ level: 'silent' }),
      markOnlineOnConnect: false,
      syncFullHistory: false,
      generateHighQualityLinkPreview: false,
      agent: proxyAgent,
      fetchAgent: proxyAgent,
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

    socket.ev.on('messages.update', updates => {
      for (const { key, update } of updates) {
        if (!key.id || !update.pollUpdates?.length) continue;
        const creation = this.pollCreations.get(key.id);
        if (!creation) continue;
        try {
          const aggregate = getAggregateVotesInPollMessage({
            message: creation.message,
            pollUpdates: update.pollUpdates,
          }) as Array<{ name?: string; voters?: string[] }>;
          this.events.onPollUpdate?.({
            pollId: key.id,
            remoteJid: key.remoteJid ?? creation.remoteJid,
            question: creation.question,
            votes: aggregate.map(item => ({ name: String(item.name ?? ''), voters: (item.voters ?? []).map(String) })),
          });
        } catch (error) {
          this.events.onError?.(error instanceof Error ? error : new Error(String(error)));
        }
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
    const result = await this.requireSocket().sendMessage(userJid(remoteJid), {
      poll: { name: input.name, values: input.values, selectableCount: input.selectableCount ?? 1 },
    });
    if (result?.key.id && result.message) {
      this.pollCreations.set(result.key.id, { remoteJid: result.key.remoteJid ?? userJid(remoteJid), question: input.name, message: result.message });
    }
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

  async joinGroup(invite: string): Promise<GroupJoinResult> {
    const socket = this.requireSocket();
    const code = inviteCode(invite);

    // Validate first. Besides producing a useful error for revoked links, this also
    // tells us whether the group uses membership approval before we attempt entry.
    const rawInfo = await socket.groupGetInviteInfo(code);
    const info = groupSummary(rawInfo, code);
    const before = await socket.groupFetchAllParticipating().catch(() => undefined);
    if (groupExists(before, info.id)) return { ...info, status: 'already_member' };

    try {
      const joinedJid = await socket.groupAcceptInvite(code);
      if (joinedJid) {
        const finalId = String(joinedJid);
        // Metadata query confirms the server accepted the membership. Failure here is
        // non-fatal because groupAcceptInvite already returned a group JID.
        const metadata = await socket.groupMetadata(finalId).catch(() => undefined);
        return {
          ...(metadata ? groupSummary(metadata, code) : info),
          id: finalId,
          status: 'joined',
        };
      }

      // Approval-enabled groups may acknowledge the invite without returning a group
      // JID immediately. Treat that as pending approval instead of a false failure.
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

  async verifyGroupInvite(invite: string): Promise<GroupInviteInfo> {
    const code = inviteCode(invite);
    const group = await this.requireSocket().groupGetInviteInfo(code);
    return groupSummary(group, code);
  }

  async getGroupInvite(groupJid: string) {
    const code = await this.requireSocket().groupInviteCode(groupJid);
    if (!code) throw new Error('Não foi possível obter o convite do grupo');
    return `https://chat.whatsapp.com/${code}`;
  }

  isConnected() { return this.connected; }
  getSelfJid() { return this.socket?.user?.id ? jidNormalizedUser(this.socket.user.id) : undefined; }
}

import { useEffect, useMemo, useRef, useState } from 'react';
import { Bot, Check, ClipboardPaste, ContactRound, Download, File as FileIcon, FileUp, ImagePlus, MapPin, Maximize2, MessageCircle, Mic, Paperclip, Plus, RefreshCw, Search, Send, Settings2, Smile, Sparkles, Square, Vote, Wand2, Wifi, X } from 'lucide-react';
import { toLocalDateTime } from '../lib';

function labelFor(chat: any) {
  const candidates = [chat?.display_name, chat?.contact_name, chat?.name].map(value => String(value ?? '').trim());
  const human = candidates.find(value => value && !value.includes('@') && !/^\+?[\d\s().-]{6,}$/.test(value));
  return human || (chat?.phone ? `+${chat.phone}` : chat?.is_group ? (chat?.jid || 'Grupo') : 'Contacto a sincronizar');
}
function fileName(path?: string) { const value = String(path ?? ''); return value.split(/[\\/]/).pop() ?? value; }
function aliases(chat: any) { return new Set([chat?.jid, chat?.lid, chat?.pn_jid, chat?.remote_jid, chat?.remoteJid].filter(Boolean)); }
function sameIdentity(a: any, b: any) { const aa = aliases(a); return [...aliases(b)].some(value => aa.has(value)); }
function epochMs(value: unknown) {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (Number.isFinite(numeric) && numeric > 0) return numeric < 1_000_000_000_000 ? numeric * 1000 : numeric;
  const parsed = Date.parse(String(value ?? ''));
  return Number.isFinite(parsed) ? parsed : Date.now();
}
function messageTime(message: any) { return epochMs(message?.created_at); }
function messageStatusLabel(status?: string) {
  const labels: Record<string, string> = { pending: 'enviando…', sent: 'enviada', delivered: 'entregue', read: 'lida', played: 'reproduzida', failed: 'falhou' };
  return labels[String(status ?? '')] ?? String(status ?? '');
}
function recordingErrorMessage(error: unknown) {
  const name = String((error as { name?: unknown })?.name ?? '');
  const message = String((error as { message?: unknown })?.message ?? error ?? '');
  if (name === 'NotFoundError' || /requested device not found|device not found|no such device/i.test(message)) return 'Nenhum microfone disponível. Conecte um microfone ou selecione um dispositivo de entrada ativo no Windows e tente novamente.';
  if (name === 'NotAllowedError' || /permission|denied|not allowed/i.test(message)) return 'O acesso ao microfone foi bloqueado. Autorize o microfone para o ATTOZAP nas permissões do Windows e tente novamente.';
  if (name === 'NotReadableError' || /could not start|in use|busy/i.test(message)) return 'O microfone está ocupado por outro aplicativo ou não pôde ser iniciado. Feche o outro aplicativo e tente novamente.';
  if (name === 'OverconstrainedError') return 'O microfone selecionado não está disponível. O ATTOZAP tentará usar o dispositivo padrão na próxima tentativa.';
  return message || 'Não foi possível iniciar a gravação. Verifique o microfone e as permissões do Windows.';
}

function blobAsBase64(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('Não foi possível ler o áudio gravado'));
    reader.onloadend = () => resolve(String(reader.result ?? '').split(',').pop() ?? '');
    reader.readAsDataURL(blob);
  });
}
function orderMessages(rows: any[]) {
  const byId = new Map<string, any>();
  for (const row of rows) {
    const key = String(row?.id ?? `${row?.remote_jid}-${row?.created_at}-${row?.direction}`);
    const previous = byId.get(key);
    if (!previous) { byId.set(key, row); continue; }
    const persisted = Number(row?._seq ?? 0) > 0;
    byId.set(key, {
      ...previous,
      ...row,
      metadata: {
        ...(previous.metadata ?? {}),
        ...(row.metadata ?? {}),
        ...(persisted ? { optimistic: false } : {}),
      },
      _local_seq: Math.min(Number(previous?._local_seq ?? Number.MAX_SAFE_INTEGER), Number(row?._local_seq ?? Number.MAX_SAFE_INTEGER)),
    });
  }
  return [...byId.values()].sort((a, b) => {
    const time = messageTime(a) - messageTime(b);
    if (time !== 0) return time;
    const seqA = Number(a?._seq ?? a?._local_seq ?? 0);
    const seqB = Number(b?._seq ?? b?._local_seq ?? 0);
    if (seqA !== seqB) return seqA - seqB;
    return String(a?.id ?? '').localeCompare(String(b?.id ?? ''));
  });
}
function payloadMatchesSelected(payload: any, selected: any) {
  if (!selected) return false;
  const wanted = aliases(selected);
  const message = payload?.message ?? {};
  const identity = payload?.identity ?? {};
  return [message.remoteJid, message.remoteJidAlt, identity.jid, identity.lid, identity.pnJid].filter(Boolean).some(value => wanted.has(value));
}
function Avatar({ chat, large = false, onBroken }: { chat: any; large?: boolean; onBroken?: () => void }) {
  const label = String(labelFor(chat)).slice(0, 1).toUpperCase();
  const [failedUrl, setFailedUrl] = useState('');
  const profileUrl = String(chat?.profile_url || '');
  const showImage = Boolean(profileUrl) && failedUrl !== profileUrl;
  useEffect(() => {
    if (failedUrl && failedUrl !== profileUrl) setFailedUrl('');
  }, [failedUrl, profileUrl]);
  return <span className={`conversation-avatar ${large ? 'large' : ''}`}>{showImage ? <img src={profileUrl} alt="" onError={() => { setFailedUrl(profileUrl); onBroken?.(); }}/> : label}</span>;
}
type LightboxMedia = { url: string; type: 'image' | 'video'; name: string };
type PendingMedia = { path: string; fileName: string; type: 'image' | 'video' | 'document' | 'audio' | 'sticker'; mimetype: string; dataUrl: string; size: number };
type MediaDimensions = { width: number; height: number };

function MessageBody({ message, onOpenMedia }: { message: any; onOpenMedia: (media: LightboxMedia) => void }) {
  const type = String(message?.message_type ?? 'text');
  const url = message?.media_url;
  const metadata = message?.metadata && typeof message.metadata === 'object' ? message.metadata : {};
  const mediaName = String(message?.file_name || (type === 'video' ? 'Vídeo' : type === 'sticker' ? 'Figurinha.webp' : 'Imagem'));
  const pendingMedia = !url && ['image', 'video', 'audio', 'document', 'sticker'].includes(type);
  const pendingLabel = type === 'sticker' ? 'A carregar figurinha…' : type === 'audio' ? 'A preparar áudio…' : type === 'video' ? 'A preparar vídeo…' : type === 'document' ? 'A preparar documento…' : 'A carregar imagem…';
  const pollOptions = Array.isArray(metadata.options) ? metadata.options.map((option: unknown) => String(option ?? '').trim()).filter(Boolean) : [];
  const latitude = Number(metadata.latitude ?? metadata.degreesLatitude);
  const longitude = Number(metadata.longitude ?? metadata.degreesLongitude);
  const hasCoordinates = Number.isFinite(latitude) && Number.isFinite(longitude);
  const mapUrl = hasCoordinates ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${latitude},${longitude}`)}` : '';
  const contactName = String(metadata.displayName ?? metadata.name ?? message?.text ?? 'Contacto partilhado').trim();
  const contactPhone = String(metadata.phone ?? '').trim();
  const contactOrg = String(metadata.organization ?? '').trim();
  return <>
    {pendingMedia && <div className="chat-media-pending" role="status" aria-live="polite"><span>{pendingLabel}</span></div>}
    {type === 'image' && url && <div className="chat-media-preview chat-image-preview"><button type="button" className="chat-media-trigger" onClick={() => onOpenMedia({ url, type: 'image', name: mediaName })} title="Abrir imagem em ecrã inteiro"><img className="chat-image" src={url} alt={message?.text || 'Imagem'}/></button><button type="button" className="chat-media-expand" onClick={() => onOpenMedia({ url, type: 'image', name: mediaName })} title="Ampliar imagem" aria-label="Ampliar imagem"><Maximize2 size={15}/></button></div>}
    {type === 'sticker' && url && <button type="button" className="chat-media-trigger chat-sticker-trigger" onClick={() => onOpenMedia({ url, type: 'image', name: mediaName || 'Figurinha.webp' })} title="Ampliar figurinha"><img className="chat-sticker" src={url} alt="Figurinha"/></button>}
    {type === 'video' && url && <div className="chat-media-preview chat-video-preview"><video className="chat-video" src={url} controls preload="metadata"/><button type="button" className="chat-media-expand" onClick={() => onOpenMedia({ url, type: 'video', name: mediaName })} title="Abrir vídeo em ecrã inteiro" aria-label="Abrir vídeo em ecrã inteiro"><Maximize2 size={15}/></button></div>}
    {type === 'audio' && url && <audio className="chat-audio" src={url} controls preload="metadata"/>}
    {type === 'document' && <div className="chat-document"><FileIcon size={22}/><div><b>{message?.file_name || 'Documento'}</b><small>{message?.mimetype || 'arquivo'}</small></div>{url && <a href={url} target="_blank" rel="noreferrer">Abrir</a>}</div>}
    {type === 'location' && <div className="chat-location"><MapPin size={20}/><div><b>{String(metadata.name ?? message?.text ?? 'Localização')}</b>{metadata.address && <small>{String(metadata.address)}</small>}{hasCoordinates && <small>{latitude.toFixed(6)}, {longitude.toFixed(6)}</small>}{mapUrl && <a href={mapUrl} target="_blank" rel="noreferrer">Abrir no mapa</a>}</div></div>}
    {type === 'contact' && <div className="chat-contact"><ContactRound size={20}/><div><b>{contactName}</b>{contactPhone && <a href={`tel:${contactPhone}`}>{contactPhone}</a>}{contactOrg && <small>{contactOrg}</small>}</div></div>}
    {type === 'poll' && <div className="chat-poll"><div><Vote size={18}/><b>{String(metadata.question ?? message?.text ?? 'Enquete')}</b></div>{pollOptions.map((option: string, index: number) => <span key={`${option}-${index}`}>{option}</span>)}</div>}
    {message?.text && !['poll', 'location', 'contact'].includes(type) && <div className="chat-text">{String(message.text)}</div>}
    {!message?.text && !url && !pendingMedia && !['document','poll','location','contact'].includes(type) && <div className="chat-text muted">{metadata.mediaError ? 'Não foi possível carregar esta mídia.' : `[${type}]`}</div>}
  </>;
}

type QuickChatRequest = { target: string; accountId: string; nonce: number };

export function WebChatPage({ accounts, reloadAccounts, quickRequest, onQuickRequestConsumed }: { accounts: any[]; reloadAccounts: () => Promise<void>; quickRequest?: QuickChatRequest | null; onQuickRequestConsumed?: () => void }) {
  const connected = accounts.filter(account => account.status === 'connected');
  const [accountId, setAccountId] = useState(connected[0]?.id ?? '');
  const [search, setSearch] = useState('');
  const [chats, setChats] = useState<any[]>([]);
  const [selected, setSelected] = useState<any | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [text, setText] = useState('');
  const [pendingMedia, setPendingMedia] = useState<PendingMedia | null>(null);
  const [pendingDimensions, setPendingDimensions] = useState<MediaDimensions | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [showAiMenu, setShowAiMenu] = useState(false);
  const [aiProviders, setAiProviders] = useState<AttozapAiProvider[]>([]);
  const [aiAction, setAiAction] = useState<'correct' | 'shorten' | 'expand' | 'context'>('correct');
  const [aiContext, setAiContext] = useState('');
  const [newTarget, setNewTarget] = useState('');
  const [proxy, setProxy] = useState('');
  const [showProxy, setShowProxy] = useState(false);
  const [showPoll, setShowPoll] = useState(false);
  const [showLocation, setShowLocation] = useState(false);
  const [showContact, setShowContact] = useState(false);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollOptions, setPollOptions] = useState('Sim\nNão');
  const [locationLat, setLocationLat] = useState('');
  const [locationLng, setLocationLng] = useState('');
  const [locationName, setLocationName] = useState('');
  const [locationAddress, setLocationAddress] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactOrg, setContactOrg] = useState('');
  const [busy, setBusy] = useState(false);
  const [syncingContact, setSyncingContact] = useState(false);
  const [error, setError] = useState('');
  const [newTargetState, setNewTargetState] = useState<'idle' | 'resolving' | 'resolved' | 'invalid'>('idle');
  const [resolvedNewTarget, setResolvedNewTarget] = useState<any | null>(null);
  const [restriction, setRestriction] = useState<any>(null);
  const [lightbox, setLightbox] = useState<LightboxMedia | null>(null);
  const bottom = useRef<HTMLDivElement | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const lastAutoScroll = useRef(0);
  const messageLoadGeneration = useRef(0);
  const localSequence = useRef(0);
  const reconcileTimer = useRef<number | null>(null);
  const chatRefreshTimer = useRef<number | null>(null);
  const resolveGeneration = useRef(0);
  const quickOpenNonce = useRef(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordingStreamRef = useRef<MediaStream | null>(null);
  const recordingChunksRef = useRef<Blob[]>([]);
  const recordingStartedAtRef = useRef(0);

  useEffect(() => {
    const element = composerRef.current;
    if (!element) return;
    element.style.height = 'auto';
    element.style.height = `${Math.min(200, Math.max(72, element.scrollHeight))}px`;
  }, [text]);

  useEffect(() => {
    void window.attozap.ai.providers().then(rows => setAiProviders(Array.isArray(rows) ? rows : [])).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!lightbox) return;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') setLightbox(null); };
    window.addEventListener('keydown', onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [lightbox]);

  useEffect(() => {
    const available = connected.find(account => account.id === accountId);
    if (!available && connected[0]) setAccountId(connected[0].id);
    const current = accounts.find(account => account.id === accountId);
    setProxy(current?.proxy ?? '');
  }, [accounts, accountId]);

  useEffect(() => {
    if (!quickRequest?.target || !quickRequest.accountId || quickRequest.nonce === quickOpenNonce.current) return;
    quickOpenNonce.current = quickRequest.nonce;
    setAccountId(quickRequest.accountId);
    setSearch('');
    setSelected(null);
    setMessages([]);
    setError('');
    setNewTarget(quickRequest.target);
  }, [quickRequest?.nonce]);

  async function refreshRestriction() {
    if (!accountId || !window.attozap.accounts.restriction) return;
    try {
      const result = await window.attozap.accounts.restriction(accountId);
      setRestriction(result?.restriction ?? null);
    } catch { setRestriction(null); }
  }

  useEffect(() => {
    const requested = newTarget.trim();
    const generation = ++resolveGeneration.current;
    if (!accountId || !requested) {
      setNewTargetState('idle');
      setResolvedNewTarget(null);
      return;
    }
    const phone = requested.replace(/\D/g, '');
    if (!requested.includes('@') && phone.length < 6) {
      setNewTargetState('invalid');
      setResolvedNewTarget(null);
      return;
    }
    setNewTargetState('resolving');
    setResolvedNewTarget(null);
    const timer = window.setTimeout(() => {
      void window.attozap.webchat.resolve(accountId, requested).then((identity: any) => {
        if (generation !== resolveGeneration.current) return;
        if (!identity?.exists || !identity?.jid) throw new Error('O WhatsApp não devolveu um JID/LID válido');
        setResolvedNewTarget({ ...identity, query: requested });
        setNewTargetState('resolved');
        setError('');
      }).catch((cause: any) => {
        if (generation !== resolveGeneration.current) return;
        setNewTargetState('invalid');
        setResolvedNewTarget(null);
        setError(cause?.message ?? String(cause));
      });
    }, 420);
    return () => window.clearTimeout(timer);
  }, [accountId, newTarget]);

  useEffect(() => {
    if (!accountId) { setRestriction(null); return; }
    let cancelled = false;
    void window.attozap.accounts.restriction?.(accountId).then((result: any) => {
      if (!cancelled) setRestriction(result?.restriction ?? null);
    }).catch(() => undefined);
    const offRestriction = window.attozap.accounts.onRestriction?.((payload: any) => {
      if (!cancelled && payload?.accountId === accountId) setRestriction(payload);
    });
    return () => { cancelled = true; offRestriction?.(); };
  }, [accountId]);

  function scrollToBottom(force = false) {
    const now = Date.now();
    if (!force && now - lastAutoScroll.current < 120) return;
    lastAutoScroll.current = now;
    setTimeout(() => bottom.current?.scrollIntoView({ block: 'end', behavior: force ? 'smooth' : 'auto' }), 20);
  }

  async function loadChats() {
    if (!accountId) { setChats([]); return; }
    try {
      const data = await window.attozap.webchat.list(accountId, search);
      setChats(data);
      // Resolve against the latest selected state rather than the value captured when
      // this async request started. This prevents a refresh from restoring the old
      // conversation after a new-target send has already selected another identity.
      setSelected((current: any) => {
        if (!current) return current;
        const fresh = data.find((item: any) => sameIdentity(item, current));
        return fresh ?? current;
      });
      setError('');
    } catch (e: any) { setError(e?.message ?? String(e)); }
  }

  function refreshAvatar(chat: any) {
    if (!accountId || !chat?.jid || !window.attozap.webchat.refreshProfile) return;
    void window.attozap.webchat.refreshProfile(accountId, chat.jid).then((profile: any) => {
      if (!profile) return;
      const identity = profile.identity ?? {};
      const probe = { jid: profile.jid, lid: identity.lid, pn_jid: identity.pnJid };
      setSelected((current: any) => current && sameIdentity(current, probe)
        ? { ...current, display_name: profile.displayName || current.display_name, profile_url: profile.profilePictureUrl || current.profile_url, phone: profile.phone || current.phone, lid: identity.lid ?? current.lid, pn_jid: identity.pnJid ?? current.pn_jid }
        : current);
      void loadChats();
    }).catch(() => undefined);
  }

  async function syncSelectedContact() {
    if (!accountId || !selected?.jid || !window.attozap.webchat.syncContact) return;
    setSyncingContact(true); setError('');
    try {
      const profile = await window.attozap.webchat.syncContact(accountId, selected.jid);
      const identity = profile?.identity ?? {};
      const probe = { jid: profile?.jid, lid: identity.lid, pn_jid: identity.pnJid };
      setSelected((current: any) => current && sameIdentity(current, probe)
        ? { ...current, display_name: profile?.displayName || current.display_name, profile_url: profile?.profilePictureUrl || current.profile_url, phone: profile?.phone || current.phone, lid: identity.lid ?? current.lid, pn_jid: identity.pnJid ?? current.pn_jid }
        : current);
      await loadChats();
      if (!profile?.synced && profile?.syncReason) setError(profile.syncReason);
    } catch (e: any) { setError(e?.message ?? String(e)); }
    finally { setSyncingContact(false); }
  }

  async function loadMessages(jid = selected?.jid, autoScroll = true) {
    if (!accountId || !jid) { setMessages([]); return; }
    const generation = ++messageLoadGeneration.current;
    try {
      const rows = await window.attozap.webchat.messages(accountId, jid, 500);
      if (generation !== messageLoadGeneration.current) return;
      setMessages(current => orderMessages([...current.filter(item => item?.metadata?.optimistic), ...rows]));
      if (autoScroll) scrollToBottom();
    } catch (e: any) {
      if (generation === messageLoadGeneration.current) setError(e?.message ?? String(e));
    }
  }

  function scheduleReconcile(jid: string, delay = 50) {
    if (reconcileTimer.current) window.clearTimeout(reconcileTimer.current);
    reconcileTimer.current = window.setTimeout(() => { reconcileTimer.current = null; void loadMessages(jid, true); }, delay);
  }

  function scheduleChatsRefresh(delay = 120) {
    if (chatRefreshTimer.current) window.clearTimeout(chatRefreshTimer.current);
    chatRefreshTimer.current = window.setTimeout(() => { chatRefreshTimer.current = null; void loadChats(); }, delay);
  }

  function appendOptimistic(message: any) {
    const sequence = ++localSequence.current;
    setMessages(current => {
      const persisted = current.find(item => item?.id === message.id && !item?.metadata?.optimistic);
      if (persisted) return current;
      return orderMessages([...current.filter(item => item?.id !== message.id), {
        ...message,
        _local_seq: sequence,
        metadata: { ...(message.metadata ?? {}), optimistic: true },
      }]);
    });
    scrollToBottom(true);
  }

  useEffect(() => { void loadChats(); }, [accountId, search]);
  useEffect(() => {
    messageLoadGeneration.current++;
    setMessages(current => selected ? current.filter(item => item?.metadata?.optimistic && sameIdentity(item, selected)) : []);
    if (selected?.jid) void loadMessages(selected.jid, true);
  }, [accountId, selected?.jid]);

  useEffect(() => {
    if (!quickRequest?.target || quickRequest.accountId !== accountId || newTargetState !== 'resolved' || !resolvedNewTarget?.jid || resolvedNewTarget.query !== newTarget.trim()) return;
    const identity = resolvedNewTarget;
    setSelected({ jid: identity.jid, lid: identity.lid, pn_jid: identity.pnJid, phone: identity.phone, display_name: identity.displayName || identity.pushName || identity.phone || quickRequest.target });
    setNewTarget('');
    setError('');
    onQuickRequestConsumed?.();
  }, [accountId, newTarget, newTargetState, quickRequest?.accountId, quickRequest?.target, resolvedNewTarget, onQuickRequestConsumed]);

  useEffect(() => {
    if (!accountId || !selected?.jid || !window.attozap.webchat.refreshProfile) return;
    let cancelled = false;
    void window.attozap.webchat.refreshProfile(accountId, selected.jid).then((profile: any) => {
      if (cancelled || !profile) return;
      const identity = profile.identity ?? {};
      const probe = { jid: profile.jid, lid: identity.lid, pn_jid: identity.pnJid };
      setSelected((current: any) => current && sameIdentity(current, probe)
        ? { ...current, display_name: profile.displayName || current.display_name, profile_url: profile.profilePictureUrl || current.profile_url, phone: profile.phone || current.phone, lid: identity.lid ?? current.lid, pn_jid: identity.pnJid ?? current.pn_jid }
        : current);
      void loadChats();
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [accountId, selected?.jid]);

  useEffect(() => {
    if (!recording) return;
    const timer = window.setInterval(() => setRecordingSeconds(Math.max(0, Math.floor((Date.now() - recordingStartedAtRef.current) / 1000))), 250);
    return () => window.clearInterval(timer);
  }, [recording]);

  useEffect(() => () => {
    recorderRef.current?.stop();
    recordingStreamRef.current?.getTracks().forEach(track => track.stop());
    recorderRef.current = null;
    recordingStreamRef.current = null;
  }, []);

  useEffect(() => {
    const offIncoming = window.attozap.messages.onIncoming((payload: any) => {
      if (payload?.accountId !== accountId) return;
      const row = payload?.persisted;
      const rowMatches = row?.remote_jid && selected ? aliases(selected).has(row.remote_jid) : false;
      if (row?.id && (!selected || payloadMatchesSelected(payload, selected) || rowMatches)) {
        setMessages(current => orderMessages([...current.filter(item => item?.id !== row.id), row]));
        scrollToBottom(true);
      }
      // A lista é atualizada em segundo plano; nunca bloqueia a thread ou o compositor.
      scheduleChatsRefresh();
      if (selected?.jid && payloadMatchesSelected(payload, selected) && !row) scheduleReconcile(selected.jid, 80);
    });
    const offStatus = window.attozap.messages.onStatus((payload: any) => {
      if (payload?.accountId !== accountId || !payload?.id) return;
      setMessages(current => orderMessages(current.map(message => message.id === payload.id ? { ...message, status: payload.status, error: payload.status === 'failed' ? (payload.error || message.error) : undefined } : message)));
      if (payload.status === 'failed') {
        if (payload.failureClass === 'account_restriction' || payload.failureCode === '463') {
          setRestriction((current: any) => current ?? { isActive: true, checkedAt: Date.now() });
        }
        setError(payload.error || 'O WhatsApp rejeitou a mensagem.');
      }
    });
    const offProfile = window.attozap.messages.onProfile?.((payload: any) => {
      if (payload?.accountId !== accountId) return;
      scheduleChatsRefresh();
      if (!selected) return;
      const identity = payload?.identity ?? {};
      const probe = { jid: payload?.jid ?? identity.jid, lid: identity.lid, pn_jid: identity.pnJid };
      if (sameIdentity(selected, probe)) setSelected((current: any) => ({ ...current, display_name: payload?.pushName || current?.display_name, profile_url: payload?.profilePictureUrl || current?.profile_url, phone: identity.phone || current?.phone, lid: identity.lid ?? current?.lid, pn_jid: identity.pnJid ?? current?.pn_jid }));
    });
    return () => {
      offIncoming?.(); offStatus?.(); offProfile?.();
      if (reconcileTimer.current) window.clearTimeout(reconcileTimer.current);
      if (chatRefreshTimer.current) window.clearTimeout(chatRefreshTimer.current);
      reconcileTimer.current = null;
      chatRefreshTimer.current = null;
    };
  }, [accountId, selected?.jid, selected?.lid, selected?.pn_jid]);

  // Event-first: o polling existe somente como reconciliação de segurança caso um evento
  // tenha ocorrido antes do renderer assinar o canal ou durante suspensão da janela.
  useEffect(() => {
    if (!accountId) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      void loadChats();
      if (selected?.jid) void loadMessages(selected.jid, false);
    }, 5000);
    return () => window.clearInterval(timer);
  }, [accountId, selected?.jid, search]);

  const activeAccount = useMemo(() => accounts.find(account => account.id === accountId), [accounts, accountId]);
  const typedTarget = newTarget.trim();
  const verifiedNewTarget = typedTarget && newTargetState === 'resolved' && resolvedNewTarget?.query === typedTarget ? resolvedNewTarget : null;
  const target = verifiedNewTarget?.jid ?? (!typedTarget ? selected?.jid ?? '' : '');

  async function openNewTarget() {
    const requested = newTarget.trim();
    const identity = requested && newTargetState === 'resolved' && resolvedNewTarget?.query === requested ? resolvedNewTarget : null;
    if (!accountId || !requested) return;
    if (!identity?.jid) {
      setError(newTargetState === 'resolving' ? 'Aguarde a confirmação do contacto pelo WhatsApp.' : 'Digite um número válido e aguarde o JID/LID ser confirmado antes de abrir o chat.');
      return;
    }
    setSelected({ jid: identity.jid, lid: identity.lid, pn_jid: identity.pnJid, phone: identity.phone, display_name: identity.displayName || identity.pushName || identity.phone || requested });
    setNewTarget('');
  }

  async function improveText(action = aiAction) {
    const body = text.trim();
    const selectedProvider = aiProviders.find(item => item.configured) ?? aiProviders[0];
    if (!body) { setError('Escreva um texto antes de pedir ajuda à IA.'); return; }
    if (!selectedProvider?.configured) { setError('Configure pelo menos um provedor de texto IA em Configurações.'); return; }
    setAiBusy(true); setError('');
    try {
      const result = await window.attozap.ai.rewrite({ provider: selectedProvider.id, model: selectedProvider.model, action, text: body, context: aiContext.trim() || undefined });
      setText(String(result?.text ?? body));
      setShowAiMenu(false);
      setAiContext('');
    } catch (e: any) { setError(e?.message ?? String(e)); }
    finally { setAiBusy(false); }
  }

  async function sendText() {
    const body = text.trim();
    const requested = newTarget.trim();
    const identity = requested && newTargetState === 'resolved' && resolvedNewTarget?.query === requested ? resolvedNewTarget : null;
    const sendTarget = identity?.jid ?? (!requested ? selected?.jid ?? '' : '');
    if (requested && !identity?.jid) { setError(newTargetState === 'resolving' ? 'Aguarde a confirmação do contacto pelo WhatsApp.' : 'O novo destinatário ainda não foi confirmado; nenhum envio foi realizado.'); return; }
    if (!accountId || !sendTarget || !body) { setError('Selecione uma conversa ou informe um destinatário e digite a mensagem.'); return; }
    setBusy(true); setError('');
    try {
      const result = await window.attozap.webchat.sendText(accountId, sendTarget, body);
      const resolved = result.resolvedTarget ?? result.remoteJid ?? sendTarget;
      appendOptimistic({ id: result.id, account_id: accountId, remote_jid: resolved, direction: 'out', message_type: 'text', text: body, status: 'pending', created_at: new Date(epochMs(result.timestamp || Date.now())).toISOString(), metadata: { transportJid: result.transportJid } });
      setText('');
      setSelected((current: any) => requested
        ? { jid: resolved, lid: identity?.lid, pn_jid: identity?.pnJid, phone: identity?.phone, display_name: requested, last_message_at: new Date().toISOString() }
        : { ...(current ?? {}), jid: resolved, last_message_at: new Date().toISOString() });
      setNewTarget('');
      void loadChats();
      scheduleReconcile(resolved, 60);
    } catch (e: any) { setError(e?.message ?? String(e)); }
    finally { setBusy(false); }
  }

  function mediaKind(fileNameValue: string, mimeType: string, forceType?: 'sticker'): PendingMedia['type'] {
    if (forceType) return forceType;
    const ext = String(fileNameValue ?? '').split('.').pop()?.toLowerCase() ?? '';
    if (mimeType.startsWith('image/') || ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp'].includes(ext)) return 'image';
    if (mimeType.startsWith('video/') || ['mp4', 'mov', 'mkv', 'webm'].includes(ext)) return 'video';
    if (mimeType.startsWith('audio/') || ['mp3', 'ogg', 'wav', 'm4a', 'opus'].includes(ext)) return 'audio';
    return 'document';
  }

  async function stagePath(path: string, forceType?: 'sticker') {
    const preview = await window.attozap.files.readPreview(path);
    const type = mediaKind(preview.fileName || fileName(path), preview.mimeType, forceType);
    setPendingMedia({ path: preview.filePath, fileName: preview.fileName || fileName(path), type, mimetype: preview.mimeType, dataUrl: preview.dataUrl, size: preview.size });
    setPendingDimensions(null);
    setError('');
  }

  async function stageBrowserFile(file: File, forceType?: 'sticker') {
    if (!file || file.size <= 0 || file.size > 25 * 1024 * 1024) throw new Error('A mídia deve ter entre 1 byte e 25 MiB.');
    const base64 = await blobAsBase64(file);
    const mimeType = String(file.type || 'application/octet-stream').split(';')[0];
    const name = file.name || `media-${Date.now()}`;
    const saved = await window.attozap.files.saveTempBinary({ base64, suggestedName: name, maxBytes: 25 * 1024 * 1024 });
    const type = mediaKind(name, mimeType, forceType);
    setPendingMedia({ path: saved.filePath, fileName: name, type, mimetype: mimeType, dataUrl: `data:${mimeType};base64,${base64}`, size: file.size });
    setPendingDimensions(null);
    setError('');
  }

  async function attach(forceType?: 'sticker') {
    setShowAttachMenu(false);
    const requested = newTarget.trim();
    const identity = requested && newTargetState === 'resolved' && resolvedNewTarget?.query === requested ? resolvedNewTarget : null;
    const sendTarget = identity?.jid ?? (!requested ? selected?.jid ?? '' : '');
    if (requested && !identity?.jid) { setError(newTargetState === 'resolving' ? 'Aguarde a confirmação do contacto pelo WhatsApp.' : 'O novo destinatário ainda não foi confirmado; nenhum envio foi realizado.'); return; }
    if (!accountId || !sendTarget) { setError('Selecione uma conversa ou informe um destinatário.'); return; }
    const filters = forceType === 'sticker' ? [{ name: 'Sticker WebP', extensions: ['webp'] }] : undefined;
    const paths = await window.attozap.files.pick({ multiple: false, filters });
    if (!paths?.[0]) return;
    try { await stagePath(paths[0], forceType); }
    catch (e: any) { setError(e?.message ?? String(e)); }
  }

  async function sendPendingMedia() {
    const media = pendingMedia;
    if (!media || busy) return;
    const requested = newTarget.trim();
    const identity = requested && newTargetState === 'resolved' && resolvedNewTarget?.query === requested ? resolvedNewTarget : null;
    const sendTarget = identity?.jid ?? (!requested ? selected?.jid ?? '' : '');
    if (requested && !identity?.jid) { setError(newTargetState === 'resolving' ? 'Aguarde a confirmação do contacto pelo WhatsApp.' : 'O novo destinatário ainda não foi confirmado; nenhum envio foi realizado.'); return; }
    if (!accountId || !sendTarget) { setError('Selecione uma conversa ou informe um destinatário.'); return; }
    setBusy(true); setError('');
    try {
      const result = await window.attozap.webchat.sendMedia(accountId, sendTarget, media.type, { path: media.path, fileName: media.fileName, mimetype: media.mimetype, ptt: media.type === 'audio' });
      const resolved = result.resolvedTarget ?? result.remoteJid ?? sendTarget;
      appendOptimistic({ id: result.id, account_id: accountId, remote_jid: resolved, direction: 'out', message_type: media.type, text: media.fileName, file_name: media.fileName, mimetype: media.mimetype, status: 'pending', created_at: new Date(epochMs(result.timestamp || Date.now())).toISOString(), metadata: { pendingMediaRefresh: true, originalSize: media.size, transportJid: result.transportJid } });
      setSelected((current: any) => requested ? { jid: resolved, lid: identity?.lid, pn_jid: identity?.pnJid, phone: identity?.phone, display_name: requested } : { ...(current ?? {}), jid: resolved });
      setNewTarget(''); setPendingMedia(null); setPendingDimensions(null);
      void loadChats();
      scheduleReconcile(resolved, 180);
    } catch (e: any) { setError(e?.message ?? String(e)); }
    finally { setBusy(false); }
  }

  async function handleDrop(event: React.DragEvent<HTMLElement>) {
    event.preventDefault();
    setDragOver(false);
    const file = Array.from(event.dataTransfer.files || [])[0];
    if (!file) return;
    try { await stageBrowserFile(file); }
    catch (e: any) { setError(e?.message ?? String(e)); }
  }

  async function handlePaste(event: React.ClipboardEvent<HTMLTextAreaElement>) {
    const item = Array.from(event.clipboardData.items || []).find(candidate => candidate.type.startsWith('image/'));
    if (!item) return;
    const file = item.getAsFile();
    if (!file) return;
    event.preventDefault();
    try { await stageBrowserFile(new File([file], `imagem-colada-${Date.now()}.${file.type.split('/')[1] || 'png'}`, { type: file.type })); }
    catch (e: any) { setError(e?.message ?? String(e)); }
  }

  function releaseRecordingStream() {
    recordingStreamRef.current?.getTracks().forEach(track => track.stop());
    recordingStreamRef.current = null;
    recorderRef.current = null;
  }

  async function startRecording() {
    const requested = newTarget.trim();
    const identity = requested && newTargetState === 'resolved' && resolvedNewTarget?.query === requested ? resolvedNewTarget : null;
    const recordedTarget = identity?.jid ?? (!requested ? selected?.jid ?? '' : '');
    if (requested && !identity?.jid) { setError(newTargetState === 'resolving' ? 'Aguarde a confirmação do contacto pelo WhatsApp.' : 'O novo destinatário ainda não foi confirmado; a gravação não será enviada.'); return; }
    if (!accountId || !recordedTarget) { setError('Selecione uma conversa ou informe um destinatário antes de gravar.'); return; }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') { setError('Este ambiente não oferece gravação de áudio pelo microfone.'); return; }
    setError('');
    try {
      const preferredConstraints: MediaStreamConstraints = {
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: false,
      };
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia(preferredConstraints);
      } catch (error) {
        const name = String((error as { name?: unknown })?.name ?? '');
        if (name === 'OverconstrainedError') stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        else throw error;
      }
      const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'].find(value => MediaRecorder.isTypeSupported(value)) ?? '';
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      recordingChunksRef.current = [];
      recordingStreamRef.current = stream;
      recorderRef.current = recorder;
      recordingStartedAtRef.current = Date.now();
      setRecordingSeconds(0);
      recorder.ondataavailable = event => { if (event.data.size > 0) recordingChunksRef.current.push(event.data); };
      recorder.onerror = event => {
        console.error('[webchat:recording]', event);
        releaseRecordingStream();
        recordingChunksRef.current = [];
        setRecording(false);
        setRecordingSeconds(0);
        setError('O gravador de áudio falhou. Verifique se o microfone continua conectado.');
      };
      recorder.onstop = () => {
        const blob = new Blob(recordingChunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        recordingChunksRef.current = [];
        releaseRecordingStream();
        setRecording(false);
        setRecordingSeconds(0);
        void (async () => {
          if (!blob.size) throw new Error('A gravação ficou vazia. Tente manter o microfone ativo durante alguns segundos.');
          setBusy(true); setError('');
          const base64 = await blobAsBase64(blob);
          const saved = await window.attozap.files.saveTempBinary({ base64, suggestedName: 'mensagem-de-voz.webm', maxBytes: 15 * 1024 * 1024 });
          const result = await window.attozap.webchat.sendMedia(accountId, recordedTarget, 'audio', { path: saved.filePath, fileName: 'mensagem-de-voz.webm', mimetype: blob.type || 'audio/webm', ptt: true });
          const resolved = result.resolvedTarget ?? result.remoteJid ?? recordedTarget;
          appendOptimistic({ id: result.id, account_id: accountId, remote_jid: resolved, direction: 'out', message_type: 'audio', text: 'Mensagem de voz', file_name: 'mensagem-de-voz.webm', status: 'pending', created_at: new Date(epochMs(result.timestamp || Date.now())).toISOString(), metadata: { ptt: true, transportJid: result.transportJid } });
          setSelected((current: any) => requested ? { jid: resolved, lid: identity?.lid, pn_jid: identity?.pnJid, phone: identity?.phone, display_name: requested } : { ...(current ?? {}), jid: resolved });
          setNewTarget('');
          void loadChats();
          scheduleReconcile(resolved, 180);
        })().catch((e: any) => setError(recordingErrorMessage(e))).finally(() => setBusy(false));
      };
      try {
        recorder.start(250);
      } catch (error) {
        releaseRecordingStream();
        throw error;
      }
      setRecording(true);
    } catch (error) {
      releaseRecordingStream();
      setRecording(false);
      setRecordingSeconds(0);
      setError(recordingErrorMessage(error));
    }
  }

  function stopRecording() {
    const recorder = recorderRef.current;
    if (!recorder) { setRecording(false); return; }
    if (recorder.state === 'inactive') {
      releaseRecordingStream();
      setRecording(false);
      return;
    }
    try { recorder.stop(); }
    catch (error) {
      releaseRecordingStream();
      setRecording(false);
      setRecordingSeconds(0);
      setError(recordingErrorMessage(error));
    }
  }

  async function sendPoll() {
    const options = [...new Set(String(pollOptions ?? '').split(/\r?\n/).map(item => item.trim()).filter(Boolean))];
    const requested = newTarget.trim();
    const identity = requested && newTargetState === 'resolved' && resolvedNewTarget?.query === requested ? resolvedNewTarget : null;
    const sendTarget = identity?.jid ?? (!requested ? selected?.jid ?? '' : '');
    if (requested && !identity?.jid) { setError(newTargetState === 'resolving' ? 'Aguarde a confirmação do contacto pelo WhatsApp.' : 'O novo destinatário ainda não foi confirmado; nenhum envio foi realizado.'); return; }
    if (!accountId || !sendTarget || !pollQuestion.trim() || options.length < 2) { setError('Informe uma pergunta e pelo menos duas opções.'); return; }
    setBusy(true); setError('');
    try {
      const question = pollQuestion.trim();
      const result = await window.attozap.webchat.sendPoll(accountId, sendTarget, { name: question, values: options, selectableCount: 1 });
      const resolved = result.resolvedTarget ?? result.remoteJid ?? sendTarget;
      appendOptimistic({ id: result.id, account_id: accountId, remote_jid: resolved, direction: 'out', message_type: 'poll', text: question, status: 'pending', created_at: new Date(epochMs(result.timestamp || Date.now())).toISOString(), metadata: { question, options, transportJid: result.transportJid } });
      setSelected((current: any) => requested ? { jid: resolved, lid: identity?.lid, pn_jid: identity?.pnJid, phone: identity?.phone, display_name: requested } : { ...(current ?? {}), jid: resolved });
      setNewTarget(''); setPollQuestion(''); setPollOptions('Sim\nNão'); setShowPoll(false); await loadChats();
      scheduleReconcile(resolved, 60);
    } catch (e: any) { setError(e?.message ?? String(e)); }
    finally { setBusy(false); }
  }

  async function sendLocation() {
    const requested = newTarget.trim();
    const identity = requested && newTargetState === 'resolved' && resolvedNewTarget?.query === requested ? resolvedNewTarget : null;
    const sendTarget = identity?.jid ?? (!requested ? selected?.jid ?? '' : '');
    const latitude = Number(String(locationLat ?? '').trim().replace(',', '.'));
    const longitude = Number(String(locationLng ?? '').trim().replace(',', '.'));
    if (requested && !identity?.jid) { setError(newTargetState === 'resolving' ? 'Aguarde a confirmação do contacto pelo WhatsApp.' : 'O novo destinatário ainda não foi confirmado; nenhum envio foi realizado.'); return; }
    if (!accountId || !sendTarget || !Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      setError('Informe uma latitude entre -90 e 90 e uma longitude entre -180 e 180.');
      return;
    }
    setBusy(true); setError('');
    try {
      const name = String(locationName ?? '').trim();
      const address = String(locationAddress ?? '').trim();
      const result = await window.attozap.webchat.sendLocation(accountId, sendTarget, { latitude, longitude, name: name || undefined, address: address || undefined });
      const resolved = result.resolvedTarget ?? result.remoteJid ?? sendTarget;
      appendOptimistic({ id: result.id, account_id: accountId, remote_jid: resolved, direction: 'out', message_type: 'location', text: name || 'Localização', status: 'pending', created_at: new Date(epochMs(result.timestamp || Date.now())).toISOString(), metadata: { latitude, longitude, name: name || undefined, address: address || undefined, transportJid: result.transportJid } });
      setSelected((current: any) => requested ? { jid: resolved, lid: identity?.lid, pn_jid: identity?.pnJid, phone: identity?.phone, display_name: requested } : { ...(current ?? {}), jid: resolved });
      setNewTarget(''); setLocationLat(''); setLocationLng(''); setLocationName(''); setLocationAddress(''); setShowLocation(false); setShowAttachMenu(false); await loadChats();
      scheduleReconcile(resolved, 60);
    } catch (e: any) { setError(e?.message ?? String(e)); }
    finally { setBusy(false); }
  }

  async function sendContact() {
    const requested = newTarget.trim();
    const identity = requested && newTargetState === 'resolved' && resolvedNewTarget?.query === requested ? resolvedNewTarget : null;
    const sendTarget = identity?.jid ?? (!requested ? selected?.jid ?? '' : '');
    const displayName = String(contactName ?? '').trim();
    const phone = String(contactPhone ?? '').replace(/[^\d]/g, '');
    const organization = String(contactOrg ?? '').trim();
    if (requested && !identity?.jid) { setError(newTargetState === 'resolving' ? 'Aguarde a confirmação do contacto pelo WhatsApp.' : 'O novo destinatário ainda não foi confirmado; nenhum envio foi realizado.'); return; }
    if (!accountId || !sendTarget || displayName.length < 2 || phone.length < 6 || phone.length > 15) { setError('Informe o nome e um telefone válido para o contacto.'); return; }
    setBusy(true); setError('');
    try {
      const result = await window.attozap.webchat.sendContact(accountId, sendTarget, { displayName, phone, organization: organization || undefined });
      const resolved = result.resolvedTarget ?? result.remoteJid ?? sendTarget;
      appendOptimistic({ id: result.id, account_id: accountId, remote_jid: resolved, direction: 'out', message_type: 'contact', text: displayName, status: 'pending', created_at: new Date(epochMs(result.timestamp || Date.now())).toISOString(), metadata: { displayName, phone, organization: organization || undefined, transportJid: result.transportJid } });
      setSelected((current: any) => requested ? { jid: resolved, lid: identity?.lid, pn_jid: identity?.pnJid, phone: identity?.phone, display_name: requested } : { ...(current ?? {}), jid: resolved });
      setNewTarget(''); setContactName(''); setContactPhone(''); setContactOrg(''); setShowContact(false); setShowAttachMenu(false); await loadChats();
      scheduleReconcile(resolved, 60);
    } catch (e: any) { setError(e?.message ?? String(e)); }
    finally { setBusy(false); }
  }

  async function saveProxy() {
    if (!accountId) return;
    try { await window.attozap.accounts.setProxy(accountId, proxy.trim() || undefined); await reloadAccounts(); setShowProxy(false); setError(''); }
    catch (e: any) { setError(e?.message ?? String(e)); }
  }

  return <div className="webchat-full">
    <div className="webchat-toolbar">
      <div><b>WebChat</b><span>Tempo real · JID/LID · mídia · pushname · perfil</span></div>
      <div className="head-actions"><label className="channel-picker"><span>Canal</span><select className="top-select" value={accountId} onChange={e => { setAccountId(e.target.value); setSelected(null); setNewTarget(''); setMessages([]); }}><option value="">Escolha o canal...</option>{connected.map(account => <option key={account.id} value={account.id}>{String(account.provider || 'baileys').toUpperCase()} · {account.name}{account.phone ? ` · +${account.phone}` : ''}</option>)}</select></label><button className="icon-button" title="Proxy do canal" disabled={!accountId} onClick={() => setShowProxy(v => !v)}><Settings2 size={16}/></button><button className="icon-button" title="Atualizar" disabled={!accountId} onClick={() => { void loadChats(); void loadMessages(); }}><RefreshCw size={16}/></button></div>
    </div>
    {error && <div className="notice error webchat-notice">{error}<button onClick={() => setError('')}><X size={14}/></button></div>}
    {restriction?.isActive && <div className="notice error webchat-notice webchat-restriction-notice"><div><b>Restrição de alcance do WhatsApp detectada</b><span>O servidor está a impedir temporariamente novas mensagens para alguns destinatários. Não repita automaticamente o envio; teste primeiro uma conversa já iniciada e aguarde o prazo do WhatsApp.</span>{restriction.timeEnforcementEnds && <small>Fim informado pelo servidor: {new Date(restriction.timeEnforcementEnds).toLocaleString('pt-BR')}</small>}</div><button className="button ghost" onClick={() => void refreshRestriction()}>Verificar novamente</button></div>}
    {showProxy && <div className="webchat-proxy"><b>Proxy do canal</b><input value={proxy} onChange={e => setProxy(e.target.value)} placeholder="http://usuario:senha@host:porta"/><button className="button primary" onClick={() => void saveProxy()}>Salvar</button></div>}
    <div className="webchat-workspace">
      <aside className="webchat-list-pane">
        <div className="webchat-account"><span className="wa-avatar online"><Wifi size={16}/></span><div><b>{activeAccount?.name ?? 'Selecione um canal'}</b><small>{activeAccount ? `${String(activeAccount.provider || 'baileys').toUpperCase()}${activeAccount.phone ? ` · +${activeAccount.phone}` : ''}` : 'Nenhuma sessão selecionada'}</small></div></div>
        <div className="webchat-search"><Search size={15}/><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar conversa..."/></div>
        <div className="new-chat"><input value={newTarget} onChange={e => setNewTarget(e.target.value)} onKeyDown={e => e.key === 'Enter' && void openNewTarget()} placeholder="Novo número, PN JID ou LID"/><button className="icon-button" disabled={busy || newTargetState !== 'resolved' || !verifiedNewTarget?.jid} onClick={() => void openNewTarget()} title={newTargetState === 'resolved' ? 'Abrir contacto confirmado' : 'Aguarde a confirmação do JID/LID'}><MessageCircle size={16}/></button></div>
        {typedTarget && <div className={`new-chat-resolution ${newTargetState}`} role="status" aria-live="polite"><span>{newTargetState === 'resolving' ? 'A procurar este contacto no WhatsApp…' : newTargetState === 'resolved' && verifiedNewTarget ? `Contacto confirmado · ${verifiedNewTarget.lid ? 'LID' : 'JID'}` : 'Número não localizado ou identidade inválida'}</span>{newTargetState === 'resolved' && verifiedNewTarget?.jid && <code>{verifiedNewTarget.jid}</code>}</div>}
        <div className="conversation-list">{chats.map(chat => <button key={chat.jid} className={selected && sameIdentity(selected, chat) ? 'active' : ''} onClick={() => { setNewTarget(''); setSelected(chat); }}><Avatar chat={chat} onBroken={() => refreshAvatar(chat)}/><span className="grow"><b>{labelFor(chat)}</b><small>{chat.last_text || (chat.last_message_type && chat.last_message_type !== 'text' ? `[${chat.last_message_type}]` : chat.jid)}</small></span><time>{chat.last_message_at ? new Date(chat.last_message_at).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}) : ''}</time></button>)}{!chats.length && <div className="empty mini"><MessageCircle size={25}/><p>Nenhuma conversa observada ainda.</p></div>}</div>
      </aside>
      <section className={`webchat-thread-pane ${dragOver ? 'drag-over' : ''}`} onDragOver={event => { event.preventDefault(); setDragOver(true); }} onDragLeave={event => { if (event.currentTarget === event.target) setDragOver(false); }} onDrop={event => void handleDrop(event)}>
        <header><Avatar chat={selected} large onBroken={() => refreshAvatar(selected)}/><div className="grow"><b>{typedTarget ? `Nova conversa · ${typedTarget}` : selected ? labelFor(selected) : 'Selecione uma conversa'}</b><small>{typedTarget || (selected?.phone ? `+${selected.phone}` : selected?.jid) || 'Envie para número/JID/LID para iniciar'}</small></div>{selected && !typedTarget && <div className="thread-header-actions"><button className="icon-button" type="button" disabled={syncingContact} onClick={() => void syncSelectedContact()} title="Sincronizar contacto do WhatsApp" aria-label="Sincronizar contacto do WhatsApp"><RefreshCw size={16} className={syncingContact ? 'spin' : ''}/></button></div>}</header>
        {dragOver && <div className="webchat-drop-hint" role="status"><ImagePlus size={20}/><b>Solte a mídia para analisar antes de enviar</b><small>Imagens, vídeos, áudios e documentos até 25 MiB</small></div>}
        <div className="message-stream">{messages.map(message => <div key={message.id} className={`chat-bubble ${message.direction === 'out' ? 'out' : 'in'} ${message.status === 'failed' ? 'failed' : ''}`}><MessageBody message={message} onOpenMedia={setLightbox}/><small>{toLocalDateTime(message.created_at)}{message.status === 'failed' ? ` · ${message.error || 'falhou'}` : message.direction === 'out' ? ` · ${messageStatusLabel(message.status)}` : ''}</small></div>)}{selected && !messages.length && <div className="empty mini"><MessageCircle size={26}/><p>Sem mensagens registradas nesta conversa.</p></div>}<div ref={bottom}/></div>
        {pendingMedia && <div className="media-confirm-panel"><div className="media-confirm-preview">{['image', 'sticker'].includes(pendingMedia.type) && <img src={pendingMedia.dataUrl} alt={pendingMedia.fileName} onLoad={event => setPendingDimensions({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })}/>} {pendingMedia.type === 'video' && <video src={pendingMedia.dataUrl} controls preload="metadata"/>}{pendingMedia.type === 'audio' && <audio src={pendingMedia.dataUrl} controls/>}{pendingMedia.type === 'document' && <div className="media-confirm-document"><FileIcon size={24}/><b>{pendingMedia.fileName}</b></div>}</div><div className="media-confirm-info"><b>{pendingMedia.fileName}</b><small>{(pendingMedia.size / 1024 / 1024).toFixed(2)} MiB{pendingDimensions ? ` · ${pendingDimensions.width} × ${pendingDimensions.height}px · proporção original preservada` : ''}</small></div><div className="media-confirm-actions"><button type="button" className="button ghost" disabled={busy} onClick={() => { setPendingMedia(null); setPendingDimensions(null); }}><X size={15}/> Cancelar</button><button type="button" className="button primary" disabled={busy || !target} onClick={() => void sendPendingMedia()}><Check size={15}/> Confirmar envio</button></div></div>}
        {showPoll && <div className="rich-composer poll-composer"><div className="rich-composer-header"><b>Enviar enquete</b><button type="button" className="icon-button" onClick={() => setShowPoll(false)} title="Fechar enquete"><X size={15}/></button></div><div className="field grow"><label>Pergunta</label><input value={pollQuestion} onChange={e => setPollQuestion(e.target.value)} placeholder="Qual opção você prefere?"/></div><div className="field grow"><label>Opções — uma por linha</label><textarea value={pollOptions ?? ''} onChange={e => setPollOptions(e.target.value)}/></div><button className="button primary" disabled={busy} onClick={() => void sendPoll()}><Vote size={15}/> Enviar enquete</button></div>}
        {showLocation && <div className="rich-composer location-composer"><div className="rich-composer-header"><b><MapPin size={16}/> Enviar localização</b><button type="button" className="icon-button" onClick={() => setShowLocation(false)} title="Fechar localização"><X size={15}/></button></div><div className="rich-grid"><div className="field"><label>Latitude</label><input inputMode="decimal" value={locationLat} onChange={e => setLocationLat(e.target.value)} placeholder="-23.550520"/></div><div className="field"><label>Longitude</label><input inputMode="decimal" value={locationLng} onChange={e => setLocationLng(e.target.value)} placeholder="-46.633308"/></div></div><div className="rich-grid"><div className="field"><label>Nome do local <small>(opcional)</small></label><input value={locationName} onChange={e => setLocationName(e.target.value)} placeholder="Escritório"/></div><div className="field"><label>Endereço <small>(opcional)</small></label><input value={locationAddress} onChange={e => setLocationAddress(e.target.value)} placeholder="Av. Paulista, 1000"/></div></div><button className="button primary" disabled={busy} onClick={() => void sendLocation()}><MapPin size={15}/> Enviar localização</button></div>}
        {showContact && <div className="rich-composer contact-composer"><div className="rich-composer-header"><b><ContactRound size={16}/> Partilhar contacto</b><button type="button" className="icon-button" onClick={() => setShowContact(false)} title="Fechar contacto"><X size={15}/></button></div><div className="rich-grid"><div className="field"><label>Nome</label><input value={contactName} onChange={e => setContactName(e.target.value)} placeholder="Nome completo" autoFocus/></div><div className="field"><label>Telefone</label><input inputMode="tel" value={contactPhone} onChange={e => setContactPhone(e.target.value)} placeholder="5511999999999"/></div></div><div className="field"><label>Organização <small>(opcional)</small></label><input value={contactOrg} onChange={e => setContactOrg(e.target.value)} placeholder="Empresa"/></div><button className="button primary" disabled={busy} onClick={() => void sendContact()}><ContactRound size={15}/> Enviar contacto</button></div>}
        <div className="webchat-popovers">
          {showAttachMenu && <div className="webchat-popover attach-popover"><b>Anexar conteúdo</b><div className="popover-actions"><button onClick={() => void attach()}><Paperclip size={15}/> Mídia ou documento</button><button onClick={() => void attach('sticker')}><Smile size={15}/> Figurinha WebP</button><button onClick={() => { setShowPoll(true); setShowLocation(false); setShowContact(false); setShowAttachMenu(false); }}><Vote size={15}/> Enquete</button><button onClick={() => { setShowLocation(true); setShowPoll(false); setShowContact(false); setShowAttachMenu(false); }}><MapPin size={15}/> Localização</button><button onClick={() => { setShowContact(true); setShowPoll(false); setShowLocation(false); setShowAttachMenu(false); }}><ContactRound size={15}/> Contacto</button></div></div>}
          {showEmoji && <div className="webchat-popover emoji-popover"><b>Emojis rápidos</b><div className="emoji-grid">{['😀','😂','😍','👍','🙏','🔥','✅','🎉','👋','💬','❤️','😅'].map(emoji => <button key={emoji} onClick={() => { setText(current => `${current}${emoji}`); setShowEmoji(false); }}>{emoji}</button>)}</div></div>}
          {showAiMenu && <div className="webchat-popover ai-edit-popover"><div className="rich-composer-header"><b><Sparkles size={15}/> Assistente de texto</b><button type="button" className="icon-button" onClick={() => setShowAiMenu(false)} title="Fechar assistência IA"><X size={14}/></button></div><p>Escolha uma ação para transformar o texto atual. O texto original só é substituído depois que a IA responder.</p><div className="field"><label>Contexto opcional</label><input value={aiContext} onChange={event => setAiContext(event.target.value)} placeholder="Ex.: resposta profissional para um cliente"/></div><div className="ai-edit-actions"><button type="button" onClick={() => void improveText('correct')} disabled={aiBusy || !text.trim()}><Check size={14}/> Corrigir</button><button type="button" onClick={() => void improveText('shorten')} disabled={aiBusy || !text.trim()}>Encurtar</button><button type="button" onClick={() => void improveText('expand')} disabled={aiBusy || !text.trim()}>Aumentar</button><button type="button" onClick={() => void improveText('context')} disabled={aiBusy || !text.trim()}><Wand2 size={14}/> Dar contexto</button></div>{aiBusy && <small className="muted">A IA está a preparar a nova versão…</small>}</div>}
        </div>
        <footer className={recording ? 'recording' : ''}>
          <button className={`icon-button ${showAttachMenu ? 'active' : ''}`} disabled={busy || !target || recording} onClick={() => { setShowAttachMenu(value => !value); setShowEmoji(false); }} title="Anexar"><Plus size={18}/></button>
          <button className={`icon-button ${showEmoji ? 'active' : ''}`} disabled={busy || !target || recording} onClick={() => { setShowEmoji(value => !value); setShowAttachMenu(false); setShowAiMenu(false); }} title="Emojis"><Smile size={18}/></button>
          <button className={`icon-button ${showAiMenu ? 'active' : ''}`} disabled={busy || !target || recording} onClick={() => { setShowAiMenu(value => !value); setShowAttachMenu(false); setShowEmoji(false); }} title="Melhorar texto com IA"><Bot size={18}/></button>
          <button className={`icon-button ${recording ? 'danger' : ''}`} disabled={busy || !target && !recording} onClick={() => recording ? stopRecording() : void startRecording()} title={recording ? 'Parar gravação' : 'Gravar áudio'}>{recording ? <Square size={17}/> : <Mic size={18}/>}</button>
          {recording && <span className="recording-timer">Gravando {String(Math.floor(recordingSeconds / 60)).padStart(2, '0')}:{String(recordingSeconds % 60).padStart(2, '0')}</span>}
          <textarea ref={composerRef} className="webchat-composer-input" value={text} disabled={recording || aiBusy} onChange={e => setText(e.target.value)} onPaste={handlePaste} onInput={e => { const element = e.currentTarget; element.style.height = 'auto'; element.style.height = `${Math.min(200, Math.max(72, element.scrollHeight))}px`; }} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void sendText(); } }} placeholder={recording ? 'Gravação em andamento…' : 'Digite uma mensagem… Pode colar uma imagem ou arrastá-la para o chat'}/><button className="button primary send-chat" disabled={busy || aiBusy || recording || !text.trim() || !target} onClick={() => void sendText()}>{busy ? <FileUp size={17}/> : <Send size={17}/>} Enviar</button>
        </footer>
      </section>
    </div>
    {lightbox && <div className="media-lightbox" role="dialog" aria-modal="true" aria-label={`Visualizar ${lightbox.name}`} onMouseDown={() => setLightbox(null)}><div className="media-lightbox-panel" onMouseDown={event => event.stopPropagation()}><div className="media-lightbox-toolbar"><strong>{lightbox.name}</strong><div><a className="media-lightbox-download" href={lightbox.url} download={lightbox.name} target="_blank" rel="noreferrer"><Download size={16}/> Descarregar</a><button type="button" className="icon-button" onClick={() => setLightbox(null)} title="Fechar" aria-label="Fechar"><X size={18}/></button></div></div>{lightbox.type === 'image' ? <img className="media-lightbox-content" src={lightbox.url} alt={lightbox.name}/> : <video className="media-lightbox-content" src={lightbox.url} controls autoPlay preload="metadata"/>}</div></div>}
  </div>;
}

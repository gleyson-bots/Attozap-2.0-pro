import { useEffect, useMemo, useRef, useState } from 'react';
import { File, FileUp, MessageCircle, Mic, Paperclip, Plus, RefreshCw, Search, Send, Settings2, Smile, Square, Vote, Wifi, X } from 'lucide-react';
import { toLocalDateTime } from '../lib';

function labelFor(chat: any) { return chat?.display_name || chat?.name || (chat?.phone ? `+${chat.phone}` : chat?.jid || 'Conversa'); }
function fileName(path: string) { return path.split(/[\\/]/).pop() ?? path; }
function aliases(chat: any) { return new Set([chat?.jid, chat?.lid, chat?.pn_jid].filter(Boolean)); }
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
function Avatar({ chat, large = false }: { chat: any; large?: boolean }) {
  const label = String(labelFor(chat)).slice(0, 1).toUpperCase();
  return <span className={`conversation-avatar ${large ? 'large' : ''}`}>{chat?.profile_url ? <img src={chat.profile_url} alt=""/> : label}</span>;
}
function MessageBody({ message }: { message: any }) {
  const type = message.message_type || 'text';
  const url = message.media_url;
  const metadata = message.metadata || {};
  return <>
    {type === 'image' && url && <img className="chat-image" src={url} alt={message.text || 'Imagem'}/>} 
    {type === 'sticker' && url && <img className="chat-sticker" src={url} alt="Figurinha"/>}
    {type === 'video' && url && <video className="chat-video" src={url} controls preload="metadata"/>}
    {type === 'audio' && url && <audio className="chat-audio" src={url} controls preload="metadata"/>}
    {type === 'document' && <div className="chat-document"><File size={22}/><div><b>{message.file_name || 'Documento'}</b><small>{message.mimetype || 'arquivo'}</small></div>{url && <a href={url} target="_blank" rel="noreferrer">Abrir</a>}</div>}
    {type === 'poll' && <div className="chat-poll"><div><Vote size={18}/><b>{metadata.question || message.text || 'Enquete'}</b></div>{(metadata.options || []).map((option: string) => <span key={option}>{option}</span>)}</div>}
    {message.text && type !== 'poll' && <div className="chat-text">{message.text}</div>}
    {!message.text && !url && !['document','poll'].includes(type) && <div className="chat-text muted">[{type}]</div>}
  </>;
}

export function WebChatPage({ accounts, reloadAccounts }: { accounts: any[]; reloadAccounts: () => Promise<void> }) {
  const connected = accounts.filter(account => account.status === 'connected');
  const [accountId, setAccountId] = useState(connected[0]?.id ?? '');
  const [search, setSearch] = useState('');
  const [chats, setChats] = useState<any[]>([]);
  const [selected, setSelected] = useState<any | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [text, setText] = useState('');
  const [newTarget, setNewTarget] = useState('');
  const [proxy, setProxy] = useState('');
  const [showProxy, setShowProxy] = useState(false);
  const [showPoll, setShowPoll] = useState(false);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollOptions, setPollOptions] = useState('Sim\nNão');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const bottom = useRef<HTMLDivElement | null>(null);
  const lastAutoScroll = useRef(0);
  const messageLoadGeneration = useRef(0);
  const localSequence = useRef(0);
  const reconcileTimer = useRef<number | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordingStreamRef = useRef<MediaStream | null>(null);
  const recordingChunksRef = useRef<Blob[]>([]);
  const recordingStartedAtRef = useRef(0);

  useEffect(() => {
    const available = connected.find(account => account.id === accountId);
    if (!available && connected[0]) setAccountId(connected[0].id);
    const current = accounts.find(account => account.id === accountId);
    setProxy(current?.proxy ?? '');
  }, [accounts, accountId]);

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

  function appendOptimistic(message: any) {
    const sequence = ++localSequence.current;
    setMessages(current => orderMessages([...current, {
      ...message,
      _local_seq: sequence,
      metadata: { ...(message.metadata ?? {}), optimistic: true },
    }]));
    scrollToBottom(true);
  }

  useEffect(() => { void loadChats(); }, [accountId, search]);
  useEffect(() => {
    messageLoadGeneration.current++;
    setMessages([]);
    if (selected?.jid) void loadMessages(selected.jid, true);
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
      void loadChats();
      if (selected?.jid && payloadMatchesSelected(payload, selected)) scheduleReconcile(selected.jid, 35);
    });
    const offStatus = window.attozap.messages.onStatus((payload: any) => {
      if (payload?.accountId !== accountId || !payload?.id) return;
      setMessages(current => orderMessages(current.map(message => message.id === payload.id ? { ...message, status: payload.status, error: payload.status === 'failed' ? (payload.error || message.error) : undefined } : message)));
      if (payload.status === 'failed') setError(payload.error || 'O WhatsApp rejeitou a mensagem.');
    });
    const offProfile = window.attozap.messages.onProfile?.((payload: any) => {
      if (payload?.accountId !== accountId) return;
      void loadChats();
      if (!selected) return;
      const identity = payload?.identity ?? {};
      const probe = { jid: payload?.jid ?? identity.jid, lid: identity.lid, pn_jid: identity.pnJid };
      if (sameIdentity(selected, probe)) setSelected((current: any) => ({ ...current, display_name: payload?.pushName || current?.display_name, profile_url: payload?.profilePictureUrl || current?.profile_url, lid: identity.lid ?? current?.lid, pn_jid: identity.pnJid ?? current?.pn_jid }));
    });
    return () => {
      offIncoming?.(); offStatus?.(); offProfile?.();
      if (reconcileTimer.current) window.clearTimeout(reconcileTimer.current);
      reconcileTimer.current = null;
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
  const target = typedTarget || selected?.jid || '';

  async function openNewTarget() {
    const requested = newTarget.trim();
    if (!accountId || !requested) return;
    setBusy(true); setError('');
    try {
      const resolved = await window.attozap.webchat.resolve(accountId, requested);
      setSelected({ jid: resolved, display_name: requested, last_message_at: new Date().toISOString() });
      setNewTarget('');
    } catch (e: any) { setError(e?.message ?? String(e)); }
    finally { setBusy(false); }
  }

  async function sendText() {
    const body = text.trim();
    const requested = newTarget.trim();
    const sendTarget = requested || selected?.jid || '';
    if (!accountId || !sendTarget || !body) { setError('Selecione uma conversa ou informe um destinatário e digite a mensagem.'); return; }
    setBusy(true); setError('');
    try {
      const result = await window.attozap.webchat.sendText(accountId, sendTarget, body);
      const resolved = result.resolvedTarget ?? result.remoteJid ?? sendTarget;
      appendOptimistic({ id: result.id, account_id: accountId, remote_jid: resolved, direction: 'out', message_type: 'text', text: body, status: 'pending', created_at: new Date(epochMs(result.timestamp || Date.now())).toISOString(), metadata: { transportJid: result.transportJid } });
      setText('');
      setSelected((current: any) => requested
        ? { jid: resolved, display_name: requested, last_message_at: new Date().toISOString() }
        : { ...(current ?? {}), jid: resolved, last_message_at: new Date().toISOString() });
      setNewTarget('');
      await loadChats();
      scheduleReconcile(resolved, 60);
    } catch (e: any) { setError(e?.message ?? String(e)); }
    finally { setBusy(false); }
  }

  async function attach(forceType?: 'sticker') {
    setShowAttachMenu(false);
    const requested = newTarget.trim();
    const sendTarget = requested || selected?.jid || '';
    if (!accountId || !sendTarget) { setError('Selecione uma conversa ou informe um destinatário.'); return; }
    const filters = forceType === 'sticker' ? [{ name: 'Sticker WebP', extensions: ['webp'] }] : undefined;
    const paths = await window.attozap.files.pick({ multiple: false, filters });
    if (!paths?.[0]) return;
    const path = paths[0];
    const name = fileName(path);
    const ext = name.split('.').pop()?.toLowerCase() ?? '';
    const type: 'image'|'video'|'document'|'audio'|'sticker' = forceType || (['jpg','jpeg','png','webp','gif'].includes(ext) ? 'image' : ['mp4','mov','mkv','webm'].includes(ext) ? 'video' : ['mp3','ogg','wav','m4a','opus'].includes(ext) ? 'audio' : 'document');
    setBusy(true); setError('');
    try {
      const result = await window.attozap.webchat.sendMedia(accountId, sendTarget, type, { path, fileName: name, ptt: type === 'audio' });
      const resolved = result.resolvedTarget ?? result.remoteJid ?? sendTarget;
      appendOptimistic({ id: result.id, account_id: accountId, remote_jid: resolved, direction: 'out', message_type: type, text: name, file_name: name, status: 'pending', created_at: new Date(epochMs(result.timestamp || Date.now())).toISOString(), metadata: { pendingMediaRefresh: true, transportJid: result.transportJid } });
      setSelected((current: any) => requested ? { jid: resolved, display_name: requested } : { ...(current ?? {}), jid: resolved });
      setNewTarget('');
      await loadChats();
      scheduleReconcile(resolved, 180);
    } catch (e: any) { setError(e?.message ?? String(e)); }
    finally { setBusy(false); }
  }

  async function startRecording() {
    const recordedTarget = newTarget.trim() || selected?.jid || '';
    if (!accountId || !recordedTarget) { setError('Selecione uma conversa ou informe um destinatário antes de gravar.'); return; }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') { setError('Este ambiente não oferece gravação de áudio pelo microfone.'); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'].find(value => MediaRecorder.isTypeSupported(value)) ?? '';
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      recordingChunksRef.current = [];
      recordingStreamRef.current = stream;
      recorderRef.current = recorder;
      recordingStartedAtRef.current = Date.now();
      setRecordingSeconds(0);
      recorder.ondataavailable = event => { if (event.data.size > 0) recordingChunksRef.current.push(event.data); };
      recorder.onerror = () => { setError('O gravador de áudio falhou.'); setRecording(false); };
      recorder.onstop = () => {
        const blob = new Blob(recordingChunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        recordingChunksRef.current = [];
        void (async () => {
          if (!blob.size) throw new Error('A gravação ficou vazia');
          setBusy(true); setError('');
          const base64 = await blobAsBase64(blob);
          const saved = await window.attozap.files.saveTempBinary({ base64, suggestedName: 'mensagem-de-voz.webm', maxBytes: 15 * 1024 * 1024 });
          const result = await window.attozap.webchat.sendMedia(accountId, recordedTarget, 'audio', { path: saved.filePath, fileName: 'mensagem-de-voz.webm', mimetype: blob.type || 'audio/webm', ptt: true });
          const resolved = result.resolvedTarget ?? result.remoteJid ?? recordedTarget;
          appendOptimistic({ id: result.id, account_id: accountId, remote_jid: resolved, direction: 'out', message_type: 'audio', text: 'Mensagem de voz', file_name: 'mensagem-de-voz.webm', status: 'pending', created_at: new Date(epochMs(result.timestamp || Date.now())).toISOString(), metadata: { ptt: true, transportJid: result.transportJid } });
          setSelected((current: any) => newTarget.trim() ? { jid: resolved, display_name: newTarget.trim() } : { ...(current ?? {}), jid: resolved });
          setNewTarget('');
          await loadChats();
          scheduleReconcile(resolved, 180);
        })().catch((e: any) => setError(e?.message ?? String(e))).finally(() => setBusy(false));
      };
      recorder.start(250);
      setRecording(true);
    } catch (e: any) { setError(e?.message ?? 'Permissão do microfone negada.'); }
  }

  function stopRecording() {
    recorderRef.current?.stop();
    recordingStreamRef.current?.getTracks().forEach(track => track.stop());
    recorderRef.current = null;
    recordingStreamRef.current = null;
    setRecording(false);
  }

  async function sendPoll() {
    const options = [...new Set(pollOptions.split(/\r?\n/).map(item => item.trim()).filter(Boolean))];
    const requested = newTarget.trim();
    const sendTarget = requested || selected?.jid || '';
    if (!accountId || !sendTarget || !pollQuestion.trim() || options.length < 2) { setError('Informe uma pergunta e pelo menos duas opções.'); return; }
    setBusy(true); setError('');
    try {
      const question = pollQuestion.trim();
      const result = await window.attozap.webchat.sendPoll(accountId, sendTarget, { name: question, values: options, selectableCount: 1 });
      const resolved = result.resolvedTarget ?? result.remoteJid ?? sendTarget;
      appendOptimistic({ id: result.id, account_id: accountId, remote_jid: resolved, direction: 'out', message_type: 'poll', text: question, status: 'pending', created_at: new Date(epochMs(result.timestamp || Date.now())).toISOString(), metadata: { question, options, transportJid: result.transportJid } });
      setSelected((current: any) => requested ? { jid: resolved, display_name: requested } : { ...(current ?? {}), jid: resolved });
      setNewTarget(''); setPollQuestion(''); setPollOptions('Sim\nNão'); setShowPoll(false); await loadChats();
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
    {showProxy && <div className="webchat-proxy"><b>Proxy do canal</b><input value={proxy} onChange={e => setProxy(e.target.value)} placeholder="http://usuario:senha@host:porta"/><button className="button primary" onClick={() => void saveProxy()}>Salvar</button></div>}
    <div className="webchat-workspace">
      <aside className="webchat-list-pane">
        <div className="webchat-account"><span className="wa-avatar online"><Wifi size={16}/></span><div><b>{activeAccount?.name ?? 'Selecione um canal'}</b><small>{activeAccount ? `${String(activeAccount.provider || 'baileys').toUpperCase()}${activeAccount.phone ? ` · +${activeAccount.phone}` : ''}` : 'Nenhuma sessão selecionada'}</small></div></div>
        <div className="webchat-search"><Search size={15}/><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar conversa..."/></div>
        <div className="new-chat"><input value={newTarget} onChange={e => setNewTarget(e.target.value)} onKeyDown={e => e.key === 'Enter' && void openNewTarget()} placeholder="Novo: número, PN JID ou LID"/><button className="icon-button" disabled={busy || !newTarget.trim()} onClick={() => void openNewTarget()}><MessageCircle size={16}/></button></div>
        <div className="conversation-list">{chats.map(chat => <button key={chat.jid} className={selected && sameIdentity(selected, chat) ? 'active' : ''} onClick={() => { setNewTarget(''); setSelected(chat); }}><Avatar chat={chat}/><span className="grow"><b>{labelFor(chat)}</b><small>{chat.last_text || (chat.last_message_type && chat.last_message_type !== 'text' ? `[${chat.last_message_type}]` : chat.jid)}</small></span><time>{chat.last_message_at ? new Date(chat.last_message_at).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}) : ''}</time></button>)}{!chats.length && <div className="empty mini"><MessageCircle size={25}/><p>Nenhuma conversa observada ainda.</p></div>}</div>
      </aside>
      <section className="webchat-thread-pane">
        <header><Avatar chat={selected} large/><div className="grow"><b>{typedTarget ? `Nova conversa · ${typedTarget}` : selected ? labelFor(selected) : 'Selecione uma conversa'}</b><small>{typedTarget || selected?.jid || 'Envie para número/JID/LID para iniciar'}</small></div></header>
        <div className="message-stream">{messages.map(message => <div key={message.id} className={`chat-bubble ${message.direction === 'out' ? 'out' : 'in'} ${message.status === 'failed' ? 'failed' : ''}`}><MessageBody message={message}/><small>{toLocalDateTime(message.created_at)}{message.status === 'failed' ? ` · ${message.error || 'falhou'}` : message.direction === 'out' ? ` · ${messageStatusLabel(message.status)}` : ''}</small></div>)}{selected && !messages.length && <div className="empty mini"><MessageCircle size={26}/><p>Sem mensagens registradas nesta conversa.</p></div>}<div ref={bottom}/></div>
        {showPoll && <div className="poll-composer"><div className="field grow"><label>Pergunta</label><input value={pollQuestion} onChange={e => setPollQuestion(e.target.value)} placeholder="Qual opção você prefere?"/></div><div className="field grow"><label>Opções — uma por linha</label><textarea value={pollOptions} onChange={e => setPollOptions(e.target.value)}/></div><button className="button primary" disabled={busy} onClick={() => void sendPoll()}><Vote size={15}/> Enviar enquete</button></div>}
        <div className="webchat-popovers">
          {showAttachMenu && <div className="webchat-popover attach-popover"><b>Anexar conteúdo</b><div className="popover-actions"><button onClick={() => void attach()}><Paperclip size={15}/> Mídia ou documento</button><button onClick={() => void attach('sticker')}><Smile size={15}/> Figurinha WebP</button><button onClick={() => setShowPoll(true)}><Vote size={15}/> Enquete</button></div></div>}
          {showEmoji && <div className="webchat-popover emoji-popover"><b>Emojis rápidos</b><div className="emoji-grid">{['😀','😂','😍','👍','🙏','🔥','✅','🎉','👋','💬','❤️','😅'].map(emoji => <button key={emoji} onClick={() => { setText(current => `${current}${emoji}`); setShowEmoji(false); }}>{emoji}</button>)}</div></div>}
        </div>
        <footer className={recording ? 'recording' : ''}>
          <button className={`icon-button ${showAttachMenu ? 'active' : ''}`} disabled={busy || !target || recording} onClick={() => { setShowAttachMenu(value => !value); setShowEmoji(false); }} title="Anexar"><Plus size={18}/></button>
          <button className={`icon-button ${showEmoji ? 'active' : ''}`} disabled={busy || !target || recording} onClick={() => { setShowEmoji(value => !value); setShowAttachMenu(false); }} title="Emojis"><Smile size={18}/></button>
          <button className={`icon-button ${recording ? 'danger' : ''}`} disabled={busy || !target && !recording} onClick={() => recording ? stopRecording() : void startRecording()} title={recording ? 'Parar gravação' : 'Gravar áudio'}>{recording ? <Square size={17}/> : <Mic size={18}/>}</button>
          {recording && <span className="recording-timer">Gravando {String(Math.floor(recordingSeconds / 60)).padStart(2, '0')}:{String(recordingSeconds % 60).padStart(2, '0')}</span>}
          <textarea value={text} disabled={recording} onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void sendText(); } }} placeholder={recording ? 'Gravação em andamento…' : 'Digite uma mensagem…'}/><button className="button primary send-chat" disabled={busy || recording || !text.trim() || !target} onClick={() => void sendText()}>{busy ? <FileUp size={17}/> : <Send size={17}/>} Enviar</button>
        </footer>
      </section>
    </div>
  </div>;
}

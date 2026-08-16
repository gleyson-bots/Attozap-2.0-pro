import { useEffect, useMemo, useRef, useState } from 'react';
import { File, FileUp, Image, MessageCircle, Mic, Paperclip, RefreshCw, Search, Send, Settings2, Smile, Video, Vote, Wifi, X } from 'lucide-react';
import { toLocalDateTime } from '../lib';

function labelFor(chat: any) { return chat?.display_name || chat?.name || (chat?.phone ? `+${chat.phone}` : chat?.jid || 'Conversa'); }
function fileName(path: string) { return path.split(/[\\/]/).pop() ?? path; }
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
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollOptions, setPollOptions] = useState('Sim\nNão');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const bottom = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const available = connected.find(account => account.id === accountId);
    if (!available && connected[0]) setAccountId(connected[0].id);
    const current = accounts.find(account => account.id === accountId);
    setProxy(current?.proxy ?? '');
  }, [accounts, accountId]);

  async function loadChats() {
    if (!accountId) { setChats([]); return; }
    try {
      const data = await window.attozap.webchat.list(accountId, search);
      setChats(data);
      if (selected) {
        const fresh = data.find((item: any) => item.jid === selected.jid);
        if (fresh) setSelected(fresh);
      }
      setError('');
    } catch (e: any) { setError(e?.message ?? String(e)); }
  }

  async function loadMessages(jid = selected?.jid) {
    if (!accountId || !jid) { setMessages([]); return; }
    try {
      setMessages(await window.attozap.webchat.messages(accountId, jid, 500));
      setTimeout(() => bottom.current?.scrollIntoView({ block: 'end' }), 25);
    } catch (e: any) { setError(e?.message ?? String(e)); }
  }

  useEffect(() => { void loadChats(); }, [accountId, search]);
  useEffect(() => { void loadMessages(); }, [accountId, selected?.jid]);
  useEffect(() => {
    const off = window.attozap.messages.onIncoming((payload: any) => {
      if (payload?.accountId !== accountId) return;
      void loadChats();
      if (selected?.jid && payload?.message?.remoteJid === selected.jid) void loadMessages(selected.jid);
    });
    return () => off?.();
  }, [accountId, selected?.jid]);

  const activeAccount = useMemo(() => accounts.find(account => account.id === accountId), [accounts, accountId]);
  const target = selected?.jid || newTarget.trim();

  async function openNewTarget() {
    if (!accountId || !newTarget.trim()) return;
    setBusy(true); setError('');
    try {
      const resolved = await window.attozap.webchat.resolve(accountId, newTarget.trim());
      setSelected({ jid: resolved, display_name: newTarget.trim(), last_message_at: new Date().toISOString() });
      setNewTarget('');
    } catch (e: any) { setError(e?.message ?? String(e)); }
    finally { setBusy(false); }
  }

  async function sendText() {
    if (!accountId || !target || !text.trim()) { setError('Selecione uma conversa ou informe um destinatário e digite a mensagem.'); return; }
    setBusy(true); setError('');
    try {
      const result = await window.attozap.webchat.sendText(accountId, target, text);
      const resolved = result.resolvedTarget ?? result.remoteJid ?? target;
      setText('');
      setSelected((current: any) => ({ ...(current ?? {}), jid: resolved, display_name: current?.display_name || current?.name || newTarget || resolved, last_message_at: new Date().toISOString() }));
      setNewTarget('');
      await loadChats(); await loadMessages(resolved);
    } catch (e: any) { setError(e?.message ?? String(e)); }
    finally { setBusy(false); }
  }

  async function attach(forceType?: 'sticker') {
    if (!accountId || !target) { setError('Selecione uma conversa ou informe um destinatário.'); return; }
    const filters = forceType === 'sticker' ? [{ name: 'Sticker WebP', extensions: ['webp'] }] : undefined;
    const paths = await window.attozap.files.pick({ multiple: false, filters });
    if (!paths?.[0]) return;
    const path = paths[0];
    const ext = fileName(path).split('.').pop()?.toLowerCase() ?? '';
    const type: 'image'|'video'|'document'|'audio'|'sticker' = forceType || (['jpg','jpeg','png','webp','gif'].includes(ext) ? 'image' : ['mp4','mov','mkv','webm'].includes(ext) ? 'video' : ['mp3','ogg','wav','m4a','opus'].includes(ext) ? 'audio' : 'document');
    setBusy(true); setError('');
    try {
      const result = await window.attozap.webchat.sendMedia(accountId, target, type, { path, fileName: fileName(path), ptt: type === 'audio' });
      const resolved = result.resolvedTarget ?? result.remoteJid ?? target;
      setSelected((current: any) => ({ ...(current ?? {}), jid: resolved, display_name: current?.display_name || current?.name || newTarget || resolved }));
      setNewTarget(''); await loadChats(); await loadMessages(resolved);
    } catch (e: any) { setError(e?.message ?? String(e)); }
    finally { setBusy(false); }
  }

  async function sendPoll() {
    const options = [...new Set(pollOptions.split(/\r?\n/).map(item => item.trim()).filter(Boolean))];
    if (!accountId || !target || !pollQuestion.trim() || options.length < 2) { setError('Informe uma pergunta e pelo menos duas opções.'); return; }
    setBusy(true); setError('');
    try {
      await window.attozap.webchat.sendPoll(accountId, target, { name: pollQuestion.trim(), values: options, selectableCount: 1 });
      setPollQuestion(''); setPollOptions('Sim\nNão'); setShowPoll(false); await loadMessages(target); await loadChats();
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
      <div><b>WebChat</b><span>JID/LID · mídia · pushname · perfil</span></div>
      <div className="head-actions"><select className="top-select" value={accountId} onChange={e => { setAccountId(e.target.value); setSelected(null); }}><option value="">Conta...</option>{connected.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}</select><button className="icon-button" title="Proxy" disabled={!accountId} onClick={() => setShowProxy(v => !v)}><Settings2 size={16}/></button><button className="icon-button" title="Atualizar" disabled={!accountId} onClick={() => { void loadChats(); void loadMessages(); }}><RefreshCw size={16}/></button></div>
    </div>
    {error && <div className="notice error webchat-notice">{error}<button onClick={() => setError('')}><X size={14}/></button></div>}
    {showProxy && <div className="webchat-proxy"><b>Proxy da conta</b><input value={proxy} onChange={e => setProxy(e.target.value)} placeholder="http://usuario:senha@host:porta"/><button className="button primary" onClick={() => void saveProxy()}>Salvar</button></div>}

    <div className="webchat-workspace">
      <aside className="webchat-list-pane">
        <div className="webchat-account"><span className="wa-avatar online"><Wifi size={16}/></span><div><b>{activeAccount?.name ?? 'Selecione uma conta'}</b><small>{activeAccount?.phone ? `+${activeAccount.phone}` : 'Sessão conectada'}</small></div></div>
        <div className="webchat-search"><Search size={15}/><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar conversa..."/></div>
        <div className="new-chat"><input value={newTarget} onChange={e => setNewTarget(e.target.value)} onKeyDown={e => e.key === 'Enter' && void openNewTarget()} placeholder="Novo: número, PN JID ou LID"/><button className="icon-button" disabled={busy || !newTarget.trim()} onClick={() => void openNewTarget()}><MessageCircle size={16}/></button></div>
        <div className="conversation-list">{chats.map(chat => <button key={chat.jid} className={selected?.jid === chat.jid ? 'active' : ''} onClick={() => setSelected(chat)}><Avatar chat={chat}/><span className="grow"><b>{labelFor(chat)}</b><small>{chat.last_text || (chat.last_message_type && chat.last_message_type !== 'text' ? `[${chat.last_message_type}]` : chat.jid)}</small></span><time>{chat.last_message_at ? new Date(chat.last_message_at).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}) : ''}</time></button>)}{!chats.length && <div className="empty mini"><MessageCircle size={25}/><p>Nenhuma conversa observada ainda.</p></div>}</div>
      </aside>

      <section className="webchat-thread-pane">
        <header><Avatar chat={selected} large/><div className="grow"><b>{selected ? labelFor(selected) : 'Selecione uma conversa'}</b><small>{selected?.jid ?? 'Envie para número/JID/LID para iniciar'}</small></div></header>
        <div className="message-stream">{messages.map(message => <div key={message.id} className={`chat-bubble ${message.direction === 'out' ? 'out' : 'in'} ${message.status === 'failed' ? 'failed' : ''}`}><MessageBody message={message}/><small>{toLocalDateTime(message.created_at)}{message.status === 'failed' ? ` · ${message.error || 'falhou'}` : message.direction === 'out' ? ` · ${message.status}` : ''}</small></div>)}{selected && !messages.length && <div className="empty mini"><MessageCircle size={26}/><p>Sem mensagens registradas nesta conversa.</p></div>}<div ref={bottom}/></div>
        {showPoll && <div className="poll-composer"><div className="field grow"><label>Pergunta</label><input value={pollQuestion} onChange={e => setPollQuestion(e.target.value)} placeholder="Qual opção você prefere?"/></div><div className="field grow"><label>Opções — uma por linha</label><textarea value={pollOptions} onChange={e => setPollOptions(e.target.value)}/></div><button className="button primary" disabled={busy} onClick={() => void sendPoll()}><Vote size={15}/> Enviar enquete</button></div>}
        <footer><button className="icon-button" disabled={busy || !target} onClick={() => void attach()} title="Imagem, vídeo, áudio ou documento"><Paperclip size={18}/></button><button className="icon-button" disabled={busy || !target} onClick={() => void attach('sticker')} title="Enviar figurinha WebP"><Smile size={18}/></button><button className={`icon-button ${showPoll ? 'active' : ''}`} disabled={busy || !target} onClick={() => setShowPoll(v => !v)} title="Enquete"><Vote size={18}/></button><textarea value={text} onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void sendText(); } }} placeholder="Digite uma mensagem..."/><button className="button primary send-chat" disabled={busy || !text.trim() || !target} onClick={() => void sendText()}>{busy ? <FileUp size={17}/> : <Send size={17}/>} Enviar</button></footer>
      </section>
    </div>
  </div>;
}

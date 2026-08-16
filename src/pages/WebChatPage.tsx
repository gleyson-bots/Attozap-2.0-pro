import { useEffect, useMemo, useRef, useState } from 'react';
import { FileUp, MessageCircle, Paperclip, RefreshCw, Search, Send, Settings2, Wifi } from 'lucide-react';
import { toLocalDateTime } from '../lib';

function labelFor(chat: any) { return chat.name || (chat.phone ? `+${chat.phone}` : chat.jid); }
function fileName(path: string) { return path.split(/[\\/]/).pop() ?? path; }

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
    try { setChats(await window.attozap.webchat.list(accountId, search)); setError(''); }
    catch (e: any) { setError(e?.message ?? String(e)); }
  }

  async function loadMessages(jid = selected?.jid) {
    if (!accountId || !jid) { setMessages([]); return; }
    try {
      setMessages(await window.attozap.webchat.messages(accountId, jid, 400));
      setTimeout(() => bottom.current?.scrollIntoView({ block: 'end' }), 20);
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

  async function openNewTarget() {
    if (!accountId || !newTarget.trim()) return;
    setBusy(true); setError('');
    try {
      const resolved = await window.attozap.webchat.resolve(accountId, newTarget.trim());
      setSelected({ jid: resolved, name: newTarget.trim(), last_message_at: new Date().toISOString() });
      setNewTarget('');
    } catch (e: any) { setError(e?.message ?? String(e)); }
    finally { setBusy(false); }
  }

  async function sendText() {
    const target = selected?.jid || newTarget.trim();
    if (!accountId || !target || !text.trim()) { setError('Selecione uma conversa ou informe um destinatário e digite a mensagem.'); return; }
    setBusy(true); setError('');
    try {
      const result = await window.attozap.webchat.sendText(accountId, target, text);
      const resolved = result.resolvedTarget ?? result.remoteJid ?? target;
      setText('');
      setSelected(current => ({ ...(current ?? {}), jid: resolved, name: current?.name || newTarget || resolved, last_message_at: new Date().toISOString() }));
      setNewTarget('');
      await loadChats();
      await loadMessages(resolved);
    } catch (e: any) { setError(e?.message ?? String(e)); }
    finally { setBusy(false); }
  }

  async function attach() {
    const target = selected?.jid || newTarget.trim();
    if (!accountId || !target) { setError('Selecione uma conversa ou informe um destinatário.'); return; }
    const paths = await window.attozap.files.pick({ multiple: false });
    if (!paths?.[0]) return;
    const path = paths[0];
    const ext = fileName(path).split('.').pop()?.toLowerCase() ?? '';
    const type: 'image'|'video'|'document'|'audio' = ['jpg','jpeg','png','webp','gif'].includes(ext) ? 'image' : ['mp4','mov','mkv','webm'].includes(ext) ? 'video' : ['mp3','ogg','wav','m4a','opus'].includes(ext) ? 'audio' : 'document';
    setBusy(true); setError('');
    try {
      const result = await window.attozap.webchat.sendMedia(accountId, target, type, { path, fileName: fileName(path), ptt: type === 'audio' });
      const resolved = result.resolvedTarget ?? result.remoteJid ?? target;
      setSelected(current => ({ ...(current ?? {}), jid: resolved, name: current?.name || newTarget || resolved }));
      setNewTarget('');
      await loadChats(); await loadMessages(resolved);
    } catch (e: any) { setError(e?.message ?? String(e)); }
    finally { setBusy(false); }
  }

  async function saveProxy() {
    if (!accountId) return;
    try { await window.attozap.accounts.setProxy(accountId, proxy.trim() || undefined); await reloadAccounts(); setShowProxy(false); setError(''); }
    catch (e: any) { setError(e?.message ?? String(e)); }
  }

  return <div className="page-stack webchat-page">
    <div className="page-head"><div><span className="kicker">WEBCHAT</span><h2>WhatsApp WebChat</h2><p>Converse usando as mesmas sessões do sender, com JID/LID nativos e histórico local.</p></div><div className="head-actions"><select className="top-select" value={accountId} onChange={e => { setAccountId(e.target.value); setSelected(null); }}><option value="">Conta...</option>{connected.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}</select><button className="button ghost" disabled={!accountId} onClick={() => setShowProxy(value => !value)}><Settings2 size={15}/> Proxy</button><button className="button ghost" disabled={!accountId} onClick={() => { void loadChats(); void loadMessages(); }}><RefreshCw size={15}/> Atualizar</button></div></div>
    {error && <div className="notice error">{error}</div>}
    {showProxy && <section className="card proxy-inline"><div><b>Proxy desta conta</b><small>HTTP/HTTPS, opcional. Ex.: http://usuario:senha@host:porta</small></div><input value={proxy} onChange={e => setProxy(e.target.value)} placeholder="http://host:porta"/><button className="button primary" onClick={() => void saveProxy()}>Salvar proxy</button></section>}
    <div className="webchat-shell">
      <aside className="webchat-list card"><div className="webchat-account"><span className="wa-avatar online"><Wifi size={16}/></span><div><b>{activeAccount?.name ?? 'Selecione uma conta'}</b><small>{activeAccount?.phone ? `+${activeAccount.phone}` : 'Sessão conectada'}</small></div></div><div className="webchat-search"><Search size={15}/><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar conversa..."/></div><div className="new-chat"><input value={newTarget} onChange={e => setNewTarget(e.target.value)} onKeyDown={e => e.key === 'Enter' && void openNewTarget()} placeholder="Novo: número, PN JID ou LID"/><button className="icon-button" disabled={busy || !newTarget.trim()} onClick={() => void openNewTarget()}><MessageCircle size={16}/></button></div><div className="conversation-list">{chats.map(chat => <button key={chat.jid} className={selected?.jid === chat.jid ? 'active' : ''} onClick={() => setSelected(chat)}><span className="conversation-avatar">{String(labelFor(chat)).slice(0,1).toUpperCase()}</span><span className="grow"><b>{labelFor(chat)}</b><small>{chat.last_text || chat.jid}</small></span><time>{chat.last_message_at ? new Date(chat.last_message_at).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}) : ''}</time></button>)}{!chats.length && <div className="empty mini"><MessageCircle size={25}/><p>Nenhuma conversa observada ainda.</p></div>}</div></aside>
      <section className="webchat-thread card"><header><div className="conversation-avatar large">{String(labelFor(selected ?? {jid:'?' })).slice(0,1).toUpperCase()}</div><div className="grow"><b>{selected ? labelFor(selected) : 'Selecione uma conversa'}</b><small>{selected?.jid ?? 'Envie para um número/JID/LID para iniciar'}</small></div></header><div className="message-stream">{messages.map(message => <div key={message.id} className={`chat-bubble ${message.direction === 'out' ? 'out' : 'in'} ${message.status === 'failed' ? 'failed' : ''}`}><div>{message.text || `[${message.message_type}]`}</div><small>{toLocalDateTime(message.created_at)}{message.status === 'failed' ? ` · ${message.error || 'falhou'}` : message.direction === 'out' ? ` · ${message.status}` : ''}</small></div>)}{selected && !messages.length && <div className="empty mini"><MessageCircle size={26}/><p>Sem mensagens registradas nesta conversa.</p></div>}<div ref={bottom}/></div><footer><button className="icon-button" disabled={busy || (!selected && !newTarget.trim())} onClick={() => void attach()} title="Anexar arquivo"><Paperclip size={18}/></button><textarea value={text} onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void sendText(); } }} placeholder="Digite uma mensagem..."/><button className="button primary send-chat" disabled={busy || !text.trim() || (!selected && !newTarget.trim())} onClick={() => void sendText()}>{busy ? <FileUp size={17}/> : <Send size={17}/>} Enviar</button></footer></section>
    </div>
  </div>;
}

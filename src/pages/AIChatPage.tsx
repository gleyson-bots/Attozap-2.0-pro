import { useEffect, useMemo, useState } from 'react';
import { Bot, Eraser, Send, Settings2, Sparkles } from 'lucide-react';

type AiMessage = { role: 'user' | 'assistant'; content: string };
type AiProvider = { id: string; label: string; model: string; configured: boolean; protocol: string };

export function AIChatPage({ openSettings }: { openSettings?: () => void }) {
  const [providers, setProviders] = useState<AiProvider[]>([]);
  const [provider, setProvider] = useState('openai');
  const [model, setModel] = useState('');
  const [system, setSystem] = useState('Você é um assistente útil dentro do ATTOZAP. Responda em português, seja claro e não invente ações que não executou.');
  const [text, setText] = useState('');
  const [messages, setMessages] = useState<AiMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function loadProviders() {
    try {
      const rows = await window.attozap.ai.providers();
      setProviders(rows);
      const current = rows.find((item: AiProvider) => item.id === provider) ?? rows.find((item: AiProvider) => item.configured) ?? rows[0];
      if (current) { setProvider(current.id); setModel(current.model); }
    } catch (e: any) { setError(e?.message ?? String(e)); }
  }

  useEffect(() => { void loadProviders(); }, []);

  const selected = useMemo(() => providers.find(item => item.id === provider), [providers, provider]);
  const configuredProviders = providers.filter(item => item.configured);

  async function send() {
    const content = text.trim();
    if (!content || busy) return;
    if (!selected?.configured) { setError(`Configure a API key do ${selected?.label ?? 'provedor'} em Configurações.`); return; }
    const next: AiMessage[] = [...messages, { role: 'user', content }];
    setMessages(next); setText(''); setBusy(true); setError('');
    try {
      const result = await window.attozap.ai.chat({ provider, model: model.trim() || selected.model, system, messages: next, temperature: 0.6, maxTokens: 1200 });
      setMessages(current => [...current, { role: 'assistant', content: result.text }]);
    } catch (e: any) { setError(e?.message ?? String(e)); setMessages(current => current.slice(0, -1)); }
    finally { setBusy(false); }
  }

  function changeProvider(value: string) {
    setProvider(value);
    const item = providers.find(row => row.id === value);
    setModel(item?.model ?? '');
  }

  return <div className="page-stack ai-chat-page">
    <div className="page-head"><div><span className="kicker">LOCAL AI CHAT</span><h2>Chat IA</h2><p>Converse com um provedor configurado localmente. As chaves não passam pelo renderer e o histórico não é persistido automaticamente.</p></div><div className="head-actions"><button className="button ghost" onClick={() => openSettings?.()}><Settings2 size={15}/> Configurar provedores</button><button className="button ghost" onClick={() => { setMessages([]); setError(''); }}><Eraser size={15}/> Limpar</button></div></div>
    {error && <div className="notice error">{error}</div>}
    <div className="ai-chat-layout">
      <section className="card ai-chat-card">
        <div className="card-head"><div><h3>Conversa</h3><p>{configuredProviders.length} provedor{configuredProviders.length === 1 ? '' : 'es'} configurado{configuredProviders.length === 1 ? '' : 's'}.</p></div><Bot size={18}/></div>
        <div className="ai-message-stream">{!messages.length && <div className="empty mini"><Sparkles size={26}/><p>Faça uma pergunta para começar.</p></div>}{messages.map((message, index) => <div className={`ai-message ${message.role}`} key={`${message.role}-${index}`}><span>{message.role === 'user' ? 'Você' : 'IA'}</span><p>{message.content}</p></div>)}{busy && <div className="ai-message assistant pending"><span>IA</span><p>Processando…</p></div>}</div>
        <div className="ai-composer"><textarea value={text} onChange={event => setText(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void send(); } }} placeholder="Escreva uma mensagem…" disabled={busy}/><button className="button primary" onClick={() => void send()} disabled={busy || !text.trim()}>{busy ? 'Aguarde…' : <><Send size={15}/> Enviar</>}</button></div>
      </section>
      <aside className="card ai-chat-settings"><div className="card-head"><div><h3>Controlo da sessão</h3><p>Configuração da conversa atual.</p></div><Settings2 size={18}/></div>
        <div className="field"><label>Provedor</label><select value={provider} onChange={event => changeProvider(event.target.value)}>{providers.map(item => <option key={item.id} value={item.id}>{item.label}{item.configured ? '' : ' — não configurado'}</option>)}</select></div>
        <div className="field"><label>Modelo</label><input value={model} onChange={event => setModel(event.target.value)} placeholder="Modelo do provedor"/></div>
        <div className="field"><label>Prompt de sistema</label><textarea value={system} onChange={event => setSystem(event.target.value)} /></div>
        <div className={`notice ${selected?.configured ? 'success' : 'warning'}`}>{selected?.configured ? `${selected.label} pronto para uso.` : `Configure a chave do ${selected?.label ?? 'provedor'} em Configurações.`}</div>
      </aside>
    </div>
  </div>;
}

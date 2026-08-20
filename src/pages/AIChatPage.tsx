import { useEffect, useMemo, useState } from 'react';
import { Bot, Download, Eraser, Image as ImageIcon, LoaderCircle, Send, Settings2, Sparkles, Wand2, X } from 'lucide-react';

type AiMessage = { role: 'user' | 'assistant'; content: string };
type AiMode = 'chat' | 'image';

export function AIChatPage({ openSettings }: { openSettings?: () => void }) {
  const [providers, setProviders] = useState<AttozapAiProvider[]>([]);
  const [provider, setProvider] = useState('openai');
  const [model, setModel] = useState('');
  const [system, setSystem] = useState('Você é um assistente útil dentro do ATTOZAP. Responda em português, seja claro e não invente ações que não executou.');
  const [text, setText] = useState('');
  const [messages, setMessages] = useState<AiMessage[]>([]);
  const [mode, setMode] = useState<AiMode>('chat');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [imageProvider, setImageProvider] = useState('openai');
  const [imageModel, setImageModel] = useState('');
  const [imagePrompt, setImagePrompt] = useState('');
  const [imageNegativePrompt, setImageNegativePrompt] = useState('');
  const [imageRatio, setImageRatio] = useState('1:1');
  const [imageQuality, setImageQuality] = useState<'auto' | 'low' | 'medium' | 'high'>('auto');
  const [imageUrl, setImageUrl] = useState('');
  const [imageMeta, setImageMeta] = useState<{ provider?: string; model?: string; width?: number; height?: number } | null>(null);

  async function loadProviders() {
    try {
      const rows = await window.attozap.ai.providers();
      const next = Array.isArray(rows) ? rows : [];
      setProviders(next);
      const current = next.find(item => item.id === provider && item.configured) ?? next.find(item => item.configured) ?? next[0];
      if (current) { setProvider(current.id); setModel(current.model); }
      const image = next.find(item => item.id === imageProvider && item.imageSupported) ?? next.find(item => item.imageSupported) ?? next[0];
      if (image) { setImageProvider(image.id); setImageModel(image.imageModel ?? ''); }
    } catch (e: any) { setError(e?.message ?? String(e)); }
  }

  useEffect(() => { void loadProviders(); }, []);

  const selected = useMemo(() => providers.find(item => item.id === provider), [providers, provider]);
  const selectedImage = useMemo(() => providers.find(item => item.id === imageProvider), [providers, imageProvider]);
  const configuredProviders = providers.filter(item => item.configured);
  const imageProviders = providers.filter(item => item.imageSupported);

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

  async function generateImage() {
    const prompt = imagePrompt.trim();
    if (!prompt || busy) return;
    if (!selectedImage?.imageSupported) { setError('Selecione um provedor de geração de imagens.'); return; }
    if (!selectedImage.imageConfigured) { setError(`Configure a API de imagens do ${selectedImage.label} em Configurações.`); return; }
    const [ratioWidth, ratioHeight] = imageRatio.split(':').map(Number);
    const base = 1024;
    const width = ratioWidth > ratioHeight ? Math.round(base * Math.min(2, ratioWidth / ratioHeight)) : base;
    const height = ratioHeight > ratioWidth ? Math.round(base * Math.min(2, ratioHeight / ratioWidth)) : base;
    setBusy(true); setError(''); setImageUrl(''); setImageMeta(null);
    try {
      const result = await window.attozap.ai.image({ provider: imageProvider, model: imageModel.trim() || selectedImage.imageModel, prompt, negativePrompt: imageNegativePrompt.trim() || undefined, width, height, aspectRatio: imageRatio, quality: imageQuality, outputFormat: 'png' });
      setImageUrl(String(result?.url ?? result?.dataUrl ?? ''));
      setImageMeta({ provider: selectedImage.label, model: result?.model ?? imageModel, width: result?.width ?? width, height: result?.height ?? height });
    } catch (e: any) { setError(e?.message ?? String(e)); }
    finally { setBusy(false); }
  }

  function changeProvider(value: string) {
    setProvider(value);
    const item = providers.find(row => row.id === value);
    setModel(item?.model ?? '');
  }

  function changeImageProvider(value: string) {
    setImageProvider(value);
    const item = providers.find(row => row.id === value);
    setImageModel(item?.imageModel ?? '');
  }

  return <div className="page-stack ai-chat-page ai-chat-full">
    <div className="page-head"><div><span className="kicker">LOCAL AI WORKSPACE</span><h2>Chat IA</h2><p>Converse, reescreva textos e gere imagens usando os provedores configurados localmente. As chaves permanecem no processo Electron.</p></div><div className="head-actions"><button className="button ghost" onClick={() => openSettings?.()}><Settings2 size={15}/> Configurar provedores</button><button className="button ghost" onClick={() => { setMessages([]); setImageUrl(''); setError(''); }}><Eraser size={15}/> Limpar</button></div></div>
    {error && <div className="notice error">{error}</div>}
    <div className="ai-workspace-toolbar"><div className="ai-mode-tabs"><button className={mode === 'chat' ? 'active' : ''} onClick={() => setMode('chat')}><Bot size={15}/> Conversa</button><button className={mode === 'image' ? 'active' : ''} onClick={() => setMode('image')}><ImageIcon size={15}/> Gerar imagem</button></div><span className="ai-workspace-status"><span className="live-dot"/> {configuredProviders.length} provedor{configuredProviders.length === 1 ? '' : 'es'} de texto · {imageProviders.length} gerador{imageProviders.length === 1 ? '' : 'es'} disponível{imageProviders.length === 1 ? '' : 'eis'}</span></div>
    {mode === 'chat' ? <div className="ai-chat-layout ai-chat-layout-full"><section className="ai-chat-card ai-chat-conversation"><div className="card-head"><div><h3>Conversa</h3><p>Histórico mantido apenas nesta sessão.</p></div><Bot size={18}/></div><div className="ai-message-stream">{!messages.length && <div className="empty mini"><Sparkles size={26}/><p>Faça uma pergunta para começar.</p></div>}{messages.map((message, index) => <div className={`ai-message ${message.role}`} key={`${message.role}-${index}`}><span>{message.role === 'user' ? 'Você' : 'IA'}</span><p>{message.content}</p></div>)}{busy && <div className="ai-message assistant pending"><span>IA</span><p>Processando…</p></div>}</div><div className="ai-composer"><textarea value={text} onChange={event => setText(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void send(); } }} placeholder="Escreva uma mensagem…" disabled={busy}/><button className="button primary" onClick={() => void send()} disabled={busy || !text.trim()}>{busy ? <LoaderCircle className="spin" size={15}/> : <Send size={15}/>} {busy ? 'Aguarde…' : 'Enviar'}</button></div></section><aside className="ai-chat-settings"><div className="card-head"><div><h3>Controlo da sessão</h3><p>Modelo e instruções desta conversa.</p></div><Settings2 size={18}/></div><div className="field"><label>Provedor</label><select value={provider} onChange={event => changeProvider(event.target.value)}>{providers.map(item => <option key={item.id} value={item.id}>{item.label}{item.configured ? '' : ' — não configurado'}</option>)}</select></div><div className="field"><label>Modelo</label><input value={model} onChange={event => setModel(event.target.value)} placeholder="Modelo do provedor"/></div><div className="field"><label>Prompt de sistema</label><textarea value={system} onChange={event => setSystem(event.target.value)} /></div><div className={`notice ${selected?.configured ? 'success' : 'warning'}`}>{selected?.configured ? `${selected.label} pronto para uso.` : `Configure a chave do ${selected?.label ?? 'provedor'} em Configurações.`}</div></aside></div> : <div className="ai-image-layout"><section className="ai-image-stage">{imageUrl ? <><div className="ai-generated-image"><img src={imageUrl} alt={imagePrompt}/></div><div className="ai-image-result-bar"><span>{imageMeta?.provider} · {imageMeta?.model} · {imageMeta?.width} × {imageMeta?.height}px</span><a className="button ghost" href={imageUrl} download="attozap-ai-image.png" target="_blank" rel="noreferrer"><Download size={15}/> Descarregar</a></div></> : <div className="empty ai-image-empty"><ImageIcon size={42}/><h3>A sua imagem aparece aqui</h3><p>Descreva a cena, o estilo e os elementos que deseja gerar.</p></div>}</section><aside className="ai-image-settings"><div className="card-head"><div><h3>Gerador de imagem</h3><p>Escolha um adaptador disponível na sua configuração.</p></div><Wand2 size={18}/></div><div className="field"><label>Provedor</label><select value={imageProvider} onChange={event => changeImageProvider(event.target.value)}>{imageProviders.map(item => <option key={item.id} value={item.id}>{item.label}{item.imageConfigured ? '' : ' — não configurado'}</option>)}</select></div><div className="field"><label>Modelo</label><input value={imageModel} onChange={event => setImageModel(event.target.value)} placeholder="Modelo de imagem"/></div><div className="field"><label>Prompt</label><textarea value={imagePrompt} onChange={event => setImagePrompt(event.target.value)} placeholder="Uma ilustração editorial de…" /></div><div className="field"><label>Prompt negativo <small>(opcional)</small></label><input value={imageNegativePrompt} onChange={event => setImageNegativePrompt(event.target.value)} placeholder="baixa qualidade, texto ilegível…"/></div><div className="ai-image-grid"><div className="field"><label>Proporção</label><select value={imageRatio} onChange={event => setImageRatio(event.target.value)}><option value="1:1">Quadrada · 1:1</option><option value="4:3">Paisagem · 4:3</option><option value="16:9">Panorâmica · 16:9</option><option value="3:4">Retrato · 3:4</option><option value="9:16">Vertical · 9:16</option></select></div><div className="field"><label>Qualidade</label><select value={imageQuality} onChange={event => setImageQuality(event.target.value as typeof imageQuality)}><option value="auto">Automática</option><option value="low">Baixa</option><option value="medium">Média</option><option value="high">Alta</option></select></div></div><button className="button primary ai-generate-button" disabled={busy || !imagePrompt.trim() || !selectedImage?.imageConfigured} onClick={() => void generateImage()}>{busy ? <LoaderCircle className="spin" size={16}/> : <Sparkles size={16}/>} {busy ? 'A gerar…' : 'Gerar imagem'}</button>{selectedImage && !selectedImage.imageConfigured && <div className="notice warning">Configure a chave de imagens deste provedor em Configurações.</div>}</aside></div>}
  </div>;
}

import { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  ArrowRight, Bot, Check, ChevronDown, Download, FileText, Flame, Gauge, Layers3,
  Mail, Menu, MessageCircle, Moon, MousePointerClick, PlayCircle, RefreshCw, Search, Send,
  ShieldCheck, Sparkles, Sun, Users, Wifi, X, Zap
} from 'lucide-react';
import './styles.css';

const RELEASE_API = 'https://api.github.com/repos/gleyson-bots/ATTOZAP-DOWNLOAD/releases/latest';
const RELEASE_PAGE = 'https://github.com/gleyson-bots/ATTOZAP-DOWNLOAD/releases/latest';
const BLOCKED_RELEASES = new Set(['v2.0.0-rc.8']);
const SALES_WHATSAPP = String(import.meta.env.VITE_SALES_WHATSAPP || '').replace(/\D/g, '');
const SALES_EMAIL = import.meta.env.VITE_SALES_EMAIL || 'vendas@attozap.com.br';
const WHATSAPP_URL = SALES_WHATSAPP
  ? `https://wa.me/${SALES_WHATSAPP}?text=${encodeURIComponent('Olá! Quero conhecer o ATTOZAP WASender Pro.')}`
  : '#contato';

const features = [
  ['WebChat completo', 'Converse em tempo real, visualize mídias, documentos, áudios, figurinhas, enquetes e organize múltiplas sessões.', MessageCircle],
  ['Envios organizados', 'Campanhas com listas, templates, variáveis personalizadas, agendamentos e acompanhamento de resultados.', Send],
  ['Multi-conta', 'Centralize várias sessões em um único aplicativo e escolha o canal certo para cada operação.', Layers3],
  ['Ferramentas de grupos', 'Gerencie grupos, participantes, convites e rotinas em lote com uma experiência mais simples.', Users],
  ['Automação local', 'Auto Reply, templates e rotinas locais para reduzir tarefas repetitivas.', Bot],
  ['Health Center', 'Diagnóstico local, backups, integridade do banco e estado real das sessões.', Gauge],
  ['Google Maps & extratores', 'Pesquise negócios e organize contatos dentro do fluxo do aplicativo.', Search],
  ['Aquecimento controlado', 'Rotinas entre contas próprias e grupos permitidos, com intervalos e histórico.', Flame],
];

const faqs = [
  ['O ATTOZAP funciona no navegador?', 'Não. O produto principal é um aplicativo desktop para Windows.'],
  ['Preciso manter um servidor próprio?', 'Não para as funções locais. Banco, sessões e configurações ficam no computador do usuário.'],
  ['Posso usar mais de uma conta?', 'Sim. O ATTOZAP possui gerenciamento multi-conta e seletor de canal.'],
  ['Como o download é atualizado?', 'A landing consulta o repositório público ATTOZAP-DOWNLOAD e mostra automaticamente a release válida mais recente.'],
  ['Como funciona a licença?', 'A licença é ativada no próprio aplicativo e os limites dependem do plano contratado.'],
];

const formatBytes = (bytes=0) => {
  if (!bytes) return '';
  const mb = bytes / 1024 / 1024;
  return `${mb.toFixed(mb >= 100 ? 0 : 1)} MB`;
};

function App() {
  const [dark, setDark] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [faqOpen, setFaqOpen] = useState(0);
  const [release, setRelease] = useState({ loading: true, available: false, version: '', url: '', size: '', reason: '' });

  useEffect(() => {
    const saved = localStorage.getItem('attozap-site-theme');
    const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
    setDark(saved ? saved === 'dark' : prefersDark);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    localStorage.setItem('attozap-site-theme', dark ? 'dark' : 'light');
  }, [dark]);

  const loadRelease = async () => {
    setRelease(r => ({ ...r, loading: true }));
    try {
      const response = await fetch(RELEASE_API, { headers: { Accept: 'application/vnd.github+json' } });
      if (!response.ok) throw new Error(`GitHub ${response.status}`);
      const data = await response.json();
      const asset = data.assets?.find(a => /ATTOZAP-WASender-Pro.*\.exe$/i.test(a.name));
      const blocked = BLOCKED_RELEASES.has(data.tag_name);
      if (!asset) {
        setRelease({ loading:false, available:false, version:data.tag_name || '', url:'', size:'', reason:'Nenhum executável foi publicado nesta release.' });
        return;
      }
      if (blocked) {
        setRelease({ loading:false, available:false, version:data.tag_name, url:'', size:formatBytes(asset.size), reason:'Esta versão está em manutenção e foi retirada temporariamente do download.' });
        return;
      }
      setRelease({ loading:false, available:true, version:data.tag_name, url:asset.browser_download_url, size:formatBytes(asset.size), reason:'' });
    } catch (error) {
      setRelease({ loading:false, available:false, version:'', url:'', size:'', reason:'Não foi possível consultar a versão mais recente agora.' });
    }
  };

  useEffect(() => { loadRelease(); }, []);

  const year = useMemo(() => new Date().getFullYear(), []);
  const go = id => { setMenuOpen(false); document.querySelector(id)?.scrollIntoView({ behavior:'smooth', block:'start' }); };
  const downloadLabel = release.loading ? 'Consultando versão...' : release.available ? `Baixar ${release.version}` : 'Download temporariamente indisponível';

  const DownloadButton = ({ compact=false }) => release.available
    ? <a className={`btn primary ${compact ? 'compact' : 'large'}`} href={release.url}><Download size={compact?17:19}/> {compact ? 'Download' : downloadLabel}</a>
    : <button className={`btn primary disabled ${compact ? 'compact' : 'large'}`} disabled><Download size={compact?17:19}/> {compact ? 'Indisponível' : downloadLabel}</button>;

  return <>
    <header className="site-header"><div className="container nav-wrap">
      <button className="brand" onClick={()=>go('#inicio')}><img src="/logo.svg" alt="ATTOZAP"/><span><b>ATTOZAP</b><small>WASENDER PRO</small></span></button>
      <nav className={menuOpen?'nav open':'nav'}><button onClick={()=>go('#recursos')}>Recursos</button><button onClick={()=>go('#produto')}>Produto</button><button onClick={()=>go('#como-funciona')}>Como funciona</button><button onClick={()=>go('#faq')}>FAQ</button><button onClick={()=>go('#contato')}>Contato</button></nav>
      <div className="nav-actions"><button className="icon-btn" onClick={()=>setDark(v=>!v)}>{dark?<Sun size={18}/>:<Moon size={18}/>}</button><div className="desktop-cta"><DownloadButton compact/></div><button className="menu-btn" onClick={()=>setMenuOpen(v=>!v)}>{menuOpen?<X/>:<Menu/>}</button></div>
    </div></header>

    <main>
      <section className="hero" id="inicio"><div className="hero-glow glow-a"/><div className="hero-glow glow-b"/><div className="container hero-grid">
        <div className="hero-copy reveal"><div className="eyebrow"><Sparkles size={15}/> Seu WhatsApp de trabalho, mais organizado.</div><h1>Envie, converse e gerencie <span>sem complicação.</span></h1><p>WebChat, campanhas, multi-conta, grupos, automações e ferramentas de produtividade em uma experiência desktop moderna para Windows.</p><div className="hero-actions"><DownloadButton/><button className="btn secondary large" onClick={()=>go('#produto')}><PlayCircle size={19}/> Conhecer o produto</button></div><div className="release-inline"><span className={release.available?'dot ok':'dot warn'}/>{release.loading?'Consultando GitHub Releases…':release.available?`${release.version} · ${release.size} · disponível`:release.reason}</div><div className="trust-row"><span><Check/> Aplicativo desktop</span><span><Check/> Dados locais</span><span><Check/> Multi-conta</span></div></div>
        <div className="product-stage reveal delay-1"><div className="window"><div className="window-bar"><span/><span/><span/><small>ATTOZAP 2.0 Pro</small></div><div className="app-demo"><aside className="demo-sidebar"><div className="demo-brand"><img src="/logo.svg"/><b>ATTOZAP</b></div><div className="demo-online"><Wifi size={15}/><span><b>2 contas online</b><small>2 configuradas</small></span></div>{['Visão geral','Contact Sender','Group Sender','Agendamentos','Templates','Contas','WebChat','Contatos & listas'].map((x,i)=><div className={i===0?'demo-nav active':'demo-nav'} key={x}><i/><span>{x}</span></div>)}</aside><section className="demo-main"><div className="demo-top"><span><small>ATTOZAP / WASENDER</small><b>Visão geral</b></span><em>WhatsApp ativo</em></div><div className="demo-hero"><div><small>WASENDER DESKTOP</small><h3>Envie, converse e organize sem complicação.</h3><p>Sender, WebChat, grupos, filtros e automações.</p><button>Novo envio</button></div><img src="/logo.svg"/></div><div className="demo-stats"><article><small>Contas online</small><b>2/2</b></article><article><small>Enviadas</small><b>1.248</b></article><article><small>Taxa de sucesso</small><b>98.7%</b></article></div></section></div></div><div className="float-card card-one"><ShieldCheck/><span><b>Health Center</b><small>Sistema operacional</small></span></div><div className="float-card card-two"><MessageCircle/><span><b>WebChat</b><small>Conversa em tempo real</small></span></div></div>
      </div></section>

      <section className="proof-strip"><div className="container proof-grid"><div><b>Multi-conta</b><span>Centralize seus canais</span></div><div><b>Desktop</b><span>Experiência focada no Windows</span></div><div><b>WebChat</b><span>Converse sem trocar de tela</span></div><div><b>Local-first</b><span>Banco, sessões e configurações locais</span></div></div></section>

      <section className="section" id="recursos"><div className="container"><div className="section-head"><span className="eyebrow"><Zap size={14}/> TUDO EM UM SÓ LUGAR</span><h2>Ferramentas para trabalhar com mais velocidade.</h2><p>Uma interface única para tarefas que antes exigiam várias janelas, planilhas e utilitários separados.</p></div><div className="feature-grid">{features.map(([title,text,Icon],i)=><article className="feature-card" key={title}><div className="feature-icon"><Icon/></div><span>0{i+1}</span><h3>{title}</h3><p>{text}</p><ArrowRight size={17}/></article>)}</div></div></section>

      <section className="section split-section" id="produto"><div className="container split-grid"><div className="visual-panel"><div className="chat-mock"><div className="chat-head"><div className="avatar">C</div><span><b>Comercial</b><small>online agora</small></span><div className="status-dot"/></div><div className="chat-body"><div className="bubble in">Olá! Gostaria de conhecer o produto.</div><div className="bubble out">Claro! Posso te mostrar os principais recursos do ATTOZAP.</div><div className="media-row"><div>IMG</div><div>AUDIO</div><div>DOC</div></div><div className="composer">Digite uma mensagem... <Send size={16}/></div></div></div></div><div className="split-copy"><span className="eyebrow"><MessageCircle size={14}/> WEBCHAT</span><h2>Uma experiência de conversa feita para ocupar a tela inteira.</h2><p>Escolha a sessão, encontre conversas, visualize perfil, histórico e mídias e responda sem abandonar o ATTOZAP.</p><ul><li><Check/> Fotos, nomes e identidades organizadas</li><li><Check/> Imagens, vídeos, áudios, documentos e figurinhas</li><li><Check/> Seletor de canal para múltiplas contas</li><li><Check/> Histórico local e busca de conversas</li></ul></div></div></section>

      <section className="section workflow" id="como-funciona"><div className="container"><div className="section-head centered"><span className="eyebrow"><MousePointerClick size={14}/> COMEÇAR É SIMPLES</span><h2>Do download ao primeiro envio em poucos passos.</h2></div><div className="steps"><article><span>01</span><div className="step-icon"><Download/></div><h3>Baixe</h3><p>A página valida a release pública antes de liberar o executável.</p></article><article><span>02</span><div className="step-icon"><ShieldCheck/></div><h3>Ative sua licença</h3><p>Insira a chave fornecida no momento da contratação.</p></article><article><span>03</span><div className="step-icon"><Wifi/></div><h3>Conecte sua conta</h3><p>Adicione uma ou mais sessões e escolha o canal desejado.</p></article><article><span>04</span><div className="step-icon"><Send/></div><h3>Comece a trabalhar</h3><p>Use WebChat, envios, grupos, templates e automações.</p></article></div></div></section>

      <section className="section download-section" id="download"><div className="container download-card"><div><span className="eyebrow"><Download size={14}/> WINDOWS</span><h2>Leve o ATTOZAP para o seu desktop.</h2><p>O site consulta o GitHub Releases em tempo real e só libera versões aprovadas para download.</p><div className="mini-list"><span><Check/> Windows 10/11 64-bit</span><span><Check/> Interface clara e escura</span><span><Check/> Download público pelo GitHub</span></div></div><div className="download-actions"><img src="/logo.svg"/><div className={`release-card ${release.available?'ready':'blocked'}`}><b>{release.loading?'Consultando release…':release.available?release.version:'Download pausado'}</b><span>{release.loading?'Aguarde alguns segundos.':release.available?`${release.size} · GitHub Releases`:release.reason}</span></div><DownloadButton/><div className="release-links"><button onClick={loadRelease}><RefreshCw size={14}/> Atualizar</button><a href={RELEASE_PAGE} target="_blank" rel="noreferrer">Ver releases</a></div></div></div></section>

      <section className="section" id="faq"><div className="container faq-grid"><div><span className="eyebrow"><FileText size={14}/> DÚVIDAS FREQUENTES</span><h2>Antes de começar.</h2><p>Respostas rápidas sobre instalação, licença e uso do aplicativo.</p></div><div className="faq-list">{faqs.map(([q,a],i)=><article className={faqOpen===i?'faq-item open':'faq-item'} key={q}><button onClick={()=>setFaqOpen(faqOpen===i?-1:i)}><span>{q}</span><ChevronDown/></button><div><p>{a}</p></div></article>)}</div></div></section>

      <section className="section contact-section" id="contato"><div className="container contact-card"><div><span className="eyebrow"><Sparkles size={14}/> FALE COM A GENTE</span><h2>Quer contratar o ATTOZAP?</h2><p>Converse com o comercial, tire dúvidas sobre licenças e escolha a configuração ideal.</p></div><div className="contact-actions"><a className="btn whatsapp large" href={WHATSAPP_URL} target="_blank" rel="noreferrer"><MessageCircle/> Falar pelo WhatsApp</a><a className="btn secondary large" href={`mailto:${SALES_EMAIL}?subject=${encodeURIComponent('ATTOZAP WASender Pro - Comercial')}`}><Mail/> {SALES_EMAIL}</a></div></div></section>
    </main>

    <footer><div className="container footer-grid"><div className="brand footer-brand"><img src="/logo.svg"/><span><b>ATTOZAP</b><small>WASENDER PRO</small></span></div><p>ATTO FLOW BY GLEYSONDEVS · © {year}</p><div><button onClick={()=>go('#recursos')}>Recursos</button><button onClick={()=>go('#faq')}>FAQ</button><button onClick={()=>go('#contato')}>Contato</button></div></div></footer>
  </>;
}

createRoot(document.getElementById('root')).render(<App/>);

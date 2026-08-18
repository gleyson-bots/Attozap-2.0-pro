import { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  ArrowRight, Bot, Boxes, Check, ChevronDown, CircleDot, ContactRound, Database,
  Download, ExternalLink, FileText, Fingerprint, Flame, Gauge, Github, Globe2,
  Layers3, Mail, Menu, MessageCircle, Moon, Orbit, RefreshCw, Search, Send,
  ShieldCheck, Sparkles, Sun, Users, Wifi, Workflow, X, Zap
} from 'lucide-react';
import './styles.css';

const RELEASE_API = 'https://api.github.com/repos/gleyson-bots/ATTOZAP-DOWNLOAD/releases/latest';
const RELEASE_PAGE = 'https://github.com/gleyson-bots/ATTOZAP-DOWNLOAD/releases/latest';
const STABLE_DOWNLOAD = 'https://github.com/gleyson-bots/ATTOZAP-DOWNLOAD/releases/latest/download/ATTOZAP-WASender-Pro-x64.exe';
const SALES_WHATSAPP = String(import.meta.env.VITE_SALES_WHATSAPP || '').replace(/\D/g, '');
const SALES_EMAIL = import.meta.env.VITE_SALES_EMAIL || 'vendas@attozap.com.br';
const WHATSAPP_URL = SALES_WHATSAPP
  ? `https://wa.me/${SALES_WHATSAPP}?text=${encodeURIComponent('Olá! Quero conhecer o ATTOZAP WASender Pro.')}`
  : '#contato';

const featureCards = [
  { icon: MessageCircle, title: 'WebChat', text: 'Converse em uma área completa, com seletor de canal, histórico, fotos, pushname e suporte a mídias.', tag: 'Conversas' },
  { icon: Layers3, title: 'Multi-conta', text: 'Mantenha várias sessões independentes e escolha exatamente qual canal usar em cada ferramenta.', tag: 'WhatsApp' },
  { icon: Send, title: 'Sender', text: 'Organize listas, templates, variáveis, anexos, agendamentos e acompanhamento dos envios.', tag: 'Envios' },
  { icon: Users, title: 'Grupos', text: 'Sincronize grupos, trabalhe com membros, convites, criação e tarefas em lote.', tag: 'Grupos' },
  { icon: Bot, title: 'Auto Reply', text: 'Respostas automáticas locais com regras simples, prioridades e condições configuráveis.', tag: 'Automação' },
  { icon: Fingerprint, title: 'JID / LID', text: 'Identidade moderna com canonical JID, LID, PN JID e telefone tratados separadamente.', tag: 'Identidade' },
  { icon: Search, title: 'Extratores', text: 'Ferramentas para Google Maps, websites e organização de contatos no próprio fluxo do app.', tag: 'Produtividade' },
  { icon: Flame, title: 'Aquecimento controlado', text: 'Rotinas entre contas próprias e grupos permitidos, com monitor de turnos, limites e biblioteca local.', tag: 'Laboratório' },
];

const showcase = [
  { id: 'dashboard', label: 'Visão geral', icon: Gauge, title: 'Tudo importante em uma única leitura.', text: 'Contas conectadas, campanhas recentes, saúde do aplicativo e atalhos para o que realmente importa.', accent: 'dashboard' },
  { id: 'webchat', label: 'WebChat', icon: MessageCircle, title: 'Uma conversa que realmente ocupa o espaço.', text: 'Painel de conversas, canal ativo, mensagens, mídia, estados e identidade JID/LID em uma experiência desktop.', accent: 'webchat' },
  { id: 'sender', label: 'Sender', icon: Send, title: 'Prepare, revise e execute seus envios.', text: 'Listas, templates, mídia e variáveis no mesmo fluxo, sem depender de uma coleção de ferramentas separadas.', accent: 'sender' },
  { id: 'health', label: 'Health Center', icon: ShieldCheck, title: 'Diagnóstico local antes que um problema vire suporte.', text: 'SQLite, espaço em disco, sessões, falhas recentes, backup, restauração e diagnóstico em um único lugar.', accent: 'health' },
];

const faqs = [
  ['O ATTOZAP precisa de um servidor próprio?', 'Não para as funções locais do aplicativo. Banco, configurações e sessões ficam no computador do usuário. Recursos externos, como WhatsApp, Google ou IA, dependem naturalmente dos respectivos serviços.'],
  ['O aplicativo suporta mais de uma conta?', 'Sim. O gerenciamento é multi-conta e diversas ferramentas possuem seletor de canal para escolher a sessão utilizada.'],
  ['Como funciona JID e LID?', 'O ATTOZAP trata canonical JID, LID, PN JID e telefone como identidades relacionadas, sem transformar automaticamente um LID em número de telefone.'],
  ['Onde o executável fica hospedado?', 'O download público é servido pelo GitHub Releases no repositório ATTOZAP-DOWNLOAD. A landing consulta a release mais recente automaticamente.'],
  ['Como funciona a licença?', 'A ativação acontece dentro do aplicativo. A licença pode definir validade, limites e recursos conforme o plano comercial.'],
  ['Posso escolher tema claro ou escuro?', 'Sim. Tanto a landing quanto o aplicativo trabalham com uma experiência visual moderna e opções de aparência.'],
];

function formatBytes(bytes = 0) {
  if (!bytes) return '';
  const mb = bytes / 1024 / 1024;
  return `${mb.toFixed(mb >= 100 ? 0 : 1)} MB`;
}

function App() {
  const [dark, setDark] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [faqOpen, setFaqOpen] = useState(0);
  const [showcaseId, setShowcaseId] = useState('dashboard');
  const [release, setRelease] = useState({ loading: true, version: '', url: STABLE_DOWNLOAD, size: '', error: '' });

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
    setRelease(current => ({ ...current, loading: true, error: '' }));
    try {
      const response = await fetch(RELEASE_API, { headers: { Accept: 'application/vnd.github+json' } });
      if (!response.ok) throw new Error(`GitHub ${response.status}`);
      const data = await response.json();
      const asset = data.assets?.find(item => /ATTOZAP-WASender-Pro.*\.exe$/i.test(item.name));
      setRelease({
        loading: false,
        version: data.tag_name || '',
        url: asset?.browser_download_url || STABLE_DOWNLOAD,
        size: formatBytes(asset?.size || 0),
        error: asset ? '' : 'Release encontrada sem executável público.'
      });
    } catch {
      setRelease({ loading: false, version: '', url: STABLE_DOWNLOAD, size: '', error: 'Não foi possível consultar a API do GitHub. O link direto continua disponível.' });
    }
  };

  useEffect(() => { void loadRelease(); }, []);

  const year = useMemo(() => new Date().getFullYear(), []);
  const activeShowcase = showcase.find(item => item.id === showcaseId) || showcase[0];
  const go = selector => {
    setMenuOpen(false);
    document.querySelector(selector)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const DownloadButton = ({ compact = false, full = false }) => (
    <a className={`button primary ${compact ? 'compact' : ''} ${full ? 'full' : ''}`} href={release.url || STABLE_DOWNLOAD} target="_blank" rel="noreferrer">
      <Download size={compact ? 16 : 18}/><span>{compact ? 'Download .exe' : (release.version ? `Baixar ${release.version}` : 'Baixar para Windows')}</span>
    </a>
  );

  return <div className="site-shell">
    <header className="topbar"><div className="container nav-inner">
      <button className="brand" onClick={() => go('#inicio')} aria-label="Ir para o início">
        <span className="brand-orb"><img src="/logo.svg" alt="ATTOZAP"/></span>
        <span className="brand-copy"><b>ATTOZAP</b><small>WASENDER PRO</small></span>
      </button>
      <nav className={menuOpen ? 'nav-links open' : 'nav-links'}>
        <button onClick={() => go('#produto')}>Produto</button>
        <button onClick={() => go('#recursos')}>Recursos</button>
        <button onClick={() => go('#como-funciona')}>Como funciona</button>
        <button onClick={() => go('#faq')}>FAQ</button>
        <button onClick={() => go('#contato')}>Contato</button>
      </nav>
      <div className="nav-actions">
        <button className="icon-button" onClick={() => setDark(value => !value)} aria-label="Alternar tema">{dark ? <Sun size={17}/> : <Moon size={17}/>}</button>
        <div className="desktop-download"><DownloadButton compact/></div>
        <button className="mobile-menu" onClick={() => setMenuOpen(value => !value)} aria-label="Abrir menu">{menuOpen ? <X size={20}/> : <Menu size={20}/>}</button>
      </div>
    </div></header>

    <main>
      <section className="hero" id="inicio">
        <div className="star-field"/>
        <div className="ambient ambient-one"/><div className="ambient ambient-two"/><div className="ambient ambient-three"/>
        <div className="container hero-layout">
          <div className="hero-copy">
            <div className="hero-kicker"><Sparkles size={14}/> Automação desktop para WhatsApp</div>
            <h1>Mais controle.<br/>Mais produtividade.<br/><span>ATTOZAP no seu fluxo.</span></h1>
            <p>Uma central desktop para conversar, enviar, organizar múltiplas contas e trabalhar com ferramentas de WhatsApp sem transformar sua operação em um CRM pesado.</p>
            <div className="hero-actions"><DownloadButton/><a className="button ghost" href={WHATSAPP_URL} target="_blank" rel="noreferrer"><MessageCircle size={18}/> Falar sobre licenças</a></div>
            <div className="release-status">
              <span className="live-pulse"/>
              <div><b>{release.loading ? 'Consultando GitHub Releases…' : (release.version || 'Download público')}</b><small>{release.size ? `${release.size} · Windows 10/11 x64` : (release.error || 'Executável hospedado no GitHub')}</small></div>
              <button onClick={() => void loadRelease()} title="Atualizar status"><RefreshCw size={14}/></button>
            </div>
            <div className="hero-trust"><span><ShieldCheck size={15}/> Licenciamento local</span><span><Database size={15}/> SQLite local</span><span><Fingerprint size={15}/> JID/LID ready</span></div>
          </div>

          <div className="hero-visual" aria-label="Prévia visual do ATTOZAP">
            <div className="orbit orbit-a"/><div className="orbit orbit-b"/><div className="orbit orbit-c"/>
            <span className="planet planet-a"/><span className="planet planet-b"/><span className="planet planet-c"/>
            <div className="app-window">
              <div className="window-top"><div className="window-dots"><i/><i/><i/></div><span>ATTOZAP 2.0 Pro</span><div className="window-state"><span/> WhatsApp ativo</div></div>
              <div className="app-body">
                <aside className="mock-sidebar">
                  <div className="mock-brand"><img src="/logo.svg"/><b>ATTOZAP</b></div>
                  <div className="mock-account"><Wifi size={13}/><span><b>2 contas online</b><small>2 configuradas</small></span></div>
                  {['Visão geral','Contact Sender','WebChat','Contatos','Grupos','Auto Reply','Aquecimento'].map((item,index) => <div key={item} className={`mock-nav ${index === 0 ? 'active' : ''}`}><i/><span>{item}</span></div>)}
                </aside>
                <div className="mock-content">
                  <div className="mock-header"><div><small>ATTOZAP / WASENDER</small><b>Visão geral</b></div><span className="mock-mode">BÁSICO</span></div>
                  <div className="mock-hero-card"><div><small>WASENDER DESKTOP</small><h3>Envie, converse e organize sem complicação.</h3><p>Sender, WebChat, grupos, filtros e automações.</p><button>Novo envio</button></div><img src="/logo.svg"/></div>
                  <div className="mock-metrics"><article><span>Contas online</span><b>2/2</b></article><article><span>Campanhas</span><b>12</b></article><article><span>Health</span><b>OK</b></article></div>
                  <div className="mock-lower"><div className="mock-chart"><div className="chart-line"><i/><i/><i/><i/><i/><i/></div></div><div className="mock-list"><span/><span/><span/></div></div>
                </div>
              </div>
            </div>
            <div className="floating-chip chip-health"><ShieldCheck size={18}/><span><b>Health Center</b><small>Sistema operacional</small></span></div>
            <div className="floating-chip chip-chat"><MessageCircle size={18}/><span><b>WebChat</b><small>Tempo real</small></span></div>
            <div className="floating-chip chip-id"><Fingerprint size={18}/><span><b>JID / LID</b><small>Identidade moderna</small></span></div>
          </div>
        </div>
      </section>

      <section className="signal-strip"><div className="container signal-grid">
        <div><span className="signal-icon"><Layers3/></span><div><b>Multi-conta</b><small>Várias sessões em uma interface</small></div></div>
        <div><span className="signal-icon"><MessageCircle/></span><div><b>WebChat</b><small>Texto, mídia e histórico</small></div></div>
        <div><span className="signal-icon"><Fingerprint/></span><div><b>JID / LID</b><small>Compatibilidade de identidade</small></div></div>
        <div><span className="signal-icon"><Database/></span><div><b>Local-first</b><small>Banco e configurações locais</small></div></div>
      </div></section>

      <section className="section philosophy" id="produto"><div className="container">
        <div className="section-heading centered"><div className="eyebrow"><Orbit size={14}/> Core philosophy</div><h2>Feito para parecer simples.<br/><span>Projetado para ser poderoso.</span></h2><p>A interface esconde a complexidade técnica quando ela não é necessária e abre as ferramentas avançadas quando você precisa delas.</p></div>
        <div className="philosophy-grid">
          <article className="philo-main"><div className="orbital-diagram"><div className="core-orb"><img src="/logo.svg"/></div><i className="ring r1"/><i className="ring r2"/><i className="ring r3"/><span className="sat s1">WebChat</span><span className="sat s2">Sender</span><span className="sat s3">JID/LID</span><span className="sat s4">Groups</span></div><div><span>01 / LOCAL FIRST</span><h3>Seu workspace continua sendo seu.</h3><p>SQLite, sessões, preferências, templates e diagnósticos permanecem no ambiente local do aplicativo.</p></div></article>
          <article className="philo-card"><div className="icon-orbit"><Workflow/></div><span>02 / FLUXO</span><h3>Menos janelas, menos fricção.</h3><p>Contas, conversas, listas, grupos e ferramentas vivem no mesmo produto.</p></article>
          <article className="philo-card"><div className="icon-orbit"><ShieldCheck/></div><span>03 / CONTROLE</span><h3>Diagnóstico antes do problema.</h3><p>Health Center, backups, logs e status de sessão ajudam a tornar falhas mais compreensíveis.</p></article>
        </div>
      </div></section>

      <section className="section resources" id="recursos"><div className="container">
        <div className="section-heading"><div className="eyebrow"><Zap size={14}/> Ecossistema ATTOZAP</div><h2>Ferramentas que trabalham juntas.</h2><p>Um conjunto focado no que o WASender precisa fazer bem, sem reinventar o produto como um CRM completo.</p></div>
        <div className="bento-grid">{featureCards.map(({ icon: Icon, title, text, tag }, index) => <article className={`bento-card bento-${index + 1}`} key={title}>
          <div className="bento-top"><span className="bento-icon"><Icon/></span><span className="bento-tag">{tag}</span></div><h3>{title}</h3><p>{text}</p><div className="card-edge"><ArrowRight size={16}/></div>
        </article>)}</div>
      </div></section>

      <section className="section showcase-section"><div className="container">
        <div className="section-heading centered"><div className="eyebrow"><Boxes size={14}/> Veja por dentro</div><h2>Uma interface criada para <span>trabalho real.</span></h2><p>Escolha uma área para entender como os módulos se encaixam na experiência desktop.</p></div>
        <div className="showcase-tabs">{showcase.map(item => { const Icon = item.icon; return <button key={item.id} className={showcaseId === item.id ? 'active' : ''} onClick={() => setShowcaseId(item.id)}><Icon size={16}/>{item.label}</button>; })}</div>
        <div className={`showcase-panel ${activeShowcase.accent}`}>
          <div className="showcase-copy"><div className="showcase-number">0{showcase.findIndex(item => item.id === activeShowcase.id) + 1}</div><h3>{activeShowcase.title}</h3><p>{activeShowcase.text}</p><div className="showcase-points"><span><Check/> Navegação consistente</span><span><Check/> Tema claro e escuro</span><span><Check/> Tipografia legível</span></div></div>
          <div className="showcase-screen"><div className="mini-app-head"><span/><span/><span/><b>{activeShowcase.label}</b></div><div className="mini-app-body"><aside>{[1,2,3,4,5,6].map(i => <i key={i} className={i===2?'active':''}/>)}</aside><main><div className="screen-title"><span/><span/></div><div className="screen-cards"><i/><i/><i/></div><div className="screen-large"><div className="screen-wave"/><div className="screen-lines"><i/><i/><i/><i/></div></div></main></div></div>
        </div>
      </div></section>

      <section className="section workflow-section" id="como-funciona"><div className="container">
        <div className="section-heading centered"><div className="eyebrow"><CircleDot size={14}/> Começar é simples</div><h2>Do download ao primeiro uso.</h2></div>
        <div className="workflow-line">
          {[['01',Download,'Baixe','Executável público para Windows pelo GitHub Releases.'],['02',ShieldCheck,'Ative','Insira sua licença e libere os recursos contratados.'],['03',Wifi,'Conecte','Adicione suas sessões e aguarde o status online.'],['04',Send,'Trabalhe','Abra WebChat, Sender, grupos ou ferramentas.']].map(([n,Icon,title,text],index) => <article key={n}><div className="step-node"><span>{n}</span><Icon/></div><h3>{title}</h3><p>{text}</p>{index < 3 && <div className="step-connector"><i/></div>}</article>)}
        </div>
      </div></section>

      <section className="section release-section" id="download"><div className="container release-panel">
        <div className="release-glow"/><div className="release-logo"><img src="/logo.svg"/><span className="download-ring"/></div>
        <div className="release-copy"><div className="eyebrow"><Github size={14}/> GitHub Releases</div><h2>Pronto para instalar no Windows.</h2><p>O executável é entregue pelo repositório público ATTOZAP-DOWNLOAD. A landing consulta a release atual e usa o asset oficial de download.</p><div className="release-meta"><span><Check/> Windows 10/11 x64</span><span><Check/> Portable</span><span><Check/> Download público</span></div></div>
        <div className="release-actions"><div className="release-version"><small>VERSÃO DISPONÍVEL</small><b>{release.loading ? 'Consultando…' : (release.version || 'Latest')}</b><span>{release.size || 'GitHub Releases'}</span></div><DownloadButton full/><a className="text-link" href={RELEASE_PAGE} target="_blank" rel="noreferrer"><ExternalLink size={14}/> Abrir página da release</a></div>
      </div></section>

      <section className="section faq-section" id="faq"><div className="container faq-layout">
        <div className="faq-intro"><div className="eyebrow"><FileText size={14}/> Frequently asked questions</div><h2>Dúvidas antes de começar?</h2><p>As respostas mais importantes sobre instalação, arquitetura local, múltiplas contas e licenciamento.</p><a className="text-link strong" href={`mailto:${SALES_EMAIL}`}><Mail size={15}/> Ainda tenho uma dúvida</a></div>
        <div className="faq-grid">{faqs.map(([question, answer], index) => <article className={`faq-item ${faqOpen === index ? 'open' : ''}`} key={question}><button onClick={() => setFaqOpen(faqOpen === index ? -1 : index)}><span>{question}</span><ChevronDown size={17}/></button><div className="faq-answer"><p>{answer}</p></div></article>)}</div>
      </div></section>

      <section className="section contact-section" id="contato"><div className="container contact-panel">
        <div className="contact-visual"><div className="contact-core"><img src="/logo.svg"/></div><i/><i/><i/></div>
        <div className="contact-copy"><div className="eyebrow"><Sparkles size={14}/> Comercial</div><h2>Quer colocar o ATTOZAP na sua operação?</h2><p>Converse sobre licenças, limites, implantação e qual configuração faz mais sentido para o seu uso.</p></div>
        <div className="contact-actions"><a className="button whatsapp" href={WHATSAPP_URL} target="_blank" rel="noreferrer"><MessageCircle size={18}/> Falar pelo WhatsApp</a><a className="button ghost" href={`mailto:${SALES_EMAIL}?subject=${encodeURIComponent('ATTOZAP WASender Pro - Comercial')}`}><Mail size={18}/> {SALES_EMAIL}</a></div>
      </div></section>
    </main>

    <footer className="footer"><div className="container footer-grid">
      <div className="footer-brand"><div className="brand"><span className="brand-orb"><img src="/logo.svg" alt=""/></span><span className="brand-copy"><b>ATTOZAP</b><small>WASENDER PRO</small></span></div><p>Aplicativo desktop para produtividade e ferramentas de WhatsApp.</p></div>
      <div><b>Navegação</b><button onClick={() => go('#produto')}>Produto</button><button onClick={() => go('#recursos')}>Recursos</button><button onClick={() => go('#faq')}>FAQ</button></div>
      <div><b>Produto</b><span>WebChat</span><span>Multi-conta</span><span>JID / LID</span><span>Health Center</span></div>
      <div><b>Contato</b><a href={WHATSAPP_URL} target="_blank" rel="noreferrer"><MessageCircle size={14}/> WhatsApp</a><a href={`mailto:${SALES_EMAIL}`}><Mail size={14}/> {SALES_EMAIL}</a><a href={RELEASE_PAGE} target="_blank" rel="noreferrer"><Github size={14}/> GitHub Releases</a></div>
    </div><div className="container footer-bottom"><span>© {year} ATTOZAP WASENDER PRO</span><span>ATTO FLOW BY GLEYSONDEVS</span></div></footer>
  </div>;
}

createRoot(document.getElementById('root')).render(<App/>);

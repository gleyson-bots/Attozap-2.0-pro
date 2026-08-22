import { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  ArrowRight, Bot, Boxes, Check, ChevronDown, CircleDot, ContactRound, Database,
  Download, ExternalLink, FileText, Fingerprint, Flame, Gauge, Github, Globe2,
  Layers3, Mail, Menu, MessageCircle, Moon, Orbit, RefreshCw, Search, Send,
  ShieldCheck, Sparkles, Sun, Users, Wifi, Workflow, X, Zap
} from 'lucide-react';
import './styles.css';
import './pricing.css';

const RELEASE_API = 'https://api.github.com/repos/gleyson-bots/ATTOZAP-DOWNLOAD/releases/latest';
const RELEASE_PAGE = 'https://github.com/gleyson-bots/ATTOZAP-DOWNLOAD/releases/latest';
const STABLE_DOWNLOAD = 'https://github.com/gleyson-bots/ATTOZAP-DOWNLOAD/releases/latest/download/ATTOZAP-WASender-Pro-x64.exe';
const SALES_WHATSAPP = String(import.meta.env.VITE_SALES_WHATSAPP || '').replace(/\D/g, '');
const SALES_EMAIL = import.meta.env.VITE_SALES_EMAIL || 'vendas@attozap.com.br';

function salesWhatsApp(message) {
  return SALES_WHATSAPP
    ? `https://wa.me/${SALES_WHATSAPP}?text=${encodeURIComponent(message)}`
    : '#contato';
}

const WHATSAPP_URL = salesWhatsApp('Olá! Quero conhecer o ATTOZAP WASender Pro.');

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

const pricingPlans = [
  {
    id: 'plus',
    name: 'Plus',
    scale: 'Pequena escala',
    price: '24,00',
    description: 'Para profissionais autônomos e operações enxutas que querem centralizar o essencial.',
    limit: 'Até 2 contas WhatsApp',
    icon: MessageCircle,
    features: ['WebChat e contatos', 'Contact Sender', 'Grupos e templates', 'Auto Reply', 'Health Center e backup local'],
  },
  {
    id: 'pro',
    name: 'Pro',
    scale: 'Média escala',
    price: '35,00',
    description: 'Para quem já trabalha com mais canais e precisa das ferramentas avançadas no dia a dia.',
    limit: 'Até 5 contas WhatsApp',
    icon: Layers3,
    featured: true,
    features: ['Tudo do Plus', 'Agendamentos e filtros', 'Google Maps & extratores', 'Centro JID / LID', 'Modo avançado e ferramentas em lote'],
  },
  {
    id: 'ultra',
    name: 'Ultra',
    scale: 'Alta escala',
    price: '98,00',
    description: 'Para operações maiores que querem a experiência ATTOZAP completa em um único desktop.',
    limit: 'Até 15 contas WhatsApp',
    icon: Zap,
    features: ['Tudo do Pro', 'Aquecimento controlado', 'Biblioteca de mídias', 'Diagnóstico e backup completo', 'Recursos locais completos do WASender'],
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    scale: 'Escala personalizada',
    price: null,
    description: 'Para empresas que precisam de limites, quantidade de canais e licenciamento definidos sob medida.',
    limit: 'Contas e limites sob consulta',
    icon: Globe2,
    features: ['Limites personalizados', 'Configuração comercial sob medida', 'Recursos definidos por licença', 'Planejamento para múltiplos operadores', 'Condições comerciais personalizadas'],
  },
];

const legalDocs = [
  {
    id: 'terms',
    title: 'Termos de Uso',
    icon: FileText,
    summary: 'Regras gerais para instalação, ativação e utilização do ATTOZAP WASender Pro.',
    sections: [
      ['1. Objeto', 'Estes Termos regulam o acesso e o uso do ATTOZAP WASender Pro, aplicativo desktop disponibilizado mediante licença. Ao ativar ou utilizar o software, o usuário declara ciência das condições aplicáveis ao plano contratado.'],
      ['2. Licença e ativação', 'A licença é vinculada às condições comerciais emitidas para o cliente e pode conter validade, limite de contas, recursos habilitados e identificação do dispositivo. A chave de licença não deve ser compartilhada, revendida ou utilizada fora das condições contratadas.'],
      ['3. Serviços de terceiros', 'O ATTOZAP integra ou depende de serviços externos em determinadas funções. Disponibilidade, regras, limites e mudanças nesses serviços são de responsabilidade dos respectivos fornecedores e podem afetar funcionalidades do aplicativo.'],
      ['4. Responsabilidade de uso', 'O usuário é responsável pelas contas, contatos, grupos, mensagens, arquivos e credenciais utilizados no aplicativo, bem como por obter autorizações e bases legais necessárias para suas atividades.'],
      ['5. Alterações', 'O produto pode receber atualizações de segurança, compatibilidade, interface e funcionalidades. Recursos podem ser ajustados quando necessário para manter compatibilidade técnica ou conformidade com plataformas utilizadas.'],
    ],
  },
  {
    id: 'commercial',
    title: 'Condições Comerciais',
    icon: Gauge,
    summary: 'Preços, planos, limites e regras comerciais apresentadas nesta página.',
    sections: [
      ['1. Planos', 'Plus, Pro e Ultra são apresentados como licenças mensais com limites de contas indicados na seção de preços. O plano Enterprise possui configuração e preço definidos por proposta comercial.'],
      ['2. Preços', 'Os valores publicados na landing correspondem ao preço-base mensal informado para cada plano. Condições promocionais, migrações, upgrades ou propostas específicas podem alterar o valor final mediante aceite do cliente.'],
      ['3. Limites', 'O limite comercial principal exibido nesta página refere-se à quantidade máxima de contas WhatsApp liberadas pela licença. Outros recursos podem variar de acordo com a versão e as features habilitadas na chave.'],
      ['4. Upgrade e downgrade', 'Mudanças de plano podem exigir a emissão de uma nova licença. Diferenças de preço, vigência e recursos são apresentadas ao cliente antes da alteração.'],
      ['5. Cancelamento', 'O cancelamento interrompe renovações futuras conforme a modalidade contratada. Valores já vencidos, serviços já prestados e demais direitos obrigatórios permanecem sujeitos ao contrato e à legislação aplicável.'],
    ],
  },
  {
    id: 'privacy',
    title: 'Privacidade e LGPD',
    icon: ShieldCheck,
    summary: 'Como a landing e o aplicativo tratam preferências, dados locais e integrações externas.',
    sections: [
      ['1. Landing page', 'A landing armazena localmente a preferência de tema e consulta a API pública do GitHub para descobrir a versão mais recente do instalador. Os botões comerciais apenas redirecionam para WhatsApp ou e-mail.'],
      ['2. Aplicativo local-first', 'O ATTOZAP foi projetado para manter banco SQLite, sessões, configurações, histórico operacional e arquivos de suporte no computador do usuário, salvo quando uma função exige comunicação com um serviço externo.'],
      ['3. Integrações externas', 'Quando o usuário utiliza WhatsApp, Google, provedores de IA, páginas externas ou outros serviços integrados, os dados necessários àquela função podem ser processados pelo respectivo fornecedor conforme suas próprias políticas.'],
      ['4. Direitos do titular', 'Quando aplicável ao tratamento realizado pelo fornecedor do ATTOZAP, o titular pode solicitar informações, confirmação de tratamento, acesso, correção, oposição, revogação de consentimento e eliminação nas hipóteses previstas em lei. Solicitações podem ser encaminhadas ao e-mail comercial informado nesta página.'],
      ['5. Segurança', 'Credenciais e chaves sensíveis devem permanecer protegidas. O aplicativo utiliza mecanismos locais de proteção para determinados segredos, mas a segurança do dispositivo, das contas conectadas e dos backups também depende das práticas adotadas pelo usuário.'],
    ],
  },
  {
    id: 'license',
    title: 'Licença do Software',
    icon: Fingerprint,
    summary: 'Condições de uso da licença, fingerprint, atualizações e proteção do produto.',
    sections: [
      ['1. Concessão', 'Durante a vigência da licença, o cliente recebe direito limitado, não exclusivo e não transferível de utilizar o ATTOZAP conforme o plano e os limites contratados.'],
      ['2. Chave e fingerprint', 'A ativação pode utilizar uma chave assinada e uma identificação do dispositivo. Trocas de máquina ou mudanças relevantes podem exigir reemissão da licença.'],
      ['3. Restrições', 'Não é permitido distribuir cópias não autorizadas, remover mecanismos de licenciamento, comercializar chaves sem autorização ou utilizar o software para violar direitos de terceiros.'],
      ['4. Atualizações', 'Atualizações podem corrigir falhas, acompanhar mudanças de compatibilidade e alterar componentes do aplicativo. Versões antigas podem deixar de ser recomendadas quando houver correções críticas.'],
    ],
  },
  {
    id: 'acceptable',
    title: 'Uso Aceitável',
    icon: Users,
    summary: 'Princípios de uso responsável para contas, automações, contatos e ferramentas do produto.',
    sections: [
      ['1. Contas e permissões', 'Utilize contas próprias ou contas para as quais você possua autorização administrativa. O mesmo princípio se aplica a grupos, contatos, dados importados e credenciais.'],
      ['2. Mensagens e automações', 'O usuário deve respeitar consentimento, legislação aplicável e regras das plataformas utilizadas. O ATTOZAP não concede autorização para spam, assédio, fraude ou envio de conteúdo ilícito.'],
      ['3. Extratores', 'Ferramentas de extração devem ser usadas apenas quando a coleta e o uso das informações forem permitidos. O usuário é responsável por observar termos de serviço, direitos de terceiros e regras de proteção de dados.'],
      ['4. Segurança e integridade', 'É proibido utilizar o produto para acesso não autorizado, evasão de controles de segurança, comprometimento de contas de terceiros ou qualquer atividade destinada a causar dano a pessoas, sistemas ou serviços.'],
    ],
  },
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
  const [legalOpen, setLegalOpen] = useState(null);
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

  useEffect(() => {
    document.body.style.overflow = legalOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [legalOpen]);

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
  const activeLegal = legalDocs.find(item => item.id === legalOpen);
  const go = selector => {
    setMenuOpen(false);
    document.querySelector(selector)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const planUrl = plan => salesWhatsApp(`Olá! Tenho interesse no plano ${plan.name} do ATTOZAP WASender Pro (${plan.scale}${plan.price ? ` · R$ ${plan.price}/mês` : ' · sob consulta'}). Quero saber como contratar.`);

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
        <button onClick={() => go('#precos')}>Preços</button>
        <button onClick={() => go('#como-funciona')}>Como funciona</button>
        <button onClick={() => go('#faq')}>FAQ</button>
        <button onClick={() => go('#legal')}>Termos</button>
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

      <section className="section pricing-section" id="precos"><div className="container">
        <div className="section-heading centered"><div className="eyebrow"><Layers3 size={14}/> Planos e escala</div><h2>Escolha o plano do <span>tamanho da sua operação.</span></h2><p>Comece pequeno e aumente a capacidade quando precisar. Todos os planos são apresentados como licenças mensais; Enterprise é personalizado.</p></div>
        <div className="scale-rail"><span>PEQUENA ESCALA</span><i/><span>MÉDIA ESCALA</span><i/><span>ALTA ESCALA</span><i/><span>ENTERPRISE</span></div>
        <div className="pricing-grid">{pricingPlans.map(plan => { const Icon = plan.icon; return <article key={plan.id} className={`price-card ${plan.featured ? 'featured' : ''}`}>
          {plan.featured && <div className="popular-badge"><Sparkles size={12}/> Mais escolhido</div>}
          <div className="price-head"><span className="price-icon"><Icon/></span><div><small>{plan.scale}</small><h3>{plan.name}</h3></div></div>
          <p className="price-description">{plan.description}</p>
          <div className="price-value">{plan.price ? <><span>R$</span><strong>{plan.price}</strong><small>/mês</small></> : <><strong className="consult-price">Sob consulta</strong></>}</div>
          <div className="plan-limit"><Gauge size={15}/><div><small>LIMITE DO PLANO</small><b>{plan.limit}</b></div></div>
          <div className="plan-features">{plan.features.map(feature => <span key={feature}><Check size={15}/>{feature}</span>)}</div>
          <a className={`button ${plan.featured ? 'primary' : 'ghost'} full plan-cta`} href={planUrl(plan)} target={SALES_WHATSAPP ? '_blank' : undefined} rel="noreferrer"><MessageCircle size={17}/>{plan.price ? `Quero o ${plan.name}` : 'Falar sobre Enterprise'}</a>
        </article>; })}</div>
        <div className="pricing-note"><ShieldCheck size={16}/><span>Os limites exibidos são comerciais e podem ser ajustados em novas versões ou propostas específicas. O uso das ferramentas continua sujeito às regras e limites das plataformas conectadas.</span></div>
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

      <section className="section legal-section" id="legal"><div className="container">
        <div className="section-heading"><div className="eyebrow"><ShieldCheck size={14}/> Transparência e condições</div><h2>Termos claros antes de <span>comprar ou usar.</span></h2><p>Consulte as condições gerais do produto, regras de licenciamento, privacidade e princípios de uso responsável. Propostas comerciais específicas podem complementar estes documentos.</p></div>
        <div className="legal-grid">{legalDocs.map(doc => { const Icon = doc.icon; return <button className="legal-card" key={doc.id} onClick={() => setLegalOpen(doc.id)}>
          <span className="legal-icon"><Icon/></span><div><small>DOCUMENTO</small><h3>{doc.title}</h3><p>{doc.summary}</p></div><ArrowRight size={18}/>
        </button>; })}</div>
        <div className="legal-meta"><span>Última atualização: 18/08/2026</span><span>Contato: {SALES_EMAIL}</span></div>
      </div></section>

      <section className="section contact-section" id="contato"><div className="container contact-panel">
        <div className="contact-visual"><div className="contact-core"><img src="/logo.svg"/></div><i/><i/><i/></div>
        <div className="contact-copy"><div className="eyebrow"><Sparkles size={14}/> Comercial</div><h2>Quer colocar o ATTOZAP na sua operação?</h2><p>Converse sobre licenças, limites, implantação e qual configuração faz mais sentido para o seu uso.</p></div>
        <div className="contact-actions"><a className="button whatsapp" href={WHATSAPP_URL} target="_blank" rel="noreferrer"><MessageCircle size={18}/> Falar pelo WhatsApp</a><a className="button ghost" href={`mailto:${SALES_EMAIL}?subject=${encodeURIComponent('ATTOZAP WASender Pro - Comercial')}`}><Mail size={18}/> {SALES_EMAIL}</a></div>
      </div></section>
    </main>

    {activeLegal && <div className="legal-overlay" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setLegalOpen(null); }}>
      <section className="legal-modal" role="dialog" aria-modal="true" aria-labelledby="legal-title">
        <div className="legal-modal-head"><div><span>ATTOZAP · DOCUMENTO LEGAL</span><h2 id="legal-title">{activeLegal.title}</h2></div><button className="icon-button" onClick={() => setLegalOpen(null)} aria-label="Fechar"><X size={19}/></button></div>
        <div className="legal-modal-body"><p className="legal-lead">{activeLegal.summary}</p>{activeLegal.sections.map(([title, text]) => <article key={title}><h3>{title}</h3><p>{text}</p></article>)}</div>
        <div className="legal-modal-foot"><span>Última atualização: 18/08/2026</span><a href={`mailto:${SALES_EMAIL}?subject=${encodeURIComponent(`ATTOZAP - ${activeLegal.title}`)}`}><Mail size={14}/> Dúvidas sobre este documento</a></div>
      </section>
    </div>}

    <footer className="footer"><div className="container footer-grid">
      <div className="footer-brand"><div className="brand"><span className="brand-orb"><img src="/logo.svg" alt=""/></span><span className="brand-copy"><b>ATTOZAP</b><small>WASENDER PRO</small></span></div><p>Aplicativo desktop para produtividade e ferramentas de WhatsApp.</p></div>
      <div><b>Navegação</b><button onClick={() => go('#produto')}>Produto</button><button onClick={() => go('#recursos')}>Recursos</button><button onClick={() => go('#precos')}>Preços</button><button onClick={() => go('#faq')}>FAQ</button></div>
      <div><b>Planos</b><button onClick={() => go('#precos')}>Plus · R$ 24</button><button onClick={() => go('#precos')}>Pro · R$ 35</button><button onClick={() => go('#precos')}>Ultra · R$ 98</button><button onClick={() => go('#precos')}>Enterprise</button></div>
      <div><b>Legal</b><button onClick={() => setLegalOpen('terms')}>Termos de Uso</button><button onClick={() => setLegalOpen('privacy')}>Privacidade e LGPD</button><button onClick={() => setLegalOpen('commercial')}>Condições Comerciais</button><button onClick={() => setLegalOpen('license')}>Licença</button></div>
      <div><b>Contato</b><a href={WHATSAPP_URL} target="_blank" rel="noreferrer"><MessageCircle size={14}/> WhatsApp</a><a href={`mailto:${SALES_EMAIL}`}><Mail size={14}/> {SALES_EMAIL}</a><a href={RELEASE_PAGE} target="_blank" rel="noreferrer"><Github size={14}/> GitHub Releases</a></div>
    </div><div className="container footer-bottom"><span>© {year} ATTOZAP WASENDER PRO</span><span>ATTO FLOW BY GLEYSONDEVS</span></div></footer>
  </div>;
}

createRoot(document.getElementById('root')).render(<App/>);

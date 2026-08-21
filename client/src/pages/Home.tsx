import { useAuth } from "@/_core/hooks/useAuth";
import {
  ArrowRight,
  Bot,
  Check,
  ChevronDown,
  Download,
  Flame,
  Layers3,
  Menu,
  MessageCircle,
  ShieldCheck,
  Sparkles,
  Users,
  Workflow,
  X,
  Zap,
} from "lucide-react";
import { useState } from "react";
import { useLocation } from "wouter";

const ATTOZAP_LOGO_URL = "/manus-storage/attozap-logo_c75a0cb2.svg";

const BrandMark = ({ alt = "" }: { alt?: string }) => (
  <img src={ATTOZAP_LOGO_URL} alt={alt} />
);

const featureCards = [
  { icon: MessageCircle, title: "WebChat fluido", text: "Conversas, ficheiros, localização, contactos e enquêtes num espaço pensado para operar sem fricção.", tag: "Conversas" },
  { icon: Layers3, title: "Multi-conta", text: "Mantenha sessões independentes, escolha o canal certo e preserve o contexto em cada operação.", tag: "WhatsApp" },
  { icon: Workflow, title: "Automações visuais", text: "Construa fluxos locais com gatilhos, condições, espera, IA e ações de envio no próprio desktop.", tag: "Local-first" },
  { icon: Bot, title: "Agentes com IA", text: "Configure resposta, reativação ou qualificação por conta, modelo e provedor de IA.", tag: "Inteligência" },
  { icon: Flame, title: "Aquecimento controlado", text: "Acompanhe rotinas entre contas próprias e grupos permitidos com limites e diagnósticos claros.", tag: "Operação" },
  { icon: ShieldCheck, title: "Licença e saúde", text: "Licenciamento, atualizações, backup e estado operacional com visibilidade para cliente e administração.", tag: "Confiança" },
];

const plans = [
  {
    name: "Plus",
    scale: "Pequena escala",
    price: "24",
    limit: "Até 2 contas WhatsApp",
    features: ["WebChat e contactos", "Sender e templates", "Auto Reply", "Health Center e backup local"],
  },
  {
    name: "Pro",
    scale: "Média escala",
    price: "35",
    limit: "Até 5 contas WhatsApp",
    featured: true,
    features: ["Tudo do Plus", "Agendamentos e filtros", "Extratores", "Centro JID / LID"],
  },
  {
    name: "Ultra",
    scale: "Alta escala",
    price: "98",
    limit: "Até 15 contas WhatsApp",
    features: ["Tudo do Pro", "Aquecimento controlado", "Biblioteca de mídias", "Diagnóstico avançado"],
  },
  {
    name: "Enterprise",
    scale: "Escala personalizada",
    price: null,
    limit: "Contas e limites sob consulta",
    features: ["Limites personalizados", "Configuração comercial", "Recursos por licença", "Condições comerciais próprias"],
  },
];

const faqs = [
  ["O ATTOZAP exige servidor próprio?", "Não para as funções locais do aplicativo. Sessões, configurações e banco de dados permanecem no computador do utilizador. Integrações externas, como WhatsApp e provedores de IA, dependem naturalmente desses serviços."],
  ["Como funcionam as licenças?", "O portal centraliza estado, validade, renovações e versões disponíveis. A ativação e o uso operacional continuam no aplicativo desktop, conforme o plano contratado."],
  ["Posso usar mais de uma conta?", "Sim. Cada plano define um limite comercial de contas WhatsApp. O aplicativo e o portal ajudam a separar configurações, automações e agentes por conta."],
  ["Quais provedores de IA estão disponíveis?", "O configurador contempla OpenAI, Anthropic, Groq, OpenRouter, NVIDIA NIM, xAI, Pollinations AI e Hugging Face. As credenciais ficam cifradas no servidor e nunca são devolvidas ao navegador."],
];

function scrollToId(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

export default function Home() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [openFaq, setOpenFaq] = useState(0);
  const { user } = useAuth();
  const [, setLocation] = useLocation();

  const openPortal = () => setLocation(user ? "/painel" : "/entrar");

  return (
    <div className="atto-site-shell">
      <header className="atto-topbar">
        <div className="atto-container atto-nav-inner">
          <button className="atto-brand" onClick={() => scrollToId("inicio")} aria-label="Ir para o início">
            <span className="atto-brand-orb"><BrandMark alt="" /></span>
            <span className="atto-brand-copy"><strong>ATTOZAP</strong><small>WASENDER PRO</small></span>
          </button>
          <nav className="atto-nav-links" aria-label="Navegação principal">
            <button onClick={() => scrollToId("produto")}>Produto</button>
            <button onClick={() => scrollToId("recursos")}>Recursos</button>
            <button onClick={() => scrollToId("planos")}>Planos</button>
            <button onClick={() => scrollToId("faq")}>FAQ</button>
          </nav>
          <div className="atto-nav-actions">
            <button className="atto-button atto-button-ghost atto-nav-login" onClick={openPortal}>{user ? "Aceder ao portal" : "Entrar"}</button>
            <button className="atto-button atto-button-primary atto-nav-cta" onClick={() => scrollToId("planos")}>Ver planos <ArrowRight size={15} /></button>
            <button className="atto-menu-button" onClick={() => setMenuOpen(!menuOpen)} aria-expanded={menuOpen} aria-label="Abrir menu">
              {menuOpen ? <X size={18} /> : <Menu size={18} />}
            </button>
          </div>
        </div>
        {menuOpen && (
          <div className="atto-mobile-menu atto-container">
            {[['Produto', 'produto'], ['Recursos', 'recursos'], ['Planos', 'planos'], ['FAQ', 'faq']].map(([label, id]) => (
              <button key={id} onClick={() => { setMenuOpen(false); scrollToId(id); }}>{label}</button>
            ))}
            <button className="atto-button atto-button-primary" onClick={openPortal}>Entrar no portal <ArrowRight size={15} /></button>
          </div>
        )}
      </header>

      <main>
        <section id="inicio" className="atto-hero">
          <div className="atto-star-field" aria-hidden="true" />
          <div className="atto-ambient atto-ambient-one" aria-hidden="true" />
          <div className="atto-ambient atto-ambient-two" aria-hidden="true" />
          <div className="atto-container atto-hero-layout">
            <div className="atto-hero-copy">
              <span className="atto-kicker"><Sparkles size={13} /> Plataforma desktop, controlo no seu ritmo</span>
              <h1>WhatsApp operacional, <span>sem transformar o seu fluxo num labirinto.</span></h1>
              <p>O ATTOZAP WASender Pro reúne conversas, contas, automações visuais, campanhas e diagnósticos num aplicativo desktop local-first. O portal organiza as suas licenças, versões e configurações inteligentes.</p>
              <div className="atto-hero-actions">
                <button className="atto-button atto-button-primary atto-button-lg" onClick={openPortal}>Criar ou aceder à conta <ArrowRight size={17} /></button>
                <button className="atto-button atto-button-ghost atto-button-lg" onClick={() => scrollToId("produto")}>Conhecer a plataforma</button>
              </div>
              <div className="atto-release-status">
                <span className="atto-live-dot" />
                <span><strong>Portal de licenças e atualizações</strong><small>Estado, renovações, downloads autorizados e agentes por conta.</small></span>
                <ShieldCheck size={18} />
              </div>
              <div className="atto-hero-trust">
                <span><Check size={14} /> Dados operacionais no desktop</span>
                <span><Check size={14} /> Licenciamento por plano</span>
                <span><Check size={14} /> IA por conta WhatsApp</span>
              </div>
            </div>
            <div className="atto-hero-visual" aria-label="Pré-visualização da plataforma ATTOZAP">
              <div className="atto-orbit atto-orbit-a" /><div className="atto-orbit atto-orbit-b" /><div className="atto-orbit atto-orbit-c" />
              <div className="atto-app-window">
                <div className="atto-window-top"><span className="atto-window-dots"><i /><i /><i /></span><span>ATTOZAP WASender Pro</span><span className="atto-window-state"><i /> Sessão protegida</span></div>
                <div className="atto-app-body">
                  <aside className="atto-mock-sidebar"><div className="atto-mock-logo"><BrandMark /> ATTOZAP</div><div className="atto-mock-account"><span className="atto-account-avatar">G</span><span><b>Comercial Brasil</b><small>Conectada</small></span></div><span className="atto-mock-nav active">Visão geral</span><span className="atto-mock-nav">WebChat</span><span className="atto-mock-nav">Automações</span><span className="atto-mock-nav">Campanhas</span></aside>
                  <div className="atto-mock-content"><div className="atto-mock-header"><span><small>OPERAÇÃO</small><b>Bom trabalho, Gleyson.</b></span><em>Plano Pro</em></div><div className="atto-mock-hero-card"><span><small>ESTADO DA OPERAÇÃO</small><strong>O essencial, numa única leitura.</strong><p>Contas conectadas, campanhas e automações prontas para usar.</p><button onClick={openPortal}>Abrir portal</button></span><span className="atto-brand-orb"><BrandMark /></span></div><div className="atto-mock-metrics"><article><small>Contas</small><b>03</b><i /></article><article><small>Automações</small><b>08</b><i /></article><article><small>Estado</small><b>Saudável</b><i /></article></div><div className="atto-mock-lower"><div className="atto-chart-line"><i /><i /><i /><i /><i /><i /></div><div className="atto-mock-list"><i /><i /><i /></div></div></div>
                </div>
              </div>
              <div className="atto-floating-chip atto-chip-health"><ShieldCheck size={17} /><span><b>Health Center</b><small>Diagnóstico disponível</small></span></div>
              <div className="atto-floating-chip atto-chip-chat"><MessageCircle size={17} /><span><b>WebChat</b><small>Conversa e contexto</small></span></div>
            </div>
          </div>
        </section>

        <section className="atto-signal-strip"><div className="atto-container atto-signal-grid"><div><span className="atto-signal-icon"><Layers3 size={19} /></span><span><b>Multi-conta consciente</b><small>Cada operação no canal certo.</small></span></div><div><span className="atto-signal-icon"><Workflow size={19} /></span><span><b>Automações locais</b><small>Fluxos visuais sem servidor extra.</small></span></div><div><span className="atto-signal-icon"><Bot size={19} /></span><span><b>IA por contexto</b><small>Agentes configurados por conta.</small></span></div><div><span className="atto-signal-icon"><ShieldCheck size={19} /></span><span><b>Portal de gestão</b><small>Planos, chaves e versões num só local.</small></span></div></div></section>

        <section id="produto" className="atto-section atto-product-section">
          <div className="atto-container">
            <div className="atto-section-heading"><span className="atto-eyebrow">O produto</span><h2>Local-first para trabalhar com <span>mais clareza e menos ferramentas soltas.</span></h2><p>O aplicativo concentra o trabalho operacional no computador. O portal estende a gestão comercial e de configuração sem substituir o controlo do utilizador sobre as sessões e os dados locais.</p></div>
            <div className="atto-philosophy-grid"><article className="atto-philo-main"><div><span>UMA BASE, VÁRIOS FLUXOS</span><h3>Do contacto à automação, sem perder contexto.</h3><p>Faça a ponte entre WebChat, contactos, campanhas, identidade JID/LID e automações visuais. A experiência foi organizada para operações que pedem ritmo e rastreabilidade.</p></div><div className="atto-orbital-diagram"><div className="atto-core-orb"><BrandMark /></div><i className="atto-ring atto-ring-one" /><i className="atto-ring atto-ring-two" /><b className="atto-satellite atto-sat-one">WebChat</b><b className="atto-satellite atto-sat-two">Contas</b><b className="atto-satellite atto-sat-three">Fluxos</b><b className="atto-satellite atto-sat-four">Licenças</b></div></article><article className="atto-philo-card"><Bot size={25} /><span>AGENTE CONFIGURÁVEL</span><h3>IA que respeita a conta, o modo e o prompt.</h3><p>Selecione o canal, o provedor, o modelo e a operação: responder, reativar, qualificar ou combinar estratégias.</p></article><article className="atto-philo-card"><ShieldCheck size={25} /><span>GESTÃO OPERACIONAL</span><h3>Visibilidade para quem usa e para quem administra.</h3><p>Licenças, renovação, versões autorizadas e estados de acesso acessíveis a partir de um portal coerente.</p></article></div>
          </div>
        </section>

        <section id="recursos" className="atto-section"><div className="atto-container"><div className="atto-section-heading atto-section-heading-center"><span className="atto-eyebrow">Recursos</span><h2>Uma operação desktop que não <span>esconde o que importa.</span></h2><p>As funcionalidades centrais da branch de referência foram organizadas numa linguagem visual alinhada ao portal de gestão.</p></div><div className="atto-feature-grid">{featureCards.map(({ icon: Icon, title, text, tag }) => <article className="atto-feature-card" key={title}><div className="atto-feature-top"><span className="atto-feature-icon"><Icon size={21} /></span><small>{tag}</small></div><h3>{title}</h3><p>{text}</p><span className="atto-feature-link">Explorar no portal <ArrowRight size={14} /></span></article>)}</div></div></section>

        <section id="planos" className="atto-section atto-pricing-section"><div className="atto-container"><div className="atto-section-heading atto-section-heading-center"><span className="atto-eyebrow">Planos e licenças</span><h2>Escolha a escala que <span>acompanha a sua operação.</span></h2><p>O portal acompanha o plano contratado, dias restantes, renovações e versões disponíveis para a sua licença.</p></div><div className="atto-pricing-grid">{plans.map(plan => <article className={`atto-pricing-card ${plan.featured ? "is-featured" : ""}`} key={plan.name}>{plan.featured && <span className="atto-popular">Mais escolhido</span>}<span className="atto-plan-scale">{plan.scale}</span><h3>{plan.name}</h3><p className="atto-plan-limit">{plan.limit}</p><div className="atto-price">{plan.price ? <><strong>R${plan.price}</strong><span>/ mês</span></> : <strong>Fale connosco</strong>}</div><button className={`atto-button ${plan.featured ? "atto-button-primary" : "atto-button-ghost"} atto-plan-button`} onClick={plan.name === "Enterprise" ? () => window.open("https://wa.me/5511936216745?text=Olá!%20Quero%20conhecer%20o%20plano%20Enterprise%20do%20ATTOZAP.", "_blank", "noopener,noreferrer") : openPortal}>{plan.name === "Enterprise" ? "Solicitar proposta" : "Gerir no portal"} <ArrowRight size={15} /></button><ul>{plan.features.map(feature => <li key={feature}><Check size={15} />{feature}</li>)}</ul></article>)}</div></div></section>

        <section className="atto-release-section"><div className="atto-container atto-release-layout"><div><span className="atto-eyebrow">Atualizações</span><h2>O desktop evolui. O seu acesso acompanha.</h2><p>Entre no portal para acompanhar elegibilidade do seu plano e downloads publicados. As versões continuam distribuídas com informação clara de compatibilidade.</p></div><div className="atto-release-actions"><button className="atto-button atto-button-primary" onClick={openPortal}>Aceder a downloads <Download size={16} /></button><a className="atto-button atto-button-ghost" href="https://github.com/gleyson-bots/ATTOZAP-DOWNLOAD/releases/latest" target="_blank" rel="noreferrer">Ver release pública <ArrowRight size={16} /></a></div></div></section>

        <section id="faq" className="atto-section atto-faq-section"><div className="atto-container atto-faq-layout"><div><span className="atto-eyebrow">Perguntas frequentes</span><h2>Informação direta para decidir com segurança.</h2><p>O ATTOZAP foi pensado como aplicativo desktop com funções locais. O portal complementa a gestão comercial e a configuração dos recursos ligados à conta.</p><button className="atto-button atto-button-ghost" onClick={() => window.open("mailto:gleysonferreira531@gmail.com", "_blank", "noopener,noreferrer")}>Falar com suporte <ArrowRight size={15} /></button></div><div className="atto-faq-list">{faqs.map(([question, answer], index) => <article className={`atto-faq-item ${openFaq === index ? "is-open" : ""}`} key={question}><button onClick={() => setOpenFaq(openFaq === index ? -1 : index)} aria-expanded={openFaq === index}><span>{question}</span><ChevronDown size={18} /></button>{openFaq === index && <p>{answer}</p>}</article>)}</div></div></section>
      </main>

      <footer className="atto-footer"><div className="atto-container atto-footer-grid"><div><div className="atto-brand"><span className="atto-brand-orb"><BrandMark /></span><span className="atto-brand-copy"><strong>ATTOZAP</strong><small>WASENDER PRO</small></span></div><p>Plataforma desktop local-first para operações WhatsApp organizadas, com portal de licenças, versões e configuração inteligente.</p></div><div><b>Portal</b><button onClick={openPortal}>Área do cliente</button><button onClick={openPortal}>Downloads</button><button onClick={openPortal}>Agentes de IA</button></div><div><b>Suporte</b><a href="mailto:gleysonferreira531@gmail.com">gleysonferreira531@gmail.com</a><a href="https://wa.me/5511936216745" target="_blank" rel="noreferrer">+55 11 93621-6745</a><span>GleysonDevs</span></div></div><div className="atto-container atto-footer-bottom"><span>© {new Date().getFullYear()} ATTOZAP. Todos os direitos reservados.</span><span>Uso responsável e em conformidade com as plataformas aplicáveis.</span></div></footer>
    </div>
  );
}

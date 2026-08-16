import { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  ArrowRight, Bot, Check, ChevronDown, Download, FileText, Flame, Gauge, Globe2, Layers3,
  Mail, Menu, MessageCircle, Moon, MousePointerClick, PlayCircle, Search, Send, ShieldCheck,
  Sparkles, Sun, Users, Wifi, Wrench, X, Zap
} from 'lucide-react';
import './styles.css';

const DOWNLOAD_URL = import.meta.env.VITE_DOWNLOAD_URL || '#download';
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
  ['Automação local', 'Auto Reply, templates e rotinas locais para reduzir tarefas repetitivas sem depender de um painel externo.', Bot],
  ['Health Center', 'Diagnóstico local, backups, integridade do banco e visibilidade sobre o estado real das sessões.', Gauge],
  ['Google Maps & extratores', 'Pesquise negócios e organize contatos em ferramentas integradas ao fluxo do aplicativo.', Search],
  ['Aquecimento controlado', 'Rotinas entre contas próprias e grupos permitidos, com intervalos, limites e histórico observável.', Flame],
];

const faqs = [
  ['O ATTOZAP funciona no navegador?', 'Não. O produto principal é um aplicativo desktop para Windows, pensado para quem quer trabalhar com suas ferramentas em uma interface local e dedicada.'],
  ['Preciso manter um servidor próprio?', 'Não para as funções locais do aplicativo. O ATTOZAP foi desenhado para rodar no computador do usuário, com banco e configurações locais.'],
  ['Posso usar mais de uma conta?', 'Sim. O ATTOZAP possui gerenciamento multi-conta e permite selecionar o canal utilizado em diferentes ferramentas.'],
  ['O aplicativo recebe atualizações?', 'Sim. Novas versões podem incluir correções, melhorias de interface, compatibilidade e novas ferramentas.'],
  ['Como funciona a licença?', 'A licença é ativada no próprio aplicativo. Os recursos e limites disponíveis dependem do plano comercial contratado.'],
];

function App() {
  const [dark, setDark] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [faqOpen, setFaqOpen] = useState(0);

  useEffect(() => {
    const saved = localStorage.getItem('attozap-site-theme');
    const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
    const next = saved ? saved === 'dark' : prefersDark;
    setDark(next);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    localStorage.setItem('attozap-site-theme', dark ? 'dark' : 'light');
  }, [dark]);

  const year = useMemo(() => new Date().getFullYear(), []);
  const go = (id) => {
    setMenuOpen(false);
    document.querySelector(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return <>
    <header className="site-header">
      <div className="container nav-wrap">
        <button className="brand" onClick={() => go('#inicio')} aria-label="Ir ao início">
          <img src="/logo.svg" alt="ATTOZAP" />
          <span><b>ATTOZAP</b><small>WASENDER PRO</small></span>
        </button>
        <nav className={menuOpen ? 'nav open' : 'nav'}>
          <button onClick={() => go('#recursos')}>Recursos</button>
          <button onClick={() => go('#produto')}>Produto</button>
          <button onClick={() => go('#como-funciona')}>Como funciona</button>
          <button onClick={() => go('#faq')}>FAQ</button>
          <button onClick={() => go('#contato')}>Contato</button>
        </nav>
        <div className="nav-actions">
          <button className="icon-btn" onClick={() => setDark(v => !v)} aria-label="Alternar tema">{dark ? <Sun size={18}/> : <Moon size={18}/>}</button>
          <a className="btn primary compact desktop-cta" href={DOWNLOAD_URL}><Download size={17}/> Download</a>
          <button className="menu-btn" onClick={() => setMenuOpen(v => !v)}>{menuOpen ? <X/> : <Menu/>}</button>
        </div>
      </div>
    </header>

    <main>
      <section className="hero" id="inicio">
        <div className="hero-glow glow-a"/><div className="hero-glow glow-b"/>
        <div className="container hero-grid">
          <div className="hero-copy reveal">
            <div className="eyebrow"><Sparkles size={15}/> Seu WhatsApp de trabalho, mais organizado.</div>
            <h1>Envie, converse e gerencie <span>sem complicação.</span></h1>
            <p>O ATTOZAP reúne WebChat, campanhas, multi-conta, grupos, automações e ferramentas de produtividade em uma experiência desktop moderna para Windows.</p>
            <div className="hero-actions">
              <a className="btn primary large" href={DOWNLOAD_URL}><Download size={19}/> Baixar para Windows</a>
              <button className="btn secondary large" onClick={() => go('#produto')}><PlayCircle size={19}/> Conhecer o produto</button>
            </div>
            <div className="trust-row">
              <span><Check/> Aplicativo desktop</span><span><Check/> Dados locais</span><span><Check/> Multi-conta</span>
            </div>
          </div>

          <div className="product-stage reveal delay-1" aria-label="Prévia do ATTOZAP">
            <div className="window">
              <div className="window-bar"><span/><span/><span/><small>ATTOZAP 2.0 Pro</small></div>
              <div className="app-demo">
                <aside className="demo-sidebar">
                  <div className="demo-brand"><img src="/logo.svg"/><b>ATTOZAP</b></div>
                  <div className="demo-online"><Wifi size={15}/><span><b>2 contas online</b><small>2 configuradas</small></span></div>
                  {['Visão geral','Contact Sender','Group Sender','Agendamentos','Templates','Contas','WebChat','Contatos & listas'].map((x,i)=><div className={i===0?'demo-nav active':'demo-nav'} key={x}><i/><span>{x}</span></div>)}
                </aside>
                <section className="demo-main">
                  <div className="demo-top"><span><small>ATTOZAP / WASENDER</small><b>Visão geral</b></span><em>WhatsApp ativo</em></div>
                  <div className="demo-hero"><div><small>WASENDER DESKTOP</small><h3>Envie, converse e organize sem complicação.</h3><p>Sender, WebChat, grupos, filtros e automações.</p><button>Novo envio</button></div><img src="/logo.svg"/></div>
                  <div className="demo-stats"><article><small>Contas online</small><b>2/2</b></article><article><small>Enviadas</small><b>1.248</b></article><article><small>Taxa de sucesso</small><b>98.7%</b></article></div>
                </section>
              </div>
            </div>
            <div className="float-card card-one"><ShieldCheck/><span><b>Health Center</b><small>Sistema operacional</small></span></div>
            <div className="float-card card-two"><MessageCircle/><span><b>WebChat</b><small>Conversa em tempo real</small></span></div>
          </div>
        </div>
      </section>

      <section className="proof-strip">
        <div className="container proof-grid">
          <div><b>Multi-conta</b><span>Centralize seus canais</span></div>
          <div><b>Desktop</b><span>Experiência focada no Windows</span></div>
          <div><b>WebChat</b><span>Converse sem trocar de tela</span></div>
          <div><b>Local-first</b><span>Banco, sessões e configurações locais</span></div>
        </div>
      </section>

      <section className="section" id="recursos">
        <div className="container">
          <div className="section-head"><span className="eyebrow"><Zap size={14}/> TUDO EM UM SÓ LUGAR</span><h2>Ferramentas para trabalhar com mais velocidade.</h2><p>Uma interface única para tarefas que antes exigiam várias janelas, planilhas e utilitários separados.</p></div>
          <div className="feature-grid">{features.map(([title,text,Icon],i)=><article className="feature-card" key={title}><div className="feature-icon"><Icon/></div><span>0{i+1}</span><h3>{title}</h3><p>{text}</p><ArrowRight size={17}/></article>)}</div>
        </div>
      </section>

      <section className="section split-section" id="produto">
        <div className="container split-grid">
          <div className="visual-panel">
            <div className="chat-mock">
              <div className="chat-head"><div className="avatar">C</div><span><b>Comercial</b><small>online agora</small></span><div className="status-dot"/></div>
              <div className="chat-body"><div className="bubble in">Olá! Gostaria de conhecer o produto.</div><div className="bubble out">Claro! Posso te mostrar os principais recursos do ATTOZAP.</div><div className="media-row"><div>IMG</div><div>AUDIO</div><div>DOC</div></div><div className="composer">Digite uma mensagem... <Send size={16}/></div></div>
            </div>
          </div>
          <div className="split-copy"><span className="eyebrow"><MessageCircle size={14}/> WEBCHAT</span><h2>Uma experiência de conversa feita para ocupar a tela inteira.</h2><p>Escolha a sessão, encontre conversas, visualize perfil, histórico e mídias e responda sem abandonar o ATTOZAP.</p><ul><li><Check/> Fotos, nomes e identidades organizadas</li><li><Check/> Imagens, vídeos, áudios, documentos e figurinhas</li><li><Check/> Seletor de canal para múltiplas contas</li><li><Check/> Histórico local e busca de conversas</li></ul></div>
        </div>
      </section>

      <section className="section workflow" id="como-funciona">
        <div className="container">
          <div className="section-head centered"><span className="eyebrow"><MousePointerClick size={14}/> COMEÇAR É SIMPLES</span><h2>Do download ao primeiro envio em poucos passos.</h2></div>
          <div className="steps">
            <article><span>01</span><div className="step-icon"><Download/></div><h3>Baixe</h3><p>Instale ou execute a versão disponibilizada para Windows.</p></article>
            <article><span>02</span><div className="step-icon"><ShieldCheck/></div><h3>Ative sua licença</h3><p>Insira a chave fornecida no momento da contratação.</p></article>
            <article><span>03</span><div className="step-icon"><Wifi/></div><h3>Conecte sua conta</h3><p>Adicione uma ou mais sessões e escolha o canal desejado.</p></article>
            <article><span>04</span><div className="step-icon"><Send/></div><h3>Comece a trabalhar</h3><p>Use WebChat, envios, grupos, templates e automações.</p></article>
          </div>
        </div>
      </section>

      <section className="section download-section" id="download">
        <div className="container download-card">
          <div><span className="eyebrow"><Download size={14}/> WINDOWS</span><h2>Leve o ATTOZAP para o seu desktop.</h2><p>Baixe a versão mais recente disponibilizada pela equipe e comece sua configuração.</p><div className="mini-list"><span><Check/> Windows 10/11 64-bit</span><span><Check/> Interface clara e escura</span><span><Check/> Atualizações contínuas</span></div></div>
          <div className="download-actions"><img src="/logo.svg"/><a className="btn primary large full" href={DOWNLOAD_URL}><Download/> Baixar ATTOZAP .exe</a><small>Ao baixar, você concorda com os termos de uso e política de privacidade aplicáveis.</small></div>
        </div>
      </section>

      <section className="section" id="faq">
        <div className="container faq-grid"><div><span className="eyebrow"><FileText size={14}/> DÚVIDAS FREQUENTES</span><h2>Antes de começar.</h2><p>Respostas rápidas sobre instalação, licença e uso do aplicativo.</p></div><div className="faq-list">{faqs.map(([q,a],i)=><article className={faqOpen===i?'faq-item open':'faq-item'} key={q}><button onClick={()=>setFaqOpen(faqOpen===i?-1:i)}><span>{q}</span><ChevronDown/></button><div><p>{a}</p></div></article>)}</div></div>
      </section>

      <section className="section contact-section" id="contato">
        <div className="container contact-card">
          <div><span className="eyebrow"><Sparkles size={14}/> FALE COM A GENTE</span><h2>Quer contratar o ATTOZAP?</h2><p>Converse com o comercial, tire dúvidas sobre licenças e escolha a configuração ideal para sua operação.</p></div>
          <div className="contact-actions"><a className="btn whatsapp large" href={WHATSAPP_URL} target="_blank" rel="noreferrer"><MessageCircle/> Falar pelo WhatsApp</a><a className="btn secondary large" href={`mailto:${SALES_EMAIL}?subject=${encodeURIComponent('ATTOZAP WASender Pro - Comercial')}`}><Mail/> {SALES_EMAIL}</a></div>
        </div>
      </section>
    </main>

    <footer><div className="container footer-grid"><div className="brand footer-brand"><img src="/logo.svg"/><span><b>ATTOZAP</b><small>WASENDER PRO</small></span></div><p>ATTO FLOW BY GLEYSONDEVS · © {year}</p><div><button onClick={() => go('#recursos')}>Recursos</button><button onClick={() => go('#faq')}>FAQ</button><button onClick={() => go('#contato')}>Contato</button></div></div></footer>
  </>;
}

createRoot(document.getElementById('root')).render(<App />);

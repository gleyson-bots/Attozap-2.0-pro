import { useCallback, useEffect, useState } from 'react';
import {
  Activity, Ban, BarChart3, Bot, BriefcaseBusiness, CalendarClock, ChevronRight, ContactRound, FileSearch, FileText, Flame, Gauge, Group,
  KeyRound, LayoutDashboard, Menu, MessageCircle, MessageSquareText, Moon, PanelLeftClose, PanelLeftOpen, Search, Send, Settings,
  Sun, Users, Wifi, Wrench, X,
} from 'lucide-react';
import attoLogo from './assets/attozap-logo.svg';
import { AccountsPage } from './pages/AccountsPage';
import { SenderPage } from './pages/SenderPage';
import { NumberFilterPage } from './pages/ToolsPages';
import { ContactsPage } from './pages/ContactsPage';
import { ContactGrabberPage } from './pages/ContactGrabberPage';
import { GroupToolsPage } from './pages/GroupToolsPage';
import { BulkGroupsPage } from './pages/BulkGroupsPage';
import { TemplatesPage } from './pages/TemplatesPage';
import { PollReportPage } from './pages/PollReportPage';
import { ExtractorsPage } from './pages/ExtractorsPage';
import { AutoReplyPage, SchedulerPage } from './pages/AutomationPages';
import { LicenseActivationPage } from './pages/LicensePage';
import { WebChatPage } from './pages/WebChatPage';
import { WarmupPage } from './pages/WarmupPage';
import { RecruitingPage } from './pages/RecruitingPage';
import { StartupGate } from './pages/StartupGate';
import { SettingsPage, applyUiPreferences } from './pages/SettingsPage';
import { campaignPercent, toLocalDateTime } from './lib';

type View = 'dashboard'|'sender'|'groupSender'|'scheduler'|'templates'|'pollReport'|'accounts'|'webchat'|'contacts'|'contactGrabber'|'numberFilter'|'groups'|'bulkGroups'|'autoReply'|'warmup'|'extractors'|'recruiting'|'license'|'settings';
type NavItem = { id: View; label: string; icon: any };

const sections: Array<{ label: string; items: NavItem[] }> = [
  { label: 'INÍCIO', items: [{ id: 'dashboard', label: 'Visão geral', icon: LayoutDashboard }] },
  { label: 'ENVIOS', items: [
    { id: 'sender', label: 'Contact Sender', icon: Send }, { id: 'groupSender', label: 'Group Sender', icon: Group },
    { id: 'scheduler', label: 'Agendamentos', icon: CalendarClock }, { id: 'templates', label: 'Templates', icon: FileText }, { id: 'pollReport', label: 'Poll Report', icon: BarChart3 },
  ] },
  { label: 'WHATSAPP', items: [
    { id: 'accounts', label: 'Contas', icon: Wifi }, { id: 'webchat', label: 'WebChat', icon: MessageCircle },
    { id: 'contacts', label: 'Contatos & listas', icon: ContactRound }, { id: 'contactGrabber', label: 'Contact Grabber', icon: MessageSquareText },
    { id: 'groups', label: 'Ferramentas de grupos', icon: Users }, { id: 'bulkGroups', label: 'Bulk Group Tools', icon: Group },
  ] },
  { label: 'AUTOMAÇÃO', items: [{ id: 'autoReply', label: 'Auto Reply', icon: Bot }, { id: 'warmup', label: 'Aquecimento', icon: Flame }] },
  { label: 'FERRAMENTAS', items: [
    { id: 'numberFilter', label: 'Number Filter', icon: FileSearch }, { id: 'extractors', label: 'Google Maps & Extratores', icon: Wrench },
    { id: 'recruiting', label: 'Candidaturas', icon: BriefcaseBusiness },
  ] },
  { label: 'SISTEMA', items: [{ id: 'license', label: 'Licença', icon: KeyRound }, { id: 'settings', label: 'Configurações', icon: Settings }] },
];

export default function App() {
  const [ready, setReady] = useState(false);
  const [view, setView] = useState<View>('dashboard');
  const [dark, setDark] = useState(true);
  const [mobileNav, setMobileNav] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [version, setVersion] = useState('2.0');
  const reloadAccounts = useCallback(async () => setAccounts(await window.attozap.accounts.list()), []);
  const reloadCampaigns = useCallback(async () => setCampaigns(await window.attozap.campaigns.list()), []);

  useEffect(() => {
    void window.attozap.app.version().then(setVersion);
    void (async () => {
      const [theme, fontScale, accent, density, collapsed] = await Promise.all([
        window.attozap.settings.get('ui_theme'), window.attozap.settings.get('ui_font_scale'), window.attozap.settings.get('ui_accent'),
        window.attozap.settings.get('ui_density'), window.attozap.settings.get('ui_sidebar_collapsed'),
      ]);
      setDark(theme !== 'light'); setSidebarCollapsed(collapsed === 'true');
      applyUiPreferences({ fontScale: fontScale || '112', accent: accent || 'violet', density: density || 'comfortable' });
    })();
  }, []);

  useEffect(() => {
    if (!ready) return;
    void reloadAccounts(); void reloadCampaigns();
    const offState = window.attozap.accounts.onState(() => void reloadAccounts());
    const offProgress = window.attozap.campaigns.onProgress(() => void reloadCampaigns());
    return () => { offState?.(); offProgress?.(); };
  }, [ready, reloadAccounts, reloadCampaigns]);

  if (!ready) return <StartupGate onReady={() => setReady(true)}/>;

  async function toggleTheme() { const next = !dark; setDark(next); await window.attozap.settings.set('ui_theme', next ? 'dark' : 'light'); }
  async function toggleSidebar() { const next = !sidebarCollapsed; setSidebarCollapsed(next); await window.attozap.settings.set('ui_sidebar_collapsed', String(next)); }

  const active = sections.flatMap(section => section.items).find(item => item.id === view);
  const connected = accounts.filter(account => account.status === 'connected').length;
  const fullWorkspace = view === 'webchat';

  return <div className={`app-shell ${dark ? 'theme-dark' : 'theme-light'} ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
    <aside className={`sidebar ${mobileNav ? 'open' : ''}`}>
      <div className="brand"><div className="brand-mark brand-bot"><img src={attoLogo} alt="ATTOZAP Bot"/></div><div><strong>ATTOZAP</strong><span>WASENDER PRO</span></div><button className="sidebar-close" onClick={() => setMobileNav(false)}><X size={18}/></button></div>
      <div className="connection-summary"><div className="connection-orb"><Wifi size={17}/></div><div><b>{connected} conta{connected === 1 ? '' : 's'} online</b><span>{accounts.length} configurada{accounts.length === 1 ? '' : 's'}</span></div><span className="live-dot"/></div>
      <nav className="nav-scroll">{sections.map(section => <div className="nav-section" key={section.label}><p>{section.label}</p>{section.items.map(item => { const Icon = item.icon; return <button key={item.id} className={view === item.id ? 'active' : ''} onClick={() => { setView(item.id); setMobileNav(false); }}><Icon size={18}/><span>{item.label}</span>{view === item.id && <ChevronRight size={14}/>}</button>; })}</div>)}</nav>
      <div className="sidebar-footer"><img src={attoLogo} alt=""/><div><b>ATTOZAP {version}</b><span>ATTO FLOW BY GLEYSONDEVS</span></div></div>
    </aside>

    <main className="workspace">
      <header className="topbar">
        <button className="mobile-menu" onClick={() => setMobileNav(true)}><Menu size={19}/></button>
        <button className="icon-button sidebar-toggle" onClick={() => void toggleSidebar()} title={sidebarCollapsed ? 'Mostrar menu' : 'Esconder menu'}>{sidebarCollapsed ? <PanelLeftOpen size={17}/> : <PanelLeftClose size={17}/>}</button>
        <div><span className="breadcrumb">ATTOZAP / WASENDER</span><h1>{active?.label ?? 'ATTOZAP'}</h1></div>
        <div className="topbar-actions"><div className="top-search"><Search size={16}/><span>Ferramentas WASender</span></div><button className="icon-button" onClick={() => void toggleTheme()}>{dark ? <Sun size={17}/> : <Moon size={17}/>}</button><button className="account-pill" onClick={() => setView('accounts')}><span className={connected ? 'online-dot' : 'offline-dot'}/><div><b>{connected ? 'WhatsApp ativo' : 'Desconectado'}</b><small>{connected ? `${connected} sessão(ões)` : 'Conectar conta'}</small></div></button></div>
      </header>
      <div className={`page-content ${fullWorkspace ? 'page-content-full' : ''}`}>
        {view === 'dashboard' && <Dashboard accounts={accounts} campaigns={campaigns} go={setView}/>} 
        {view === 'sender' && <SenderPage mode="contact" accounts={accounts} campaigns={campaigns} reloadCampaigns={reloadCampaigns}/>} 
        {view === 'groupSender' && <SenderPage mode="group" accounts={accounts} campaigns={campaigns} reloadCampaigns={reloadCampaigns}/>} 
        {view === 'scheduler' && <SchedulerPage campaigns={campaigns}/>} {view === 'templates' && <TemplatesPage/>} {view === 'pollReport' && <PollReportPage accounts={accounts}/>} 
        {view === 'accounts' && <AccountsPage accounts={accounts} reload={reloadAccounts}/>} {view === 'webchat' && <WebChatPage accounts={accounts} reloadAccounts={reloadAccounts}/>} 
        {view === 'contacts' && <ContactsPage/>} {view === 'contactGrabber' && <ContactGrabberPage accounts={accounts}/>} {view === 'numberFilter' && <NumberFilterPage accounts={accounts}/>} 
        {view === 'groups' && <GroupToolsPage accounts={accounts}/>} {view === 'bulkGroups' && <BulkGroupsPage accounts={accounts}/>} {view === 'autoReply' && <AutoReplyPage accounts={accounts}/>} 
        {view === 'warmup' && <WarmupPage accounts={accounts}/>} {view === 'extractors' && <ExtractorsPage/>} {view === 'recruiting' && <RecruitingPage/>}
        {view === 'license' && <LicenseActivationPage/>} {view === 'settings' && <SettingsPage accounts={accounts}/>} 
      </div>
    </main>
  </div>;
}

function Dashboard({ accounts, campaigns, go }: { accounts: any[]; campaigns: any[]; go: (view: View) => void }) {
  const online = accounts.filter(account => account.status === 'connected').length;
  const totalSent = campaigns.reduce((sum, campaign) => sum + Number(campaign.sent ?? 0), 0);
  const totalFailed = campaigns.reduce((sum, campaign) => sum + Number(campaign.failed ?? 0), 0);
  const active = campaigns.filter(campaign => ['running', 'paused', 'scheduled'].includes(campaign.status));
  const rate = totalSent + totalFailed ? Math.round(totalSent / (totalSent + totalFailed) * 1000) / 10 : 100;
  return <div className="page-stack">
    <section className="dashboard-hero"><div><span className="kicker">WASENDER DESKTOP</span><h2>Envie, converse e organize sem complicação.</h2><p>Sender, WebChat, grupos, Google Maps, filtros e automações em uma interface desktop local.</p><div className="hero-actions"><button className="button primary big" onClick={() => go('sender')}><Send size={18}/> Novo envio</button><button className="button ghost big" onClick={() => go('webchat')}><MessageCircle size={18}/> Abrir WebChat</button><button className="button ghost big" onClick={() => go('accounts')}><Wifi size={18}/> Contas</button></div></div><div className="hero-visual"><img src={attoLogo} alt="ATTOZAP Bot"/><span>{online ? 'Motor conectado' : 'Aguardando conexão'}</span><b>{online} / {accounts.length}</b><small>contas online</small></div></section>
    <section className="metric-grid"><Metric icon={Wifi} label="Contas online" value={`${online}/${accounts.length}`} sub="Sessões persistentes"/><Metric icon={Send} label="Enviadas" value={totalSent.toLocaleString('pt-BR')} sub="Todas as campanhas"/><Metric icon={Gauge} label="Taxa de sucesso" value={`${rate}%`} sub={`${totalFailed} falhas registradas`}/><Metric icon={Activity} label="Em andamento" value={String(active.length)} sub="Rodando, pausadas ou agendadas"/></section>
    <div className="dashboard-grid"><section className="card"><div className="card-head"><div><h3>Campanhas recentes</h3><p>Últimos envios criados</p></div><button className="text-button" onClick={() => go('sender')}>Abrir sender →</button></div><div className="dash-campaigns">{campaigns.slice(0, 6).map(campaign => <div key={campaign.id}><div className="grow"><b>{campaign.name}</b><span>{campaign.sent}/{campaign.total} enviados · {toLocalDateTime(campaign.created_at)}</span></div><div className="mini-progress"><i style={{ width: `${campaignPercent(campaign)}%` }}/></div><span className={`status-chip ${campaign.status}`}>{campaign.status}</span></div>)}{!campaigns.length && <Empty text="Crie sua primeira campanha no Contact Sender."/>}</div></section><section className="card"><div className="card-head"><div><h3>Contas</h3><p>Status atual das sessões</p></div><button className="text-button" onClick={() => go('accounts')}>Gerenciar →</button></div><div className="dash-accounts">{accounts.map(account => <div key={account.id}><span className={`wa-avatar ${account.status === 'connected' ? 'online' : ''}`}><Wifi size={15}/></span><div className="grow"><b>{account.name}</b><small>{account.phone ? `+${account.phone}` : 'Sem número vinculado'}</small></div><span className={`status-chip ${account.status}`}>{account.status}</span></div>)}{!accounts.length && <Empty text="Adicione uma conta para começar."/>}</div></section></div>
    <section className="quick-tools"><button onClick={() => go('webchat')}><MessageCircle size={19}/><span><b>WebChat</b><small>Conversa direta + mídia</small></span></button><button onClick={() => go('extractors')}><Wrench size={19}/><span><b>Google Maps</b><small>Empresas e contatos</small></span></button><button onClick={() => go('recruiting')}><BriefcaseBusiness size={19}/><span><b>Candidaturas</b><small>Vagas e portais</small></span></button><button onClick={() => go('numberFilter')}><FileSearch size={19}/><span><b>Number Filter</b><small>Validar números</small></span></button><button onClick={() => go('contactGrabber')}><MessageSquareText size={19}/><span><b>Contact Grabber</b><small>JID/LID observados</small></span></button><button onClick={() => go('groups')}><Users size={19}/><span><b>Group Tools</b><small>Membros e convites</small></span></button><button onClick={() => go('warmup')}><Flame size={19}/><span><b>Aquecimento</b><small>Cadência controlada</small></span></button><button onClick={() => go('autoReply')}><Bot size={19}/><span><b>Auto Reply</b><small>Respostas automáticas</small></span></button></section>
  </div>;
}
function Metric({ icon: Icon, label, value, sub }: { icon: any; label: string; value: string; sub: string }) { return <article className="metric-card"><div className="metric-icon"><Icon size={19}/></div><span>{label}</span><b>{value}</b><small>{sub}</small></article>; }
function Empty({ text }: { text: string }) { return <div className="empty mini"><MessageSquareText size={23}/><p>{text}</p></div>; }

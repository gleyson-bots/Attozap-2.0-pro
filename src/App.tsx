import { useCallback, useEffect, useState } from 'react';
import {
  Activity, BarChart3, Bot, BriefcaseBusiness, CalendarClock, ChevronRight, ContactRound, FileSearch, FileText, Fingerprint, Flame, Gauge, Group, Sparkles,
  HeartPulse, KeyRound, LayoutDashboard, LifeBuoy, ListChecks, Menu, MessageCircle, MessageSquareText, Moon, PanelLeftClose, PanelLeftOpen, Search, Send, Settings,
  Sun, Users, Wifi, Wrench, X,
} from 'lucide-react';
import attoLogo from './assets/attozap-logo.svg';
import { AccountsPage } from './pages/AccountsPage';
import { SenderPage } from './pages/SenderPage';
import { CampaignCenterPage } from './pages/CampaignCenterPage';
import { DeliveryCenterPage } from './pages/DeliveryCenterPage';
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
import { AIChatPage } from './pages/AIChatPage';
import { WarmupPage } from './pages/WarmupPage';
import { RecruitingPage } from './pages/RecruitingPage';
import { StartupGate } from './pages/StartupGate';
import { SettingsPage, applyUiPreferences } from './pages/SettingsPage';
import { HealthCenterPage } from './pages/HealthCenterPage';
import { IdentityCenterPage } from './pages/IdentityCenterPage';
import { SupportPage } from './pages/SupportPage';
import { campaignPercent, toLocalDateTime } from './lib';

type UiMode = 'basic'|'advanced';
type View = 'dashboard'|'sender'|'groupSender'|'campaignCenter'|'deliveryCenter'|'scheduler'|'templates'|'pollReport'|'accounts'|'webchat'|'aiChat'|'contacts'|'contactGrabber'|'numberFilter'|'groups'|'bulkGroups'|'autoReply'|'warmup'|'extractors'|'recruiting'|'health'|'identities'|'license'|'settings'|'support';
type NavItem = { id: View; label: string; icon: any; advanced?: boolean };

const sections: Array<{ label: string; items: NavItem[] }> = [
  { label: 'INÍCIO', items: [{ id: 'dashboard', label: 'Visão geral', icon: LayoutDashboard }] },
  { label: 'ENVIOS', items: [
    { id: 'sender', label: 'Contact Sender', icon: Send }, { id: 'groupSender', label: 'Group Sender', icon: Group },
    { id: 'campaignCenter', label: 'Campaign Center', icon: ListChecks }, { id: 'deliveryCenter', label: 'Delivery Center', icon: Activity }, { id: 'scheduler', label: 'Agendamentos', icon: CalendarClock }, { id: 'templates', label: 'Templates', icon: FileText }, { id: 'pollReport', label: 'Poll Report', icon: BarChart3, advanced: true },
  ] },
  { label: 'WHATSAPP', items: [
    { id: 'contacts', label: 'Agenda local + sincronização', icon: ContactRound }, { id: 'accounts', label: 'Contas', icon: Wifi }, { id: 'webchat', label: 'WebChat', icon: MessageCircle },
    { id: 'contactGrabber', label: 'Contact Grabber', icon: MessageSquareText, advanced: true },
    { id: 'groups', label: 'Ferramentas de grupos', icon: Users }, { id: 'bulkGroups', label: 'Bulk Group Tools', icon: Group, advanced: true },
  ] },
  { label: 'AUTOMAÇÃO', items: [{ id: 'autoReply', label: 'Auto Reply', icon: Bot }, { id: 'warmup', label: 'Aquecimento', icon: Flame }, { id: 'aiChat', label: 'Chat IA', icon: Sparkles }] },
  { label: 'FERRAMENTAS', items: [
    { id: 'numberFilter', label: 'Number Filter', icon: FileSearch, advanced: true }, { id: 'extractors', label: 'Google Maps & Extratores', icon: Wrench, advanced: true },
    { id: 'recruiting', label: 'Candidaturas', icon: BriefcaseBusiness, advanced: true },
  ] },
  { label: 'SISTEMA', items: [
    { id: 'health', label: 'Health Center', icon: HeartPulse }, { id: 'identities', label: 'Centro JID / LID', icon: Fingerprint, advanced: true },
    { id: 'license', label: 'Licença', icon: KeyRound }, { id: 'settings', label: 'Configurações', icon: Settings }, { id: 'support', label: 'Suporte', icon: LifeBuoy },
  ] },
];

export default function App() {
  const [ready, setReady] = useState(false);
  const [view, setView] = useState<View>('dashboard');
  const [dark, setDark] = useState(true);
  const [uiMode, setUiMode] = useState<UiMode>('basic');
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
      const [theme, fontScale, accent, density, collapsed, mode] = await Promise.all([
        window.attozap.settings.get('ui_theme'), window.attozap.settings.get('ui_font_scale'), window.attozap.settings.get('ui_accent'),
        window.attozap.settings.get('ui_density'), window.attozap.settings.get('ui_sidebar_collapsed'), window.attozap.settings.get('ui_mode'),
      ]);
      setDark(theme !== 'light'); setSidebarCollapsed(collapsed === 'true'); setUiMode(mode === 'advanced' ? 'advanced' : 'basic');
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
  function changeMode(mode: UiMode) {
    setUiMode(mode);
    const current = sections.flatMap(section => section.items).find(item => item.id === view);
    if (mode === 'basic' && current?.advanced) setView('dashboard');
  }

  const visibleSections = sections
    .map(section => ({ ...section, items: section.items.filter(item => uiMode === 'advanced' || !item.advanced) }))
    .filter(section => section.items.length);
  const active = sections.flatMap(section => section.items).find(item => item.id === view);
  const connected = accounts.filter(account => account.status === 'connected').length;
  const fullWorkspace = view === 'webchat';

  return <div className={`app-shell ${dark ? 'theme-dark' : 'theme-light'} ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
    <aside className={`sidebar ${mobileNav ? 'open' : ''}`}>
      <div className="brand"><div className="brand-mark brand-bot"><img src={attoLogo} alt="ATTOZAP Bot"/></div><div><strong>ATTOZAP</strong><span>WASENDER PRO</span></div><button className="sidebar-close" onClick={() => setMobileNav(false)}><X size={18}/></button></div>
      <div className="connection-summary"><div className="connection-orb"><Wifi size={17}/></div><div><b>{connected} conta{connected === 1 ? '' : 's'} online</b><span>{accounts.length} configurada{accounts.length === 1 ? '' : 's'}</span></div><span className="live-dot"/></div>
      <nav className="nav-scroll">{visibleSections.map(section => <div className="nav-section" key={section.label}><p>{section.label}</p>{section.items.map(item => { const Icon = item.icon; return <button key={item.id} className={view === item.id ? 'active' : ''} onClick={() => { setView(item.id); setMobileNav(false); }}><Icon size={18}/><span>{item.label}</span>{view === item.id && <ChevronRight size={14}/>}</button>; })}</div>)}</nav>
      <div className="sidebar-footer"><img src={attoLogo} alt=""/><div><b>ATTOZAP {version}</b><span>ATTO FLOW BY GLEYSONDEVS</span></div></div>
    </aside>
    <button className={`mobile-nav-backdrop ${mobileNav ? 'visible' : ''}`} aria-label="Fechar menu de navegação" onClick={() => setMobileNav(false)} />

    <main className="workspace">
      <header className="topbar">
        <button className="mobile-menu" onClick={() => setMobileNav(true)}><Menu size={19}/></button>
        <button className="icon-button sidebar-toggle" onClick={() => void toggleSidebar()} title={sidebarCollapsed ? 'Mostrar menu' : 'Esconder menu'}>{sidebarCollapsed ? <PanelLeftOpen size={17}/> : <PanelLeftClose size={17}/>}</button>
        <div><span className="breadcrumb">ATTOZAP / WASENDER</span><h1>{active?.label ?? 'ATTOZAP'}</h1></div>
        <div className="topbar-actions"><button className="mode-pill" onClick={() => setView('settings')} title="Alterar modo de navegação">{uiMode === 'advanced' ? 'Avançado' : 'Básico'}</button><div className="top-search"><Search size={16}/><span>Ferramentas WASender</span></div><button className="icon-button" onClick={() => void toggleTheme()}>{dark ? <Sun size={17}/> : <Moon size={17}/>}</button><button className="account-pill" onClick={() => setView('accounts')}><span className={connected ? 'online-dot' : 'offline-dot'}/><div><b>{connected ? 'WhatsApp ativo' : 'Desconectado'}</b><small>{connected ? `${connected} sessão(ões)` : 'Conectar conta'}</small></div></button></div>
      </header>
      <div className={`page-content ${fullWorkspace ? 'page-content-full' : ''}`}>
        {view === 'dashboard' && <Dashboard accounts={accounts} campaigns={campaigns} go={setView} uiMode={uiMode}/>}
        {view === 'sender' && <SenderPage mode="contact" accounts={accounts} campaigns={campaigns} reloadCampaigns={reloadCampaigns}/>}
        {view === 'groupSender' && <SenderPage mode="group" accounts={accounts} campaigns={campaigns} reloadCampaigns={reloadCampaigns}/>}
        {view === 'campaignCenter' && <CampaignCenterPage campaigns={campaigns} accounts={accounts} reloadCampaigns={reloadCampaigns}/>}
        {view === 'deliveryCenter' && <DeliveryCenterPage accounts={accounts}/>}
        {view === 'scheduler' && <SchedulerPage campaigns={campaigns}/>} {view === 'templates' && <TemplatesPage/>} {view === 'pollReport' && <PollReportPage accounts={accounts}/>}
        {view === 'accounts' && <AccountsPage accounts={accounts} reload={reloadAccounts}/>} {view === 'webchat' && <WebChatPage accounts={accounts} reloadAccounts={reloadAccounts}/>}
        {view === 'contacts' && <ContactsPage accounts={accounts}/>} {view === 'contactGrabber' && <ContactGrabberPage accounts={accounts}/>} {view === 'numberFilter' && <NumberFilterPage accounts={accounts}/>}
        {view === 'groups' && <GroupToolsPage accounts={accounts}/>} {view === 'bulkGroups' && <BulkGroupsPage accounts={accounts}/>} {view === 'autoReply' && <AutoReplyPage accounts={accounts}/>}
        {view === 'warmup' && <WarmupPage accounts={accounts}/>} {view === 'aiChat' && <AIChatPage openSettings={() => setView('settings')}/>} {view === 'extractors' && <ExtractorsPage/>} {view === 'recruiting' && <RecruitingPage/>}
        {view === 'health' && <HealthCenterPage/>} {view === 'identities' && <IdentityCenterPage accounts={accounts}/>}
        {view === 'license' && <LicenseActivationPage/>} {view === 'settings' && <SettingsPage accounts={accounts} uiMode={uiMode} onUiModeChange={changeMode}/>} {view === 'support' && <SupportPage/>}
      </div>
    </main>
  </div>;
}

function Dashboard({ accounts, campaigns, go, uiMode }: { accounts: any[]; campaigns: any[]; go: (view: View) => void; uiMode: UiMode }) {
  const online = accounts.filter(account => account.status === 'connected').length;
  const totalSent = campaigns.reduce((sum, campaign) => sum + Number(campaign.sent ?? 0), 0);
  const totalFailed = campaigns.reduce((sum, campaign) => sum + Number(campaign.failed ?? 0), 0);
  const active = campaigns.filter(campaign => ['running', 'paused', 'scheduled'].includes(campaign.status));
  const rate = totalSent + totalFailed ? Math.round(totalSent / (totalSent + totalFailed) * 1000) / 10 : 100;
  return <div className="page-stack">
    <section className="dashboard-hero"><div><span className="kicker">WASENDER DESKTOP</span><h2>Envie, converse e organize sem complicação.</h2><p>Sender, WebChat, grupos, filtros e automações em uma interface desktop local.</p><div className="hero-actions"><button className="button primary big" onClick={() => go('sender')}><Send size={18}/> Novo envio</button><button className="button ghost big" onClick={() => go('webchat')}><MessageCircle size={18}/> Abrir WebChat</button><button className="button ghost big" onClick={() => go('campaignCenter')}><ListChecks size={18}/> Campaign Center</button></div></div><div className="hero-visual"><img src={attoLogo} alt="ATTOZAP Bot"/><span>{online ? 'Motor conectado' : 'Aguardando conexão'}</span><b>{online} / {accounts.length}</b><small>contas online</small></div></section>
    <section className="metric-grid"><Metric icon={Wifi} label="Contas online" value={`${online}/${accounts.length}`} sub="Sessões persistentes"/><Metric icon={Send} label="Enviadas" value={totalSent.toLocaleString('pt-BR')} sub="Todas as campanhas"/><Metric icon={Gauge} label="Taxa de sucesso" value={`${rate}%`} sub={`${totalFailed} falhas registradas`}/><Metric icon={Activity} label="Em andamento" value={String(active.length)} sub="Rodando, pausadas ou agendadas"/></section>
    <div className="dashboard-grid"><section className="card"><div className="card-head"><div><h3>Campanhas recentes</h3><p>Últimos envios criados</p></div><button className="text-button" onClick={() => go('campaignCenter')}>Acompanhar →</button></div><div className="dash-campaigns">{campaigns.slice(0, 6).map(campaign => <div key={campaign.id}><div className="grow"><b>{campaign.name}</b><span>{campaign.sent}/{campaign.total} enviados · {toLocalDateTime(campaign.created_at)}</span></div><div className="mini-progress"><i style={{ width: `${campaignPercent(campaign)}%` }}/></div><span className={`status-chip ${campaign.status}`}>{campaign.status}</span></div>)}{!campaigns.length && <Empty text="Crie sua primeira campanha no Contact Sender."/>}</div></section><section className="card"><div className="card-head"><div><h3>Contas</h3><p>Status atual das sessões</p></div><button className="text-button" onClick={() => go('accounts')}>Gerenciar →</button></div><div className="dash-accounts">{accounts.map(account => <div key={account.id}><span className={`wa-avatar ${account.status === 'connected' ? 'online' : ''}`}><Wifi size={15}/></span><div className="grow"><b>{account.name}</b><small>{account.phone ? `+${account.phone}` : 'Sem número vinculado'}</small></div><span className={`status-chip ${account.status}`}>{account.status}</span></div>)}{!accounts.length && <Empty text="Adicione uma conta para começar."/>}</div></section></div>
    <section className="quick-tools"><button onClick={() => go('webchat')}><MessageCircle size={19}/><span><b>WebChat</b><small>Conversa direta + mídia</small></span></button><button onClick={() => go('campaignCenter')}><ListChecks size={19}/><span><b>Campaign Center</b><small>Stats e countdown em tempo real</small></span></button><button onClick={() => go('groups')}><Users size={19}/><span><b>Group Tools</b><small>Membros e convites</small></span></button><button onClick={() => go('warmup')}><Flame size={19}/><span><b>Aquecimento</b><small>Cadência controlada</small></span></button><button onClick={() => go('autoReply')}><Bot size={19}/><span><b>Auto Reply</b><small>Respostas automáticas</small></span></button><button onClick={() => go('health')}><HeartPulse size={19}/><span><b>Health Center</b><small>Banco, sockets e backups</small></span></button>{uiMode === 'advanced' && <><button onClick={() => go('extractors')}><Wrench size={19}/><span><b>Google Maps</b><small>Empresas e contatos</small></span></button><button onClick={() => go('numberFilter')}><FileSearch size={19}/><span><b>Number Filter</b><small>Validar números</small></span></button><button onClick={() => go('identities')}><Fingerprint size={19}/><span><b>JID / LID</b><small>Identidades resolvidas</small></span></button></>}</section>
  </div>;
}
function Metric({ icon: Icon, label, value, sub }: { icon: any; label: string; value: string; sub: string }) { return <article className="metric-card"><div className="metric-icon"><Icon size={19}/></div><span>{label}</span><b>{value}</b><small>{sub}</small></article>; }
function Empty({ text }: { text: string }) { return <div className="empty mini"><MessageSquareText size={23}/><p>{text}</p></div>; }

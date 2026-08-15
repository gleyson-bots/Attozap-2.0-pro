import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity, Ban, Bot, CalendarClock, ChevronRight, ContactRound, FileSearch, Gauge, Group,
  KeyRound, LayoutDashboard, Menu, MessageSquareText, Moon, Search, Send, Settings,
  ShieldCheck, Sun, Users, Wifi, Wrench, X, Zap
} from 'lucide-react';
import { AccountsPage } from './pages/AccountsPage';
import { SenderPage } from './pages/SenderPage';
import { ContactsPage, GroupsPage, NumberFilterPage } from './pages/ToolsPages';
import { AutoReplyPage, SchedulerPage } from './pages/AutomationPages';
import { campaignPercent, toLocalDateTime } from './lib';

type View = 'dashboard'|'sender'|'groupSender'|'scheduler'|'accounts'|'contacts'|'numberFilter'|'groups'|'autoReply'|'extractors'|'license'|'settings';

type NavItem = { id: View; label: string; icon: any; badge?: string };

const sections: Array<{label:string;items:NavItem[]}> = [
  {label:'INÍCIO',items:[{id:'dashboard',label:'Visão geral',icon:LayoutDashboard}]},
  {label:'ENVIOS',items:[{id:'sender',label:'Contact Sender',icon:Send},{id:'groupSender',label:'Group Sender',icon:Group},{id:'scheduler',label:'Agendamentos',icon:CalendarClock}]},
  {label:'WHATSAPP',items:[{id:'accounts',label:'Contas',icon:Wifi},{id:'contacts',label:'Contatos & listas',icon:ContactRound},{id:'groups',label:'Ferramentas de grupos',icon:Users}]},
  {label:'AUTOMAÇÃO',items:[{id:'autoReply',label:'Auto Reply',icon:Bot}]},
  {label:'FERRAMENTAS',items:[{id:'numberFilter',label:'Number Filter',icon:FileSearch},{id:'extractors',label:'Extratores',icon:Wrench}]},
  {label:'SISTEMA',items:[{id:'license',label:'Licença',icon:KeyRound},{id:'settings',label:'Configurações',icon:Settings}]},
];

export default function App(){
  const [view,setView]=useState<View>('dashboard'); const [dark,setDark]=useState(true); const [mobileNav,setMobileNav]=useState(false);
  const [accounts,setAccounts]=useState<any[]>([]); const [campaigns,setCampaigns]=useState<any[]>([]); const [version,setVersion]=useState('2.0');
  const reloadAccounts=useCallback(async()=>setAccounts(await window.attozap.accounts.list()),[]);
  const reloadCampaigns=useCallback(async()=>setCampaigns(await window.attozap.campaigns.list()),[]);

  useEffect(()=>{void reloadAccounts();void reloadCampaigns();void window.attozap.app.version().then(setVersion);const offState=window.attozap.accounts.onState(()=>void reloadAccounts());const offProgress=window.attozap.campaigns.onProgress(()=>void reloadCampaigns());return()=>{offState?.();offProgress?.()}},[reloadAccounts,reloadCampaigns]);
  const active=sections.flatMap(s=>s.items).find(item=>item.id===view);
  const connected=accounts.filter(a=>a.status==='connected').length;

  return <div className={`app-shell ${dark?'theme-dark':'theme-light'}`}>
    <aside className={`sidebar ${mobileNav?'open':''}`}>
      <div className="brand"><div className="brand-mark"><Zap size={20} fill="currentColor"/></div><div><strong>ATTOZAP</strong><span>WASENDER PRO</span></div><button className="sidebar-close" onClick={()=>setMobileNav(false)}><X size={18}/></button></div>
      <div className="connection-summary"><div className="connection-orb"><Wifi size={17}/></div><div><b>{connected} conta{connected===1?'':'s'} online</b><span>{accounts.length} configurada{accounts.length===1?'':'s'}</span></div><span className="live-dot"/></div>
      <nav className="nav-scroll">{sections.map(section=><div className="nav-section" key={section.label}><p>{section.label}</p>{section.items.map(item=>{const Icon=item.icon;return <button key={item.id} className={view===item.id?'active':''} onClick={()=>{setView(item.id);setMobileNav(false)}}><Icon size={17}/><span>{item.label}</span>{view===item.id&&<ChevronRight size={14}/>}</button>})}</div>)}</nav>
      <div className="sidebar-footer"><ShieldCheck size={15}/><div><b>ATTOZAP {version}</b><span>Desktop Edition</span></div></div>
    </aside>

    <main className="workspace">
      <header className="topbar"><button className="mobile-menu" onClick={()=>setMobileNav(true)}><Menu size={19}/></button><div><span className="breadcrumb">ATTOZAP / WASENDER</span><h1>{active?.label??'ATTOZAP'}</h1></div><div className="topbar-actions"><div className="top-search"><Search size={16}/><span>Atalhos: Ctrl + K</span></div><button className="icon-button" onClick={()=>setDark(v=>!v)}>{dark?<Sun size={17}/>:<Moon size={17}/>}</button><button className="account-pill" onClick={()=>setView('accounts')}><span className={connected?'online-dot':'offline-dot'}/><div><b>{connected?'WhatsApp ativo':'Desconectado'}</b><small>{connected?`${connected} sessão(ões)`:'Conectar conta'}</small></div></button></div></header>
      <div className="page-content">
        {view==='dashboard'&&<Dashboard accounts={accounts} campaigns={campaigns} go={setView}/>} 
        {view==='sender'&&<SenderPage mode="contact" accounts={accounts} campaigns={campaigns} reloadCampaigns={reloadCampaigns}/>} 
        {view==='groupSender'&&<SenderPage mode="group" accounts={accounts} campaigns={campaigns} reloadCampaigns={reloadCampaigns}/>} 
        {view==='scheduler'&&<SchedulerPage campaigns={campaigns}/>} 
        {view==='accounts'&&<AccountsPage accounts={accounts} reload={reloadAccounts}/>} 
        {view==='contacts'&&<ContactsPage/>} 
        {view==='numberFilter'&&<NumberFilterPage accounts={accounts}/>} 
        {view==='groups'&&<GroupsPage accounts={accounts}/>} 
        {view==='autoReply'&&<AutoReplyPage accounts={accounts}/>} 
        {view==='extractors'&&<ExtractorsPage/>}
        {view==='license'&&<LicensePage/>}
        {view==='settings'&&<SettingsPage accounts={accounts}/>} 
      </div>
    </main>
  </div>
}

function Dashboard({accounts,campaigns,go}:{accounts:any[];campaigns:any[];go:(view:View)=>void}){
  const online=accounts.filter(a=>a.status==='connected').length; const totalSent=campaigns.reduce((sum,c)=>sum+Number(c.sent??0),0); const totalFailed=campaigns.reduce((sum,c)=>sum+Number(c.failed??0),0); const active=campaigns.filter(c=>['running','paused','scheduled'].includes(c.status)); const rate=totalSent+totalFailed?Math.round(totalSent/(totalSent+totalFailed)*1000)/10:100;
  return <div className="page-stack"><section className="dashboard-hero"><div><span className="kicker">WASENDER DESKTOP</span><h2>Envie, filtre e organize sem complicação.</h2><p>As ferramentas principais do WASender reunidas em uma interface moderna e com sessões persistentes.</p><div className="hero-actions"><button className="button primary big" onClick={()=>go('sender')}><Send size={18}/> Novo envio</button><button className="button ghost big" onClick={()=>go('accounts')}><Wifi size={18}/> Gerenciar contas</button></div></div><div className="hero-visual"><div className="pulse-ring"><MessageSquareText size={31}/></div><span>{online?'Motor conectado':'Aguardando conexão'}</span><b>{online} / {accounts.length}</b><small>contas online</small></div></section>
    <section className="metric-grid"><Metric icon={Wifi} label="Contas online" value={`${online}/${accounts.length}`} sub="Sessões persistentes"/><Metric icon={Send} label="Enviadas" value={totalSent.toLocaleString('pt-BR')} sub="Todas as campanhas"/><Metric icon={Gauge} label="Taxa de sucesso" value={`${rate}%`} sub={`${totalFailed} falhas registradas`}/><Metric icon={Activity} label="Em andamento" value={String(active.length)} sub="Rodando, pausadas ou agendadas"/></section>
    <div className="dashboard-grid"><section className="card"><div className="card-head"><div><h3>Campanhas recentes</h3><p>Últimos envios criados</p></div><button className="text-button" onClick={()=>go('sender')}>Abrir sender →</button></div><div className="dash-campaigns">{campaigns.slice(0,6).map(c=><div key={c.id}><div className="grow"><b>{c.name}</b><span>{c.sent}/{c.total} enviados · {toLocalDateTime(c.created_at)}</span></div><div className="mini-progress"><i style={{width:`${campaignPercent(c)}%`}}/></div><span className={`status-chip ${c.status}`}>{c.status}</span></div>)}{!campaigns.length&&<Empty text="Crie sua primeira campanha no Contact Sender."/>}</div></section>
      <section className="card"><div className="card-head"><div><h3>Contas</h3><p>Status atual das sessões</p></div><button className="text-button" onClick={()=>go('accounts')}>Gerenciar →</button></div><div className="dash-accounts">{accounts.map(a=><div key={a.id}><span className={`wa-avatar ${a.status==='connected'?'online':''}`}><Wifi size={15}/></span><div className="grow"><b>{a.name}</b><small>{a.phone?`+${a.phone}`:'Sem número vinculado'}</small></div><span className={`status-chip ${a.status}`}>{a.status}</span></div>)}{!accounts.length&&<Empty text="Adicione uma conta para começar."/>}</div></section>
    </div>
    <section className="quick-tools"><button onClick={()=>go('numberFilter')}><FileSearch size={18}/><span><b>Number Filter</b><small>Validar números</small></span></button><button onClick={()=>go('groups')}><Users size={18}/><span><b>Group Tools</b><small>Membros e convites</small></span></button><button onClick={()=>go('autoReply')}><Bot size={18}/><span><b>Auto Reply</b><small>Respostas automáticas</small></span></button><button onClick={()=>go('contacts')}><Ban size={18}/><span><b>Listas</b><small>Block & Friendly</small></span></button></section>
  </div>
}

function Metric({icon:Icon,label,value,sub}:{icon:any;label:string;value:string;sub:string}){return <article className="metric-card"><div className="metric-icon"><Icon size={18}/></div><span>{label}</span><b>{value}</b><small>{sub}</small></article>}
function Empty({text}:{text:string}){return <div className="empty mini"><MessageSquareText size={23}/><p>{text}</p></div>}

function ExtractorsPage(){return <div className="page-stack"><div className="page-head"><div><span className="kicker">EXTRACTORS</span><h2>Extratores auxiliares</h2><p>Ferramentas externas do WASender ficam isoladas do motor de mensagens para não derrubar campanhas.</p></div></div><div className="extractor-grid"><ToolCard title="Google Maps Extractor" text="Empresas, telefone, site, categoria, coordenadas e links sociais."/><ToolCard title="Website Email / Mobile" text="Vasculha páginas públicas indicadas pelo usuário e coleta contatos encontrados."/><ToolCard title="Social Media Extractor" text="Organiza URLs e dados públicos de perfis informados."/><ToolCard title="Google Contacts CSV" text="Converte sua lista de números para CSV compatível com importação de contatos."/></div><div className="notice info">Esses extratores estão separados do Baileys. O motor de WhatsApp continua funcionando mesmo quando um scraper falha ou um site muda.</div></div>}
function ToolCard({title,text}:{title:string;text:string}){return <article className="card tool-card"><div className="tool-icon"><Wrench size={19}/></div><h3>{title}</h3><p>{text}</p><span className="status-chip planned">Reconstrução em andamento</span></article>}

function LicensePage(){return <div className="page-stack"><div className="page-head"><div><span className="kicker">LICENSING</span><h2>Licença do ATTOZAP</h2><p>Licenciamento assinado Ed25519, separado das sessões do WhatsApp.</p></div></div><div className="license-layout"><section className="card license-card"><div className="license-seal"><KeyRound size={28}/></div><span>STATUS LOCAL</span><h3>License Authority preparada</h3><p>A aplicação valida licenças assinadas sem carregar a chave privada no executável.</p><div className="license-features"><span><ShieldCheck size={15}/> Assinatura Ed25519</span><span><ShieldCheck size={15}/> Validade e expiração</span><span><ShieldCheck size={15}/> Fingerprint opcional</span><span><ShieldCheck size={15}/> Features e limite de contas</span></div></section><section className="card"><div className="card-head"><div><h3>Administração de licenças</h3><p>A autoridade fica fora do cliente.</p></div></div><p className="muted-copy">A ferramenta <code>tools/license-authority.ts</code> gera o par de chaves e emite licenças. A chave privada deve permanecer somente com você; o cliente recebe apenas a licença assinada.</p><div className="notice info">Na próxima etapa, esta tela será ligada ao armazenamento/ativação local e a um painel do proprietário, sem transformar o WASender em CRM.</div></section></div></div>}

function SettingsPage({accounts}:{accounts:any[]}){const [audit,setAudit]=useState<any[]>([]);useEffect(()=>{void window.attozap.audit.list().then(setAudit)},[]);return <div className="page-stack"><div className="page-head"><div><span className="kicker">SETTINGS</span><h2>Configurações & administração</h2><p>Ajustes locais, diagnóstico e auditoria do aplicativo.</p></div></div><div className="settings-grid"><section className="card"><div className="card-head"><div><h3>Diagnóstico</h3><p>Resumo do ambiente atual</p></div><Settings size={18}/></div><div className="diagnostic"><div><span>Contas cadastradas</span><b>{accounts.length}</b></div><div><span>Contas online</span><b>{accounts.filter(a=>a.status==='connected').length}</b></div><div><span>Banco</span><b>SQLite WAL</b></div><div><span>Motor</span><b>Baileys Provider</b></div></div></section><section className="card"><div className="card-head"><div><h3>Auditoria recente</h3><p>Últimas ações persistidas</p></div></div><div className="audit-list">{audit.slice(0,20).map(row=><div key={row.id}><span className="audit-dot"/><div><b>{row.action}</b><small>{row.entity_type} · {row.entity_id??'—'}</small></div><time>{toLocalDateTime(row.created_at)}</time></div>)}{!audit.length&&<Empty text="Nenhum evento registrado."/>}</div></section></div></div>}

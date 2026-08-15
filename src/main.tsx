import React, { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Activity, BadgeCheck, BarChart3, Bell, Bot, Boxes, ChevronDown, CircleUserRound,
  Command, CreditCard, Database, Gauge, KeyRound, LayoutDashboard, MessageSquareText,
  Moon, MoreHorizontal, Plus, Search, Send, Settings, ShieldCheck, Sparkles, Sun,
  Users, Wifi, Workflow, Zap
} from 'lucide-react';
import './styles.css';

type View = 'dashboard' | 'inbox' | 'campaigns' | 'automation' | 'contacts' | 'licenses' | 'admin' | 'settings';

type License = {
  id: string;
  customer: string;
  plan: 'Solo Pro' | 'Team Pro' | 'Enterprise';
  seats: number;
  instances: number;
  status: 'Ativa' | 'Expira em breve' | 'Suspensa';
  expires: string;
};

const nav = [
  ['dashboard', LayoutDashboard, 'Visão geral'],
  ['inbox', MessageSquareText, 'Inbox'],
  ['campaigns', Send, 'Campanhas'],
  ['automation', Workflow, 'Automações'],
  ['contacts', Users, 'Contatos'],
] as const;

const management = [
  ['licenses', KeyRound, 'Licenças'],
  ['admin', ShieldCheck, 'Administração'],
  ['settings', Settings, 'Configurações'],
] as const;

const licenses: License[] = [
  { id: 'AZ-92F4-81DA', customer: 'Nova Prime Imóveis', plan: 'Enterprise', seats: 24, instances: 40, status: 'Ativa', expires: '18/12/2026' },
  { id: 'AZ-72CE-114B', customer: 'Vitta Comercial', plan: 'Team Pro', seats: 8, instances: 12, status: 'Ativa', expires: '03/11/2026' },
  { id: 'AZ-19B8-3A7F', customer: 'Studio Connor', plan: 'Solo Pro', seats: 1, instances: 3, status: 'Expira em breve', expires: '28/08/2026' },
];

function App() {
  const [view, setView] = useState<View>('dashboard');
  const [dark, setDark] = useState(true);
  const [query, setQuery] = useState('');
  const [commandOpen, setCommandOpen] = useState(false);
  const title = useMemo(() => [...nav, ...management].find(([id]) => id === view)?.[2] ?? 'ATTOZAP', [view]);

  return <div className={dark ? 'app dark' : 'app light'}>
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark"><Zap size={19} fill="currentColor" /></div><div><strong>ATTOZAP</strong><span>2.0 PRO</span></div></div>
      <button className="workspace"><div className="workspace-avatar">NP</div><div><strong>Nova Prime</strong><span>Enterprise</span></div><ChevronDown size={16}/></button>
      <nav>
        <p className="nav-label">WORKSPACE</p>
        {nav.map(([id, Icon, label]) => <button key={id} onClick={() => setView(id)} className={view === id ? 'active' : ''}><Icon size={18}/><span>{label}</span>{id === 'inbox' && <b className="count">12</b>}</button>)}
        <p className="nav-label">GESTÃO</p>
        {management.map(([id, Icon, label]) => <button key={id} onClick={() => setView(id)} className={view === id ? 'active' : ''}><Icon size={18}/><span>{label}</span></button>)}
      </nav>
      <div className="sidebar-foot"><div className="usage-head"><span>Uso mensal</span><strong>68%</strong></div><div className="progress"><i style={{width:'68%'}}/></div><small>34.120 / 50.000 eventos</small></div>
    </aside>

    <main className="main">
      <header className="topbar">
        <div><span className="eyebrow">ATTO FLOW / NOVA PRIME</span><h1>{title}</h1></div>
        <div className="top-actions">
          <button className="search" onClick={() => setCommandOpen(true)}><Search size={17}/><span>Pesquisar...</span><kbd>⌘ K</kbd></button>
          <button className="icon-btn" onClick={() => setDark(v => !v)}>{dark ? <Sun size={17}/> : <Moon size={17}/>}</button>
          <button className="icon-btn notification"><Bell size={17}/><i/></button>
          <button className="profile"><div className="avatar">GC</div><div><strong>Gleyson Connor</strong><span>Super Admin</span></div><ChevronDown size={15}/></button>
        </div>
      </header>

      <section className="content">
        {view === 'dashboard' && <Dashboard />}
        {view === 'licenses' && <Licenses />}
        {view === 'admin' && <Admin />}
        {!['dashboard','licenses','admin'].includes(view) && <ModulePlaceholder name={title} />}
      </section>
    </main>

    {commandOpen && <div className="modal-backdrop" onMouseDown={() => setCommandOpen(false)}><div className="command" onMouseDown={e => e.stopPropagation()}><div className="command-input"><Search size={18}/><input autoFocus value={query} onChange={e=>setQuery(e.target.value)} placeholder="Buscar páginas, clientes, licenças, ações..."/><kbd>ESC</kbd></div><p>AÇÕES RÁPIDAS</p>{[['licenses',KeyRound,'Gerenciar licenças'],['admin',ShieldCheck,'Abrir administração'],['campaigns',Send,'Nova campanha']].filter(x=>x[2].toLowerCase().includes(query.toLowerCase())).map(([id,Icon,label]: any)=><button key={id} onClick={()=>{setView(id);setCommandOpen(false)}}><Icon size={18}/><span>{label}</span><Command size={14}/></button>)}</div></div>}
  </div>
}

function Dashboard(){
  return <>
    <div className="hero-row"><div><h2>Operação em tempo real</h2><p>Saúde do workspace, performance e canais em uma única visão.</p></div><div className="actions"><button className="secondary"><BarChart3 size={16}/> Relatórios</button><button className="primary"><Plus size={16}/> Nova campanha</button></div></div>
    <div className="metrics">
      <Metric icon={Wifi} label="Instâncias online" value="18 / 20" delta="+2 hoje" tone="success" />
      <Metric icon={Send} label="Mensagens hoje" value="8.492" delta="+18,4%" tone="success" />
      <Metric icon={Users} label="Novos contatos" value="327" delta="+9,1%" tone="success" />
      <Metric icon={Gauge} label="Taxa de entrega" value="97,8%" delta="+0,7%" tone="success" />
    </div>
    <div className="grid-two">
      <article className="panel chart-panel"><PanelHead title="Volume de mensagens" subtitle="Últimos 7 dias" action="Ver relatório"/><div className="chart"><div className="y"><span>12k</span><span>9k</span><span>6k</span><span>3k</span><span>0</span></div><div className="bars">{[48,62,57,78,66,91,74].map((h,i)=><div className="bar-col" key={i}><div className="bar" style={{height:`${h}%`}}/><span>{['SEG','TER','QUA','QUI','SEX','SÁB','DOM'][i]}</span></div>)}</div></div></article>
      <article className="panel"><PanelHead title="Saúde dos canais" subtitle="Monitoramento ao vivo" action="Gerenciar"/><div className="channel-list"><Channel name="Vendas Principal" phone="+55 11 98922-4401" state="Online" score={96}/><Channel name="Comercial 02" phone="+55 11 97120-1183" state="Online" score={91}/><Channel name="Pós-vendas" phone="+55 11 96328-5510" state="Atenção" score={72}/><Channel name="Captação" phone="+55 11 95409-2276" state="Online" score={94}/></div></article>
    </div>
    <div className="grid-bottom">
      <article className="panel"><PanelHead title="Atividade recente" subtitle="Eventos importantes do sistema" action="Auditoria"/><div className="activity"><ActivityItem icon={BadgeCheck} title="Campanha finalizada" text="Lançamento Jardins · 2.486 entregues" time="há 4 min"/><ActivityItem icon={CircleUserRound} title="Novo membro" text="Mariana Costa entrou no workspace" time="há 18 min"/><ActivityItem icon={KeyRound} title="Licença sincronizada" text="Enterprise · validade confirmada" time="há 1 h"/></div></article>
      <article className="panel ai-card"><div className="spark"><Sparkles size={18}/></div><span className="eyebrow">ATTO INTELLIGENCE</span><h3>3 oportunidades detectadas</h3><p>Há uma queda de resposta no canal Pós-vendas e duas campanhas com potencial de reengajamento.</p><button>Ver recomendações <span>→</span></button></article>
    </div>
  </>
}

function Licenses(){
  return <>
    <div className="hero-row"><div><h2>Central de licenças</h2><p>Emissão, limites, ativações, revogações e auditoria em um único lugar.</p></div><div className="actions"><button className="secondary"><Database size={16}/> Exportar</button><button className="primary"><Plus size={16}/> Emitir licença</button></div></div>
    <div className="metrics compact"><Metric icon={KeyRound} label="Licenças ativas" value="148" delta="+11 este mês" tone="success"/><Metric icon={Users} label="Assentos licenciados" value="1.284" delta="82% utilizados"/><Metric icon={Boxes} label="Instâncias autorizadas" value="2.410" delta="1.807 em uso"/><Metric icon={CreditCard} label="MRR licenciado" value="R$ 84,7k" delta="+12,8%" tone="success"/></div>
    <article className="panel table-panel"><div className="table-tools"><div className="table-search"><Search size={16}/><input placeholder="Buscar empresa, chave ou plano..."/></div><button className="secondary">Todos os status <ChevronDown size={14}/></button></div><table><thead><tr><th>CLIENTE / CHAVE</th><th>PLANO</th><th>ASSENTOS</th><th>INSTÂNCIAS</th><th>STATUS</th><th>VALIDADE</th><th></th></tr></thead><tbody>{licenses.map(l=><tr key={l.id}><td><strong>{l.customer}</strong><code>{l.id}</code></td><td><span className="plan-pill">{l.plan}</span></td><td>{l.seats}</td><td>{l.instances}</td><td><Status value={l.status}/></td><td>{l.expires}</td><td><button className="ghost"><MoreHorizontal size={17}/></button></td></tr>)}</tbody></table></article>
  </>
}

function Admin(){
  return <>
    <div className="hero-row"><div><h2>Control Center</h2><p>Administração global, tenants, infraestrutura, recursos e segurança.</p></div><div className="actions"><button className="secondary"><Activity size={16}/> Logs do sistema</button><button className="primary"><Plus size={16}/> Nova empresa</button></div></div>
    <div className="admin-grid">
      <AdminCard icon={Users} title="Empresas & usuários" text="Tenants, membros, papéis, convites e isolamento de workspace." meta="86 empresas · 1.428 usuários"/>
      <AdminCard icon={KeyRound} title="Licenças & planos" text="Features, quotas, ativações, expiração, fingerprint e revogação." meta="148 licenças ativas"/>
      <AdminCard icon={Boxes} title="Recursos dos planos" text="Feature flags e limites específicos por produto, empresa ou usuário." meta="24 recursos configuráveis"/>
      <AdminCard icon={Activity} title="Observabilidade" text="Eventos, filas, sessões, erros, auditoria e saúde dos serviços." meta="99,98% disponibilidade"/>
      <AdminCard icon={Bot} title="IA & integrações" text="Providers de IA, SMTP, webhooks, pagamentos e serviços externos." meta="7 integrações ativas"/>
      <AdminCard icon={ShieldCheck} title="Segurança" text="RBAC, sessões, políticas, trilhas de auditoria e dispositivos." meta="0 alertas críticos"/>
    </div>
    <article className="panel"><PanelHead title="Infraestrutura" subtitle="Serviços monitorados em tempo real" action="Detalhes"/><div className="service-grid"><Service name="Core API" value="Operacional" latency="38 ms"/><Service name="Realtime Gateway" value="Operacional" latency="21 ms"/><Service name="Queue Engine" value="Operacional" latency="6 jobs"/><Service name="License Authority" value="Operacional" latency="12 ms"/></div></article>
  </>
}

function ModulePlaceholder({name}:{name:string}){return <div className="placeholder"><div className="placeholder-icon"><Command size={28}/></div><span className="eyebrow">MÓDULO V2</span><h2>{name}</h2><p>O shell e a navegação deste módulo já estão preparados. A implementação funcional será conectada aos serviços do Core sem acoplamento à interface.</p><button className="primary">Abrir especificação</button></div>}
function Metric({icon:Icon,label,value,delta,tone}:{icon:any,label:string,value:string,delta:string,tone?:string}){return <article className="metric"><div className="metric-top"><span className="metric-icon"><Icon size={18}/></span><span className="mini-menu">•••</span></div><span>{label}</span><strong>{value}</strong><small className={tone}>{delta}</small></article>}
function PanelHead({title,subtitle,action}:{title:string,subtitle:string,action:string}){return <div className="panel-head"><div><h3>{title}</h3><p>{subtitle}</p></div><button>{action} <span>→</span></button></div>}
function Channel({name,phone,state,score}:{name:string,phone:string,state:string,score:number}){return <div className="channel"><div className="channel-avatar"><MessageSquareText size={17}/></div><div className="channel-info"><strong>{name}</strong><span>{phone}</span></div><div className="channel-score"><span className={state==='Online'?'dot online':'dot warning'}/><small>{state}</small><b>{score}</b></div></div>}
function ActivityItem({icon:Icon,title,text,time}:{icon:any,title:string,text:string,time:string}){return <div className="activity-item"><div className="activity-icon"><Icon size={16}/></div><div><strong>{title}</strong><span>{text}</span></div><time>{time}</time></div>}
function Status({value}:{value:License['status']}){return <span className={`status ${value==='Ativa'?'ok':value==='Suspensa'?'bad':'warn'}`}><i/>{value}</span>}
function AdminCard({icon:Icon,title,text,meta}:{icon:any,title:string,text:string,meta:string}){return <article className="admin-card"><div className="admin-icon"><Icon size={20}/></div><h3>{title}</h3><p>{text}</p><div><span>{meta}</span><button>Configurar →</button></div></article>}
function Service({name,value,latency}:{name:string,value:string,latency:string}){return <div className="service"><div><span className="dot online"/><strong>{name}</strong></div><span>{value}</span><code>{latency}</code></div>}

createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);

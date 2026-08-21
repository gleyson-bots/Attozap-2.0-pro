import { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Activity, ArrowLeft, BadgeCheck, Bell, Check, ChevronRight, CircleDollarSign, Clipboard,
  CreditCard, Download, Fingerprint, Gauge, KeyRound, Layers3, LockKeyhole, LogOut, Mail,
  Menu, PackageOpen, Plus, RefreshCw, Save, Search, Settings, ShieldCheck, Sparkles,
  User, UserRoundCog, Users, X, Zap
} from 'lucide-react';
import './portal.css';

async function api(url, options = {}) {
  const response = await fetch(url, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Erro ${response.status}`);
  return data;
}

function money(cents) {
  if (cents == null) return 'Sob consulta';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(cents) / 100);
}

function date(value) {
  if (!value) return '—';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toLocaleString('pt-BR', { dateStyle: 'medium', timeStyle: 'short' });
}

function copy(value) {
  return navigator.clipboard?.writeText(String(value || ''));
}

function Brand() {
  return <a className="portal-brand" href="/"><span className="portal-brand-orb"><img src="/logo.svg" alt="ATTOZAP"/></span><span><b>ATTOZAP</b><small>CLIENT PORTAL</small></span></a>;
}

function Spinner({ label = 'Carregando…' }) {
  return <div className="portal-loading"><span/><p>{label}</p></div>;
}

function Notice({ type = 'info', children, onClose }) {
  return <div className={`portal-notice ${type}`}><span>{children}</span>{onClose && <button onClick={onClose}><X size={15}/></button>}</div>;
}

function AuthScreen({ initialMode = 'login' }) {
  const [mode, setMode] = useState(initialMode);
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event) {
    event.preventDefault();
    setBusy(true); setError('');
    try {
      await api('/api/auth', { method: 'POST', body: JSON.stringify({ action: mode, ...form }) });
      const next = new URLSearchParams(location.search).get('next');
      location.href = next && next.startsWith('/') ? next : '/portal';
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  return <div className="auth-page">
    <div className="auth-ambient one"/><div className="auth-ambient two"/>
    <header className="auth-top"><Brand/><a href="/"><ArrowLeft size={15}/> Voltar à landing</a></header>
    <main className="auth-layout">
      <section className="auth-pitch">
        <div className="portal-eyebrow"><Sparkles size={13}/> Portal oficial ATTOZAP</div>
        <h1>Seu plano, suas licenças e suas atualizações. <span>Em um só lugar.</span></h1>
        <p>Contrate, acompanhe cobrança, copie chaves de ativação e receba novas versões do WASender Pro sem depender de atendimento manual.</p>
        <div className="auth-benefits">
          <span><ShieldCheck/> Licenças Ed25519</span><span><CreditCard/> Gestão de assinatura</span><span><Bell/> Atualizações centralizadas</span><span><Fingerprint/> Dispositivos e fingerprints</span>
        </div>
      </section>
      <section className="auth-card">
        <div className="auth-tabs"><button className={mode==='login'?'active':''} onClick={() => setMode('login')}>Entrar</button><button className={mode==='register'?'active':''} onClick={() => setMode('register')}>Criar conta</button></div>
        <div className="auth-card-head"><span className="auth-icon"><LockKeyhole/></span><div><small>ACESSO SEGURO</small><h2>{mode === 'login' ? 'Entre no seu portal' : 'Comece pelo portal'}</h2></div></div>
        {error && <Notice type="error" onClose={() => setError('')}>{error}</Notice>}
        <form onSubmit={submit} className="auth-form">
          {mode === 'register' && <label><span>Nome completo</span><input autoComplete="name" value={form.name} onChange={e => setForm(v => ({...v,name:e.target.value}))} placeholder="Seu nome" required/></label>}
          <label><span>E-mail</span><input type="email" autoComplete="email" value={form.email} onChange={e => setForm(v => ({...v,email:e.target.value}))} placeholder="voce@empresa.com" required/></label>
          <label><span>Senha</span><input type="password" autoComplete={mode==='login'?'current-password':'new-password'} value={form.password} onChange={e => setForm(v => ({...v,password:e.target.value}))} placeholder="Mínimo 8 caracteres" minLength={8} required/></label>
          <button className="portal-button primary wide" disabled={busy}>{busy ? <RefreshCw className="spin"/> : <ChevronRight/>}{mode === 'login' ? 'Entrar no portal' : 'Criar minha conta'}</button>
        </form>
        <p className="auth-terms">Ao continuar, você concorda com os Termos de Uso, Licença e Política de Privacidade do ATTOZAP.</p>
      </section>
    </main>
  </div>;
}

const customerNav = [
  ['overview','Visão geral',Gauge],['plans','Planos',Layers3],['licenses','Licenças',KeyRound],['billing','Cobrança',CreditCard],['updates','Atualizações',PackageOpen],['account','Minha conta',User],
];
const adminNav = [
  ['overview','Resumo',Gauge],['users','Usuários',Users],['plans','Planos',Layers3],['licenses','Licenças',KeyRound],['updates','Atualizações',PackageOpen],['audit','Auditoria',Activity],
];

function Shell({ user, admin = false, active, setActive, children, onLogout }) {
  const [mobile, setMobile] = useState(false);
  const nav = admin ? adminNav : customerNav;
  return <div className="portal-app">
    <aside className={`portal-sidebar ${mobile ? 'open' : ''}`}>
      <div className="side-top"><Brand/><button className="side-close" onClick={() => setMobile(false)}><X/></button></div>
      <div className="side-context"><span className={admin?'admin':'customer'}>{admin ? <ShieldCheck/> : <BadgeCheck/>}</span><div><small>{admin?'PAINEL ADMINISTRATIVO':'ÁREA DO CLIENTE'}</small><b>{user.name}</b><em>{user.email}</em></div></div>
      <nav>{nav.map(([id,label,Icon]) => <button key={id} className={active===id?'active':''} onClick={() => { setActive(id); setMobile(false); }}><Icon/><span>{label}</span><ChevronRight className="nav-chevron"/></button>)}</nav>
      {user.role === 'admin' && !admin && <a className="admin-switch" href="/admin"><UserRoundCog/> Abrir painel admin</a>}
      {!admin && <a className="admin-switch" href="/"><ArrowLeft/> Voltar à landing</a>}
      <button className="logout" onClick={onLogout}><LogOut/> Sair</button>
    </aside>
    {mobile && <button className="portal-overlay" onClick={() => setMobile(false)}/>}
    <main className="portal-main">
      <header className="portal-header"><button className="menu-toggle" onClick={() => setMobile(true)}><Menu/></button><div><small>{admin?'ATTOZAP CONTROL CENTER':'ATTOZAP CLIENT PORTAL'}</small><h1>{nav.find(([id]) => id === active)?.[1]}</h1></div><div className="header-user"><span>{user.name?.slice(0,1)?.toUpperCase()}</span><div><b>{user.name}</b><small>{user.role === 'admin' ? 'Administrador' : 'Cliente'}</small></div></div></header>
      <div className="portal-content">{children}</div>
    </main>
  </div>;
}

function Metric({ icon: Icon, label, value, hint, tone='' }) {
  return <article className={`portal-metric ${tone}`}><span className="metric-icon"><Icon/></span><div><small>{label}</small><b>{value}</b><p>{hint}</p></div></article>;
}

function PlanCard({ plan, current, busy, onBuy }) {
  return <article className={`portal-plan ${plan.featured ? 'featured' : ''} ${current ? 'current' : ''}`}>
    {plan.featured && <span className="featured-badge"><Sparkles/> Mais escolhido</span>}
    <div className="plan-title"><span><Layers3/></span><div><small>{plan.maxInstances} CANAIS</small><h3>{plan.name}</h3></div></div>
    <p>{plan.description}</p>
    <div className="portal-price"><strong>{money(plan.priceCents)}</strong>{plan.priceCents != null && <small>/mês</small>}</div>
    <div className="plan-quota"><span><Users/> {plan.maxSeats} {plan.maxSeats === 1 ? 'usuário' : 'usuários'}</span><span><Zap/> {plan.maxInstances} instâncias</span></div>
    <div className="plan-list">{plan.features.map(item => <span key={item}><Check/> {item}</span>)}</div>
    {current ? <button className="portal-button subtle wide" disabled><BadgeCheck/> Plano atual</button> : plan.slug === 'enterprise' ? <a className="portal-button subtle wide" href="mailto:vendas@attozap.com.br"><Mail/> Falar com comercial</a> : <button className="portal-button primary wide" disabled={busy || !plan.stripeConfigured} onClick={() => onBuy(plan)}><CreditCard/> {plan.stripeConfigured ? 'Contratar / mudar plano' : 'Aguardando Stripe'}</button>}
  </article>;
}

function CustomerPortal({ user, onLogout }) {
  const [active, setActive] = useState('overview');
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  async function load() {
    setError('');
    try { setData(await api('/api/customer')); } catch (e) { setError(e.message); }
  }
  useEffect(() => { void load(); }, []);
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('checkout') === 'success') { setNotice('Pagamento recebido. A assinatura e a licença serão sincronizadas pelo Stripe em instantes.'); history.replaceState({}, '', '/portal'); }
  }, []);

  async function buy(plan) {
    setBusy(plan.id); setError('');
    try { const result = await api('/api/customer', { method:'POST', body:JSON.stringify({action:'checkout',planId:plan.id}) }); location.href = result.url; }
    catch (e) { setError(e.message); setBusy(''); }
  }
  async function billingPortal() {
    setBusy('billing');
    try { const result = await api('/api/customer', { method:'POST', body:JSON.stringify({action:'billingPortal'}) }); location.href = result.url; }
    catch (e) { setError(e.message); setBusy(''); }
  }
  async function requestReset(licenseId) {
    setBusy(licenseId);
    try { const result = await api('/api/customer', { method:'POST', body:JSON.stringify({action:'requestLicenseReset',licenseId,reason:'Solicitação pelo portal'}) }); setNotice(result.message); }
    catch (e) { setError(e.message); }
    finally { setBusy(''); }
  }

  if (!data) return <Shell user={user} active={active} setActive={setActive} onLogout={onLogout}>{error ? <Notice type="error">{error}</Notice> : <Spinner label="Sincronizando seu portal…"/>}</Shell>;
  const activeSub = data.subscriptions.find(item => ['active','trialing'].includes(item.status));
  const activeLicense = data.licenses.find(item => item.status === 'active');
  const latest = data.releases[0];

  return <Shell user={user} active={active} setActive={setActive} onLogout={onLogout}>
    {notice && <Notice type="success" onClose={() => setNotice('')}>{notice}</Notice>}{error && <Notice type="error" onClose={() => setError('')}>{error}</Notice>}
    {active === 'overview' && <>
      <section className="portal-hero-card"><div><div className="portal-eyebrow"><Sparkles/> Seu workspace comercial</div><h2>Olá, {user.name?.split(' ')[0]}. <span>{activeSub ? `Seu ${activeSub.plan.name} está ativo.` : 'Escolha seu plano para começar.'}</span></h2><p>Licenças, cobrança, atualizações e downloads sincronizados no mesmo portal.</p><div className="hero-card-actions">{latest && <a className="portal-button primary" href={latest.downloadUrl} target="_blank" rel="noreferrer"><Download/> Baixar {latest.version}</a>}<button className="portal-button subtle" onClick={() => setActive('plans')}><Layers3/> Ver planos</button></div></div><div className="portal-orbit"><img src="/logo.svg"/><i/><i/><span/></div></section>
      <div className="portal-metrics"><Metric icon={Layers3} label="PLANO" value={activeSub?.plan.name || 'Sem plano'} hint={activeSub ? `Até ${activeSub.plan.maxInstances} instâncias` : 'Contrate pelo portal'} tone="green"/><Metric icon={KeyRound} label="LICENÇAS ATIVAS" value={String(data.licenses.filter(x=>x.status==='active').length)} hint={activeLicense ? 'Pronta para ativação' : 'Nenhuma emitida'}/><Metric icon={CreditCard} label="ASSINATURA" value={activeSub?.status || 'inativa'} hint={activeSub?.currentPeriodEnd ? `Renova até ${date(activeSub.currentPeriodEnd)}` : 'Sem cobrança recorrente'}/><Metric icon={PackageOpen} label="VERSÃO" value={latest?.version || '—'} hint={latest ? `Canal ${latest.channel}` : 'Nenhuma atualização publicada'}/></div>
      <div className="portal-grid two"><section className="portal-panel"><div className="panel-head"><div><small>LICENÇA PRINCIPAL</small><h3>Ativação do WASender Pro</h3></div><KeyRound/></div>{activeLicense ? <><div className="license-preview"><span>{activeLicense.key.slice(0,42)}…</span><button onClick={() => copy(activeLicense.key)}><Clipboard/> Copiar chave</button></div><div className="detail-grid"><span><small>PLANO</small><b>{activeLicense.planName}</b></span><span><small>STATUS</small><b className="success-text">{activeLicense.status}</b></span><span><small>INSTÂNCIAS</small><b>{activeLicense.maxInstances}</b></span><span><small>FINGERPRINT</small><b>{activeLicense.fingerprint ? `${activeLicense.fingerprint.slice(0,12)}…` : 'Livre'}</b></span></div></> : <div className="empty-state"><KeyRound/><h4>Nenhuma licença ativa</h4><p>Ao contratar um plano, sua licença aparecerá aqui automaticamente.</p></div>}</section><section className="portal-panel"><div className="panel-head"><div><small>ÚLTIMA VERSÃO</small><h3>{latest?.version || 'Sem release'}</h3></div><PackageOpen/></div>{latest ? <><p>{latest.notes || 'Nova versão publicada pelo painel ATTOZAP.'}</p><div className="release-tags"><span>{latest.channel}</span>{latest.mandatory && <span className="danger">Atualização importante</span>}</div><a className="portal-button primary wide" href={latest.downloadUrl} target="_blank" rel="noreferrer"><Download/> Baixar versão</a></> : <div className="empty-state"><PackageOpen/><p>Aguarde a próxima versão publicada pelo administrador.</p></div>}</section></div>
    </>}
    {active === 'plans' && <><div className="section-title"><div><small>ASSINATURA</small><h2>Planos que crescem com sua operação</h2><p>A compra abre o Checkout seguro do Stripe e a licença é emitida após confirmação.</p></div></div><div className="portal-plan-grid">{data.plans.map(plan => <PlanCard key={plan.id} plan={plan} current={activeSub?.plan?.id===plan.id} busy={Boolean(busy)} onBuy={buy}/>)}</div></>}
    {active === 'licenses' && <><div className="section-title"><div><small>ATIVAÇÕES</small><h2>Suas licenças</h2><p>Copie a chave, acompanhe o dispositivo e solicite redefinição quando trocar de máquina.</p></div></div><div className="portal-table-card"><table><thead><tr><th>Plano</th><th>Status</th><th>Emitida</th><th>Fingerprint</th><th>Limites</th><th>Ações</th></tr></thead><tbody>{data.licenses.map(item => <tr key={item.id}><td><b>{item.planName}</b><small>{item.id.slice(0,8)}</small></td><td><span className={`status-pill ${item.status}`}>{item.status}</span></td><td>{date(item.issuedAt)}</td><td className="mono">{item.fingerprint ? `${item.fingerprint.slice(0,16)}…` : 'Livre'}</td><td>{item.maxInstances} inst. · {item.maxSeats} seats</td><td><div className="table-actions"><button onClick={() => copy(item.key)}><Clipboard/> Copiar</button><button disabled={busy===item.id || item.status!=='active'} onClick={() => requestReset(item.id)}><RefreshCw/> Reset</button></div></td></tr>)}</tbody></table>{!data.licenses.length && <div className="empty-state"><KeyRound/><h4>Você ainda não possui licenças</h4></div>}</div></>}
    {active === 'billing' && <><div className="section-title"><div><small>COBRANÇA</small><h2>Assinatura e pagamentos</h2><p>Cartão, faturas, cancelamento e alterações financeiras são geridos com segurança pelo Stripe.</p></div><button className="portal-button primary" disabled={busy==='billing'} onClick={billingPortal}><CreditCard/> Abrir portal de cobrança</button></div><div className="portal-panel"><div className="panel-head"><div><small>ASSINATURAS</small><h3>Histórico do plano</h3></div><CircleDollarSign/></div><div className="subscription-list">{data.subscriptions.map(item => <article key={item.id}><span className={`status-dot ${item.status}`}/><div><b>{item.plan.name}</b><small>{item.status} · {item.currentPeriodEnd ? `período até ${date(item.currentPeriodEnd)}` : 'sem período informado'}</small></div><strong>{money(item.plan.priceCents)}</strong></article>)}</div></div></>}
    {active === 'updates' && <><div className="section-title"><div><small>RELEASE CENTER</small><h2>Atualizações publicadas</h2><p>Notas de versão e downloads oficiais controlados pelo painel administrativo.</p></div></div><div className="release-list">{data.releases.map(item => <article key={item.id}><span className="release-icon"><PackageOpen/></span><div><small>{item.channel.toUpperCase()} · {date(item.publishedAt)}</small><h3>{item.version}</h3><p>{item.notes || 'Sem notas desta versão.'}</p></div><div className="release-side">{item.mandatory && <span className="status-pill failed">Importante</span>}<a className="portal-button subtle" href={item.downloadUrl} target="_blank" rel="noreferrer"><Download/> Baixar</a></div></article>)}</div></>}
    {active === 'account' && <><div className="section-title"><div><small>PERFIL</small><h2>Minha conta</h2></div></div><div className="portal-grid two"><section className="portal-panel"><div className="panel-head"><div><small>DADOS</small><h3>{user.name}</h3></div><User/></div><div className="detail-stack"><span><small>E-MAIL</small><b>{user.email}</b></span><span><small>TIPO DE CONTA</small><b>{user.role}</b></span><span><small>CRIADA EM</small><b>{date(user.createdAt)}</b></span></div></section><section className="portal-panel"><div className="panel-head"><div><small>SEGURANÇA</small><h3>Sessão protegida</h3></div><ShieldCheck/></div><p>Seu login usa cookie HttpOnly, SameSite e sessão assinada no backend. Senhas são armazenadas com hash forte.</p><button className="portal-button danger" onClick={onLogout}><LogOut/> Encerrar sessão</button></section></div></>}
  </Shell>;
}

function AdminPortal({ user, onLogout }) {
  const [active,setActive] = useState('overview');
  const [data,setData] = useState(null);
  const [error,setError] = useState('');
  const [notice,setNotice] = useState('');
  const [busy,setBusy] = useState(false);
  const [planForm,setPlanForm] = useState({id:'',slug:'',name:'',description:'',priceCents:0,licensePlan:'solo_plus',maxSeats:1,maxInstances:2,features:'',stripePriceId:'',active:true,featured:false,sortOrder:50});
  const [licenseForm,setLicenseForm] = useState({userId:'',planId:'',expiresAt:'',fingerprint:''});
  const [releaseForm,setReleaseForm] = useState({id:'',version:'',channel:'stable',downloadUrl:'',notes:'',mandatory:false,active:true,notify:true});

  async function load() { try { setData(await api('/api/admin')); setError(''); } catch(e) { setError(e.message); } }
  useEffect(() => { void load(); }, []);
  async function action(payload, success='Alteração salva.') { setBusy(true); setError(''); try { await api('/api/admin',{method:'POST',body:JSON.stringify(payload)}); setNotice(success); await load(); } catch(e) { setError(e.message); } finally { setBusy(false); } }

  if (!data) return <Shell user={user} admin active={active} setActive={setActive} onLogout={onLogout}>{error?<Notice type="error">{error}</Notice>:<Spinner label="Carregando Control Center…"/>}</Shell>;
  const activeUsers = data.users.filter(x=>x.status==='active').length;
  const activeLicenses = data.licenses.filter(x=>x.status==='active').length;
  const activeSubs = data.subscriptions.filter(x=>['active','trialing'].includes(x.status)).length;

  return <Shell user={user} admin active={active} setActive={setActive} onLogout={onLogout}>
    {notice && <Notice type="success" onClose={()=>setNotice('')}>{notice}</Notice>}{error && <Notice type="error" onClose={()=>setError('')}>{error}</Notice>}
    {active==='overview' && <><section className="portal-hero-card admin-hero"><div><div className="portal-eyebrow"><ShieldCheck/> Control Center</div><h2>Operação comercial <span>sob controle.</span></h2><p>Usuários, assinaturas, licenças, planos e releases com trilha de auditoria.</p></div><div className="portal-orbit"><img src="/logo.svg"/><i/><i/><span/></div></section><div className="portal-metrics"><Metric icon={Users} label="USUÁRIOS ATIVOS" value={String(activeUsers)} hint={`${data.users.length} cadastrados`} tone="green"/><Metric icon={CreditCard} label="ASSINATURAS" value={String(activeSubs)} hint={`${data.subscriptions.length} registros`}/><Metric icon={KeyRound} label="LICENÇAS ATIVAS" value={String(activeLicenses)} hint={`${data.licenses.length} emitidas`}/><Metric icon={PackageOpen} label="RELEASES" value={String(data.releases.length)} hint={data.releases[0]?.version || 'Nenhuma publicada'}/></div><div className="portal-grid two"><section className="portal-panel"><div className="panel-head"><div><small>ÚLTIMOS USUÁRIOS</small><h3>Cadastros recentes</h3></div><Users/></div><div className="mini-list">{data.users.slice(0,6).map(item=><article key={item.id}><span>{item.name.slice(0,1).toUpperCase()}</span><div><b>{item.name}</b><small>{item.email}</small></div><em className={`status-pill ${item.status==='active'?'active':'failed'}`}>{item.status}</em></article>)}</div></section><section className="portal-panel"><div className="panel-head"><div><small>ATIVIDADE</small><h3>Auditoria recente</h3></div><Activity/></div><div className="audit-mini">{data.audit.slice(0,7).map(item=><article key={item.id}><i/><div><b>{item.action}</b><small>{item.userName || 'Sistema'} · {date(item.createdAt)}</small></div></article>)}</div></section></div></>}
    {active==='users' && <><div className="section-title"><div><small>ACESSOS</small><h2>Usuários do portal</h2><p>Bloqueie contas ou promova operadores administrativos.</p></div></div><div className="portal-table-card"><table><thead><tr><th>Usuário</th><th>Perfil</th><th>Status</th><th>Criado</th><th>Ações</th></tr></thead><tbody>{data.users.map(item=><tr key={item.id}><td><b>{item.name}</b><small>{item.email}</small></td><td>{item.role}</td><td><span className={`status-pill ${item.status==='active'?'active':'failed'}`}>{item.status}</span></td><td>{date(item.createdAt)}</td><td><div className="table-actions"><button disabled={busy} onClick={()=>action({action:'updateUser',id:item.id,role:item.role,status:item.status==='active'?'blocked':'active'})}>{item.status==='active'?'Bloquear':'Ativar'}</button><button disabled={busy} onClick={()=>action({action:'updateUser',id:item.id,status:item.status,role:item.role==='admin'?'customer':'admin'})}>{item.role==='admin'?'Remover admin':'Tornar admin'}</button></div></td></tr>)}</tbody></table></div></>}
    {active==='plans' && <><div className="section-title"><div><small>CATÁLOGO</small><h2>Planos comerciais</h2><p>Preço, limites, features e Price ID do Stripe.</p></div></div><div className="admin-form-card"><h3><Plus/> Criar / editar plano</h3><div className="admin-form-grid"><label><span>ID (vazio = novo)</span><input value={planForm.id} onChange={e=>setPlanForm(v=>({...v,id:e.target.value}))}/></label><label><span>Slug</span><input value={planForm.slug} onChange={e=>setPlanForm(v=>({...v,slug:e.target.value}))}/></label><label><span>Nome</span><input value={planForm.name} onChange={e=>setPlanForm(v=>({...v,name:e.target.value}))}/></label><label><span>Preço em centavos</span><input type="number" value={planForm.priceCents} onChange={e=>setPlanForm(v=>({...v,priceCents:Number(e.target.value)}))}/></label><label><span>Plano da licença</span><select value={planForm.licensePlan} onChange={e=>setPlanForm(v=>({...v,licensePlan:e.target.value}))}>{['solo','solo_plus','solo_pro','team','team_plus','team_pro','enterprise'].map(x=><option key={x}>{x}</option>)}</select></label><label><span>Stripe Price ID</span><input value={planForm.stripePriceId} onChange={e=>setPlanForm(v=>({...v,stripePriceId:e.target.value}))} placeholder="price_..."/></label><label><span>Max seats</span><input type="number" value={planForm.maxSeats} onChange={e=>setPlanForm(v=>({...v,maxSeats:Number(e.target.value)}))}/></label><label><span>Max instâncias</span><input type="number" value={planForm.maxInstances} onChange={e=>setPlanForm(v=>({...v,maxInstances:Number(e.target.value)}))}/></label><label className="span-2"><span>Descrição</span><input value={planForm.description} onChange={e=>setPlanForm(v=>({...v,description:e.target.value}))}/></label><label className="span-2"><span>Features — uma por linha</span><textarea value={planForm.features} onChange={e=>setPlanForm(v=>({...v,features:e.target.value}))}/></label></div><button className="portal-button primary" disabled={busy} onClick={()=>action({action:'savePlan',...planForm,features:planForm.features.split(/\n/).map(x=>x.trim()).filter(Boolean)})}><Save/> Salvar plano</button></div><div className="portal-plan-grid compact">{data.plans.map(plan=><article className="portal-plan" key={plan.id}><div className="plan-title"><span><Layers3/></span><div><small>{plan.licensePlan}</small><h3>{plan.name}</h3></div></div><p>{plan.description}</p><b className="admin-price">{money(plan.priceCents)}</b><small>{plan.maxSeats} seats · {plan.maxInstances} instâncias · Stripe {plan.stripeConfigured?'OK':'pendente'}</small><button className="portal-button subtle wide" onClick={()=>setPlanForm({id:plan.id,slug:plan.slug,name:plan.name,description:plan.description||'',priceCents:plan.priceCents||0,licensePlan:plan.licensePlan,maxSeats:plan.maxSeats,maxInstances:plan.maxInstances,features:plan.features.join('\n'),stripePriceId:'',active:plan.active,featured:plan.featured,sortOrder:plan.sortOrder||0})}>Editar</button></article>)}</div></>}
    {active==='licenses' && <><div className="section-title"><div><small>LICENCIAMENTO</small><h2>Emitir e gerenciar licenças</h2><p>As chaves seguem o mesmo payload Ed25519 validado pelo desktop.</p></div></div><div className="admin-form-card"><h3><KeyRound/> Nova licença manual</h3><div className="admin-form-grid"><label><span>Usuário</span><select value={licenseForm.userId} onChange={e=>setLicenseForm(v=>({...v,userId:e.target.value}))}><option value="">Selecione…</option>{data.users.map(x=><option key={x.id} value={x.id}>{x.name} · {x.email}</option>)}</select></label><label><span>Plano</span><select value={licenseForm.planId} onChange={e=>setLicenseForm(v=>({...v,planId:e.target.value}))}><option value="">Selecione…</option>{data.plans.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label><label><span>Expira em (opcional)</span><input type="datetime-local" value={licenseForm.expiresAt} onChange={e=>setLicenseForm(v=>({...v,expiresAt:e.target.value}))}/></label><label><span>Fingerprint (opcional)</span><input value={licenseForm.fingerprint} onChange={e=>setLicenseForm(v=>({...v,fingerprint:e.target.value}))}/></label></div><button className="portal-button primary" disabled={busy||!licenseForm.userId||!licenseForm.planId} onClick={()=>action({action:'issueLicense',...licenseForm,expiresAt:licenseForm.expiresAt?new Date(licenseForm.expiresAt).toISOString():null},'Licença emitida e e-mail disparado.')}><KeyRound/> Emitir licença</button></div><div className="portal-table-card"><table><thead><tr><th>Cliente</th><th>Plano</th><th>Status</th><th>Fingerprint</th><th>Emitida</th><th>Ações</th></tr></thead><tbody>{data.licenses.map(item=><tr key={item.id}><td><b>{item.userName}</b><small>{item.userEmail}</small></td><td>{item.planName}</td><td><span className={`status-pill ${item.status}`}>{item.status}</span></td><td className="mono">{item.fingerprint?`${item.fingerprint.slice(0,14)}…`:'Livre'}</td><td>{date(item.issuedAt)}</td><td><div className="table-actions"><button onClick={()=>copy(item.key)}><Clipboard/> Chave</button><button disabled={busy} onClick={()=>action({action:'resetFingerprint',id:item.id})}>Reset FP</button><button disabled={busy||item.status!=='active'} onClick={()=>action({action:'revokeLicense',id:item.id})}>Revogar</button></div></td></tr>)}</tbody></table></div></>}
    {active==='updates' && <><div className="section-title"><div><small>RELEASE CENTER</small><h2>Publicar atualizações</h2><p>Controle versão, canal, download e notificação por e-mail.</p></div></div><div className="admin-form-card"><h3><PackageOpen/> Nova atualização</h3><div className="admin-form-grid"><label><span>Versão</span><input value={releaseForm.version} onChange={e=>setReleaseForm(v=>({...v,version:e.target.value}))} placeholder="v2.0.0-rc.10"/></label><label><span>Canal</span><select value={releaseForm.channel} onChange={e=>setReleaseForm(v=>({...v,channel:e.target.value}))}><option>stable</option><option>beta</option><option>rc</option></select></label><label className="span-2"><span>URL do .exe</span><input value={releaseForm.downloadUrl} onChange={e=>setReleaseForm(v=>({...v,downloadUrl:e.target.value}))} placeholder="https://github.com/.../ATTOZAP.exe"/></label><label className="span-2"><span>Notas</span><textarea value={releaseForm.notes} onChange={e=>setReleaseForm(v=>({...v,notes:e.target.value}))}/></label></div><div className="toggle-row"><label><input type="checkbox" checked={releaseForm.mandatory} onChange={e=>setReleaseForm(v=>({...v,mandatory:e.target.checked}))}/> Atualização importante</label><label><input type="checkbox" checked={releaseForm.notify} onChange={e=>setReleaseForm(v=>({...v,notify:e.target.checked}))}/> Notificar clientes por Resend</label></div><button className="portal-button primary" disabled={busy||!releaseForm.version||!releaseForm.downloadUrl} onClick={()=>action({action:'saveRelease',...releaseForm},'Atualização publicada.')}><PackageOpen/> Publicar release</button></div><div className="release-list admin">{data.releases.map(item=><article key={item.id}><span className="release-icon"><PackageOpen/></span><div><small>{item.channel.toUpperCase()} · {date(item.publishedAt)}</small><h3>{item.version}</h3><p>{item.notes||'Sem notas.'}</p></div><div className="release-side"><span className={`status-pill ${item.active?'active':'failed'}`}>{item.active?'publicada':'oculta'}</span><button className="portal-button subtle" onClick={()=>action({action:'toggleRelease',id:item.id,active:!item.active})}>{item.active?'Ocultar':'Publicar'}</button></div></article>)}</div></>}
    {active==='audit' && <><div className="section-title"><div><small>SEGURANÇA</small><h2>Trilha de auditoria</h2><p>Últimas ações administrativas e do cliente registradas no Turso.</p></div></div><div className="portal-table-card"><table><thead><tr><th>Quando</th><th>Usuário</th><th>Ação</th><th>Entidade</th></tr></thead><tbody>{data.audit.map(item=><tr key={item.id}><td>{date(item.createdAt)}</td><td>{item.userName||'Sistema'}</td><td className="mono">{item.action}</td><td>{item.entityType||'—'} {item.entityId?`· ${String(item.entityId).slice(0,12)}`:''}</td></tr>)}</tbody></table></div></>}
  </Shell>;
}

function PortalApp() {
  const [session,setSession] = useState({loading:true,user:null});
  const pathname = location.pathname.replace(/\/+$/, '') || '/';
  useEffect(() => { api('/api/auth').then(data=>setSession({loading:false,user:data.user})).catch(()=>setSession({loading:false,user:null})); }, []);
  async function logout() { try { await api('/api/auth',{method:'POST',body:JSON.stringify({action:'logout'})}); } finally { location.href='/login'; } }
  if (pathname === '/login') return <AuthScreen initialMode="login"/>;
  if (pathname === '/cadastro') return <AuthScreen initialMode="register"/>;
  if (session.loading) return <div className="portal-boot"><Brand/><Spinner label="Abrindo portal seguro…"/></div>;
  if (!session.user) { location.replace(`/login?next=${encodeURIComponent(pathname)}`); return null; }
  if (pathname === '/admin') {
    if (session.user.role !== 'admin') return <div className="portal-boot"><Brand/><Notice type="error">Você não possui acesso administrativo.</Notice><a className="portal-button primary" href="/portal">Voltar ao portal</a></div>;
    return <AdminPortal user={session.user} onLogout={logout}/>;
  }
  return <CustomerPortal user={session.user} onLogout={logout}/>;
}

createRoot(document.getElementById('root')).render(<PortalApp/>);

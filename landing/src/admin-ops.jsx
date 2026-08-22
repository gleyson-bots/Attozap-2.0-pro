import { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Activity, ArrowLeft, BadgeCheck, Bell, CheckCircle2, CreditCard, Gift, KeyRound, RefreshCw, Send, ServerCog, ShieldCheck, Users } from 'lucide-react';

async function api(method='GET', body) {
  const response = await fetch('/api/admin-ops', { method, credentials:'include', headers:{'Content-Type':'application/json'}, ...(body?{body:JSON.stringify(body)}:{}) });
  const data = await response.json().catch(()=>({}));
  if (response.status===401) { location.href='/login?next=%2Fadmin%2Foperacoes'; return null; }
  if (!response.ok) throw new Error(data.error || `Erro ${response.status}`);
  return data;
}
const money=c=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(c||0)/100);
const date=v=>v?new Date(v).toLocaleDateString('pt-BR',{day:'2-digit',month:'short',year:'numeric'}):'—';
function Brand(){return <a className="ops-brand" href="/"><span><img src="/logo.svg" alt="ATTOZAP"/></span><strong>ATTOZAP<small>CONTROL CENTER</small></strong></a>}

function App(){
  const [data,setData]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState('');
  const [reward,setReward]=useState(1000),[broadcast,setBroadcast]=useState({title:'',message:'',type:'info'});
  async function load(){setError('');try{const d=await api();if(d){setData(d);setReward(d.referralRewardCents||1000)}}catch(e){setError(e.message)}}
  useEffect(()=>{void load()},[]);
  const fullAdmin=data?.operator?.role==='admin';
  const userTotal=useMemo(()=>data?.metrics?.users?.reduce((n,row)=>n+Number(row.total||0),0)||0,[data]);
  const activeSubscriptions=useMemo(()=>data?.metrics?.subscriptions?.filter(r=>['active','trialing','authorized'].includes(String(r.status))).reduce((n,row)=>n+Number(row.total||0),0)||0,[data]);
  const activeLicenses=useMemo(()=>data?.metrics?.licenses?.filter(r=>r.status==='active').reduce((n,row)=>n+Number(row.total||0),0)||0,[data]);
  const pendingRewards=useMemo(()=>data?.rewards?.filter(r=>r.status==='available').reduce((n,row)=>n+Number(row.amountCents||0),0)||0,[data]);
  async function saveReward(){setBusy('reward');try{await api('POST',{action:'setReferralReward',amountCents:Number(reward)});await load()}catch(e){setError(e.message)}finally{setBusy('')}}
  async function updateReward(id,status){setBusy(id);try{await api('POST',{action:'updateReward',id,status});await load()}catch(e){setError(e.message)}finally{setBusy('')}}
  async function sendBroadcast(){setBusy('broadcast');try{await api('POST',{action:'broadcastNotification',...broadcast});setBroadcast({title:'',message:'',type:'info'});await load()}catch(e){setError(e.message)}finally{setBusy('')}}
  if(!data)return <Shell><div className="ops-loading">{error||<><RefreshCw className="spin"/> Carregando operações…</>}</div></Shell>;
  return <Shell operator={data.operator}>
    {error&&<div className="ops-error">{error}</div>}
    <section className="ops-hero"><div><div className="ops-eyebrow"><ServerCog/> OPERAÇÕES</div><h1>Control Center <span>avançado</span></h1><p>Saúde dos serviços, usuários, cobrança, licenças, indicações e comunicação operacional em um só lugar.</p></div><div className="ops-role"><ShieldCheck/><b>{data.operator.name}</b><span>{data.operator.role==='admin'?'Administrador':'Suporte'}</span></div></section>
    <section className="ops-metrics"><Metric icon={Users} label="USUÁRIOS" value={userTotal}/><Metric icon={CreditCard} label="ASSINATURAS ATIVAS" value={activeSubscriptions}/><Metric icon={KeyRound} label="LICENÇAS ATIVAS" value={activeLicenses}/><Metric icon={Gift} label="CRÉDITOS DISPONÍVEIS" value={money(pendingRewards)}/></section>
    <section className="ops-section"><div className="ops-section-head"><div><small>INFRAESTRUTURA</small><h2>Saúde dos serviços</h2></div></div><div className="service-grid">{Object.entries(data.services||{}).map(([key,value])=><article className={value?'ok':'off'} key={key}><span>{value?<CheckCircle2/>:<Activity/>}</span><div><b>{labelService(key)}</b><small>{value?'Configurado':'Pendente'}</small></div></article>)}</div></section>
    <section className="ops-two"><article className="ops-card"><header><div><small>INDIQUE E GANHE</small><h2>Configuração</h2></div></header><div className="ops-card-body"><label><span>Crédito por indicação qualificada</span><input type="number" min="0" step="100" value={reward} onChange={e=>setReward(e.target.value)} disabled={!fullAdmin}/></label><p>O crédito só fica disponível depois do primeiro pagamento aprovado da pessoa indicada.</p><button className="ops-button primary" disabled={!fullAdmin||busy==='reward'} onClick={saveReward}>{busy==='reward'?<RefreshCw className="spin"/>:<BadgeCheck/>} Salvar valor</button></div></article><article className="ops-card"><header><div><small>COMUNICAÇÃO</small><h2>Broadcast no portal</h2></div></header><div className="ops-card-body"><label><span>Título</span><input value={broadcast.title} onChange={e=>setBroadcast(v=>({...v,title:e.target.value}))} disabled={!fullAdmin}/></label><label><span>Mensagem</span><textarea rows="4" value={broadcast.message} onChange={e=>setBroadcast(v=>({...v,message:e.target.value}))} disabled={!fullAdmin}/></label><label><span>Tipo</span><select value={broadcast.type} onChange={e=>setBroadcast(v=>({...v,type:e.target.value}))} disabled={!fullAdmin}><option value="info">Informação</option><option value="success">Sucesso</option><option value="warning">Aviso</option><option value="update">Atualização</option></select></label><button className="ops-button primary" disabled={!fullAdmin||busy==='broadcast'||!broadcast.title||!broadcast.message} onClick={sendBroadcast}>{busy==='broadcast'?<RefreshCw className="spin"/>:<Send/>} Enviar para usuários ativos</button></div></article></section>
    <section className="ops-section"><div className="ops-section-head"><div><small>INDICAÇÕES</small><h2>Conversões e recompensas</h2></div><span>{data.referrals.length} registros</span></div><div className="ops-table-wrap"><table><thead><tr><th>Indicador</th><th>Indicado</th><th>Status</th><th>Data</th></tr></thead><tbody>{data.referrals.map(item=><tr key={item.id}><td><b>{item.referrerName}</b><small>{item.referrerEmail}</small></td><td><b>{item.referredName}</b><small>{item.referredEmail}</small></td><td><span className={`ops-status ${item.status}`}>{item.status==='qualified'?'Qualificada':'Cadastro'}</span></td><td>{date(item.qualifiedAt||item.createdAt)}</td></tr>)}</tbody></table></div></section>
    <section className="ops-section"><div className="ops-section-head"><div><small>RECOMPENSAS</small><h2>Carteira de indicações</h2></div></div><div className="ops-table-wrap"><table><thead><tr><th>Usuário</th><th>Valor</th><th>Status</th><th>Data</th><th>Ação</th></tr></thead><tbody>{data.rewards.map(item=><tr key={item.id}><td><b>{item.referrerName}</b><small>{item.referrerEmail}</small></td><td>{money(item.amountCents)}</td><td><span className={`ops-status ${item.status}`}>{item.status}</span></td><td>{date(item.availableAt||item.createdAt)}</td><td><div className="ops-actions">{fullAdmin&&item.status==='available'&&<button disabled={busy===item.id} onClick={()=>updateReward(item.id,'paid')}>Marcar pago</button>}{fullAdmin&&item.status!=='void'&&item.status!=='paid'&&<button disabled={busy===item.id} onClick={()=>updateReward(item.id,'void')}>Cancelar</button>}</div></td></tr>)}</tbody></table></div></section>
  </Shell>
}
function Metric({icon:Icon,label,value}){return <article><Icon/><div><small>{label}</small><b>{value}</b></div></article>}
function labelService(key){return ({turso:'Turso',auth:'Autenticação',adminBootstrap:'Admin bootstrap',resend:'Resend',recaptcha:'reCAPTCHA',mercadoPago:'Mercado Pago',stripe:'Stripe',licensing:'Licenciamento'})[key]||key}
function Shell({children,operator}){return <div className="ops-page"><div className="ops-glow one"/><div className="ops-glow two"/><header className="ops-top"><Brand/><nav><a href="/admin"><ArrowLeft/> Admin principal</a><a href="/portal">Portal</a><span>{operator?.email||''}</span></nav></header><main className="ops-main">{children}</main></div>}
createRoot(document.getElementById('root')).render(<App/>);

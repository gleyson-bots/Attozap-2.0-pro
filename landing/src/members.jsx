import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ArrowLeft, BadgeCheck, CheckCircle2, Clipboard, Gift, Mail, RefreshCw, Sparkles, Users } from 'lucide-react';

async function api(url) {
  const response = await fetch(url, { credentials: 'include' });
  const data = await response.json().catch(() => ({}));
  if (response.status === 401) { location.href = `/login?next=${encodeURIComponent('/membros')}`; return null; }
  if (!response.ok) throw new Error(data.error || `Erro ${response.status}`);
  return data;
}

const money = cents => new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(cents||0)/100);
const date = value => value ? new Date(value).toLocaleDateString('pt-BR',{day:'2-digit',month:'short',year:'numeric'}) : '—';

function Brand(){return <a className="members-brand" href="/"><span><img src="/logo.svg" alt="ATTOZAP"/></span><strong>ATTOZAP<small>MEMBERS</small></strong></a>}

function App(){
  const [user,setUser]=useState(null); const [member,setMember]=useState(null); const [error,setError]=useState('');
  useEffect(()=>{Promise.all([api('/api/auth'),api('/api/community')]).then(([session,data])=>{if(session?.user)setUser(session.user);if(data?.member)setMember(data.member)}).catch(e=>setError(e.message))},[]);
  async function copy(value){try{await navigator.clipboard.writeText(value)}catch{}}
  if(error)return <Shell><div className="members-error">{error}</div></Shell>;
  if(!member)return <Shell><div className="members-loading"><RefreshCw className="spin"/> Carregando sua área de membros…</div></Shell>;
  return <Shell user={user}>
    <section className="members-hero"><div><div className="members-eyebrow"><Sparkles/> INDIQUE E GANHE</div><h1>Compartilhe o ATTOZAP.<br/><span>Ganhe créditos promocionais.</span></h1><p>Cada pessoa que entrar pelo seu link e realizar o primeiro pagamento aprovado libera uma recompensa na sua carteira de indicações.</p><div className="referral-link"><div><small>SEU LINK</small><strong>{member.link}</strong></div><button onClick={()=>copy(member.link)}><Clipboard/> Copiar link</button></div><div className="referral-code">Código: <b>{member.code}</b></div></div><div className="members-gift"><Gift/><strong>{money(member.rewardCents)}</strong><span>por indicação qualificada</span></div></section>
    <section className="members-metrics"><article><Users/><div><small>INDICAÇÕES</small><b>{member.referrals.length}</b></div></article><article><Gift/><div><small>DISPONÍVEL</small><b>{money(member.totals.available)}</b></div></article><article><CheckCircle2/><div><small>PAGO</small><b>{money(member.totals.paid)}</b></div></article><article><BadgeCheck/><div><small>PENDENTE</small><b>{money(member.totals.pending)}</b></div></article></section>
    <section className="members-grid"><article className="members-card"><header><div><small>MINHAS INDICAÇÕES</small><h2>Pessoas indicadas</h2></div></header>{member.referrals.length?<div className="members-list">{member.referrals.map(item=><div key={item.id}><span className={`member-status ${item.status}`}></span><div><b>{item.name}</b><small>{item.email}</small></div><em>{item.status==='qualified'?'Qualificada':'Aguardando pagamento'} · {date(item.createdAt)}</em></div>)}</div>:<div className="members-empty">Compartilhe seu link para começar.</div>}</article><article className="members-card"><header><div><small>RECOMPENSAS</small><h2>Histórico</h2></div></header>{member.rewards.length?<div className="reward-list">{member.rewards.map(item=><div key={item.id}><div><b>{money(item.amountCents)}</b><small>{item.status==='available'?'Disponível':item.status==='paid'?'Pago':item.status==='void'?'Cancelado':'Pendente'}</small></div><em>{date(item.availableAt||item.createdAt)}</em></div>)}</div>:<div className="members-empty">Nenhuma recompensa registrada ainda.</div>}</article></section>
    <section className="members-rules"><h2>Como funciona</h2><div><span>1</span><p>Compartilhe seu link pessoal com alguém que ainda não possui conta.</p></div><div><span>2</span><p>A pessoa cria a conta pelo seu link e fica vinculada à sua indicação.</p></div><div><span>3</span><p>Após o primeiro pagamento aprovado, seu crédito promocional é liberado.</p></div><div><span>4</span><p>O administrador controla aprovação, baixa e condições das recompensas.</p></div></section>
  </Shell>
}

function Shell({children,user}){return <div className="members-page"><div className="members-glow one"/><div className="members-glow two"/><header className="members-top"><Brand/><nav><a href="/portal"><ArrowLeft/> Portal</a><a href="/atualizacoes">Atualizações</a><span>{user?.name||''}</span></nav></header><main className="members-main">{children}</main><footer className="members-footer"><a href="/termos">Termos</a><a href="/privacidade">Privacidade</a><a href="/condicoes">Condições</a><a href="/lgpd">LGPD</a></footer></div>}
createRoot(document.getElementById('root')).render(<App/>);

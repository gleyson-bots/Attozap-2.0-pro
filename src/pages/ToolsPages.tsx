import { useEffect, useMemo, useState } from 'react';
import { Ban, CheckCircle2, ClipboardPaste, Download, ExternalLink, Filter, Heart, Link, Plus, RefreshCw, Search, Users, WandSparkles, XCircle } from 'lucide-react';
import { downloadCsv, parseNumbers, parseRecipients } from '../lib';

export function NumberFilterPage({ accounts }: { accounts: any[] }) {
  const connected = accounts.filter(a => a.status === 'connected');
  const [accountId, setAccountId] = useState(connected[0]?.id ?? '');
  const [raw, setRaw] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [generator, setGenerator] = useState({ countryCode: '55', prefix: '', start: 1, end: 100, width: 8 });
  const numbers = useMemo(() => parseNumbers(raw), [raw]);

  async function filter() {
    if (!accountId || !numbers.length) return;
    setBusy(true); setError('');
    try { setResults(await window.attozap.tools.filterNumbers(accountId, numbers)); }
    catch (e: any) { setError(e?.message ?? String(e)); }
    finally { setBusy(false); }
  }

  async function generate() {
    try {
      const values = await window.attozap.tools.generateNumbers(generator);
      setRaw(values.join('\n'));
      setResults([]);
    } catch (e: any) { setError(e?.message ?? String(e)); }
  }

  return <div className="page-stack">
    <div className="page-head"><div><span className="kicker">NUMBER FILTER</span><h2>Filtro de números</h2><p>Valide lotes de números antes de usar em uma campanha.</p></div>{results.length > 0 && <button className="button ghost" onClick={() => downloadCsv('number-filter.csv', [['number','exists','jid'], ...results.map(r => [r.input,r.exists,r.jid??''])])}><Download size={16}/> Exportar CSV</button>}</div>
    {error && <div className="notice error">{error}</div>}
    <div className="tools-grid">
      <section className="card"><div className="card-head"><div><h3>Números</h3><p>{numbers.length} números únicos</p></div></div><div className="field"><label>Conta conectada</label><select value={accountId} onChange={e=>setAccountId(e.target.value)}><option value="">Selecione...</option>{connected.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></div><div className="field"><label>Lista</label><textarea className="tall-area" value={raw} onChange={e=>setRaw(e.target.value)} placeholder={'5511999999999\n5511888888888'}/></div><button className="button primary full" disabled={busy||!accountId||!numbers.length} onClick={()=>void filter()}><Filter size={16}/>{busy?'Validando...':'Filtrar números'}</button></section>
      <section className="card"><div className="card-head"><div><h3>Gerador de números</h3><p>Gere uma sequência para filtrar depois.</p></div><WandSparkles size={18}/></div><div className="form-grid two"><div className="field"><label>País</label><input value={generator.countryCode} onChange={e=>setGenerator(v=>({...v,countryCode:e.target.value}))}/></div><div className="field"><label>Prefixo</label><input value={generator.prefix} onChange={e=>setGenerator(v=>({...v,prefix:e.target.value}))} placeholder="119"/></div><div className="field"><label>Início</label><input type="number" value={generator.start} onChange={e=>setGenerator(v=>({...v,start:Number(e.target.value)}))}/></div><div className="field"><label>Fim</label><input type="number" value={generator.end} onChange={e=>setGenerator(v=>({...v,end:Number(e.target.value)}))}/></div><div className="field"><label>Dígitos da sequência</label><input type="number" value={generator.width} onChange={e=>setGenerator(v=>({...v,width:Number(e.target.value)}))}/></div></div><button className="button ghost full" onClick={()=>void generate()}><Plus size={16}/> Gerar lista</button></section>
    </div>
    <section className="card"><div className="card-head"><div><h3>Resultado</h3><p>{results.filter(r=>r.exists).length} encontrados · {results.filter(r=>!r.exists).length} não encontrados</p></div></div><div className="result-table"><div className="result-head"><span>NÚMERO</span><span>STATUS</span><span>JID</span></div>{results.slice(0,5000).map(row=><div className="result-row" key={row.input}><span>+{row.input}</span><span className={row.exists?'valid':'invalid'}>{row.exists?<><CheckCircle2 size={14}/> WhatsApp</>:<><XCircle size={14}/> Não encontrado</>}</span><code>{row.jid??'—'}</code></div>)}{!results.length&&<div className="empty mini"><Filter size={24}/><p>Os resultados aparecerão aqui.</p></div>}</div></section>
  </div>;
}

export function ContactsPage() {
  const [contacts, setContacts] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [raw, setRaw] = useState('');
  const [showImport, setShowImport] = useState(false);

  async function reload(q=search) { setContacts(await window.attozap.contacts.list(q)); }
  useEffect(()=>{ void reload(''); },[]);

  async function importNow() {
    const parsed = parseRecipients(raw).map(r=>({phone:r.target,name:r.name,variables:r.variables}));
    await window.attozap.contacts.import(parsed); setRaw(''); setShowImport(false); await reload('');
  }

  async function toggle(phone:string,key:'block'|'friendly',value:boolean){ await window.attozap.contacts[key](phone,value); await reload(); }

  return <div className="page-stack"><div className="page-head"><div><span className="kicker">CONTACTS</span><h2>Contatos & listas</h2><p>Base local usada pelo sender, blocklist e friendly list.</p></div><div className="head-actions"><button className="button ghost" onClick={()=>downloadCsv('contacts.csv',[['phone','name','blocked','friendly','wa_exists'],...contacts.map(c=>[c.phone,c.name??'',c.is_blocked,c.is_friendly,c.wa_exists??''])])}><Download size={16}/> CSV</button><button className="button primary" onClick={()=>setShowImport(v=>!v)}><ClipboardPaste size={16}/> Importar</button></div></div>
    {showImport&&<section className="card import-box"><div><h3>Importar contatos</h3><p>Formato: número;nome;campo=valor, uma linha por contato.</p></div><textarea value={raw} onChange={e=>setRaw(e.target.value)} placeholder={'5511999999999;Maria;cidade=SP\n5511888888888;João;cidade=RJ'}/><div className="head-actions"><button className="button ghost" onClick={()=>setShowImport(false)}>Cancelar</button><button className="button primary" onClick={()=>void importNow()}>Importar {parseRecipients(raw).length}</button></div></section>}
    <section className="card"><div className="table-toolbar"><div className="search-input"><Search size={16}/><input value={search} onChange={e=>setSearch(e.target.value)} onKeyDown={e=>e.key==='Enter'&&void reload()} placeholder="Buscar nome ou número..."/></div><button className="button ghost" onClick={()=>void reload()}><RefreshCw size={15}/> Atualizar</button></div><div className="contacts-table"><div className="contacts-head"><span>CONTATO</span><span>WHATSAPP</span><span>FRIENDLY</span><span>BLOCKLIST</span></div>{contacts.map(c=><div className="contacts-row" key={c.phone}><div><b>{c.name||'Sem nome'}</b><small>+{c.phone}</small></div><span>{c.wa_exists===1?<span className="valid"><CheckCircle2 size={14}/> Sim</span>:c.wa_exists===0?<span className="invalid"><XCircle size={14}/> Não</span>:'Não verificado'}</span><button className={`list-toggle ${c.is_friendly?'on friendly':''}`} onClick={()=>void toggle(c.phone,'friendly',!c.is_friendly)}><Heart size={15}/>{c.is_friendly?'Na lista':'Adicionar'}</button><button className={`list-toggle ${c.is_blocked?'on blocked':''}`} onClick={()=>void toggle(c.phone,'block',!c.is_blocked)}><Ban size={15}/>{c.is_blocked?'Bloqueado':'Bloquear'}</button></div>)}{!contacts.length&&<div className="empty mini"><Users size={24}/><p>Nenhum contato salvo.</p></div>}</div></section>
  </div>;
}

export function GroupsPage({ accounts }: { accounts:any[] }) {
  const connected=accounts.filter(a=>a.status==='connected');
  const [accountId,setAccountId]=useState(connected[0]?.id??'');
  const [groups,setGroups]=useState<any[]>([]); const [selected,setSelected]=useState<any|null>(null); const [members,setMembers]=useState<string[]>([]);
  const [invite,setInvite]=useState(''); const [verified,setVerified]=useState<any|null>(null); const [subject,setSubject]=useState(''); const [participants,setParticipants]=useState(''); const [error,setError]=useState('');

  async function reload(sync=false){ if(!accountId)return; try{if(sync)await window.attozap.groups.sync(accountId);setGroups(await window.attozap.groups.list(accountId));}catch(e:any){setError(e?.message??String(e))} }
  useEffect(()=>{void reload(false)},[accountId]);
  async function loadMembers(group:any){setSelected(group);setMembers(await window.attozap.groups.members(accountId,group.group_id??group.id));}
  async function importMembers(){await window.attozap.contacts.import(members.map(phone=>({phone:phone.split('@')[0].split(':')[0]})));}

  return <div className="page-stack"><div className="page-head"><div><span className="kicker">GROUP TOOLS</span><h2>Ferramentas de grupos</h2><p>Listar, criar, entrar, verificar links, extrair membros e adicionar participantes.</p></div><div className="head-actions"><select className="top-select" value={accountId} onChange={e=>setAccountId(e.target.value)}><option value="">Conta...</option>{connected.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select><button className="button primary" disabled={!accountId} onClick={()=>void reload(true)}><RefreshCw size={16}/> Sincronizar grupos</button></div></div>{error&&<div className="notice error">{error}</div>}
    <div className="tools-grid"><section className="card"><div className="card-head"><div><h3>Meus grupos</h3><p>{groups.length} grupos sincronizados</p></div></div><div className="group-list">{groups.map(g=><button key={g.group_id??g.id} className={selected?.group_id===g.group_id?'selected':''} onClick={()=>void loadMembers(g)}><span className="group-avatar"><Users size={16}/></span><span><b>{g.subject}</b><small>{g.member_count??g.size??0} membros</small></span><ExternalLink size={14}/></button>)}{!groups.length&&<div className="empty mini"><Users size={24}/><p>Sincronize para carregar os grupos.</p></div>}</div></section>
      <section className="card"><div className="card-head"><div><h3>{selected?.subject??'Membros do grupo'}</h3><p>{members.length} participantes</p></div>{members.length>0&&<button className="button tiny" onClick={()=>void importMembers()}>Importar contatos</button>}</div><div className="member-list">{members.slice(0,2000).map(jid=><span key={jid}>+{jid.split('@')[0].split(':')[0]}</span>)}{!members.length&&<div className="empty mini"><Users size={24}/><p>Selecione um grupo.</p></div>}</div>{selected&&<AddParticipants accountId={accountId} groupId={selected.group_id??selected.id} onDone={()=>void loadMembers(selected)}/>}</section>
    </div>
    <div className="tools-grid"><section className="card"><div className="card-head"><div><h3>Link de grupo</h3><p>Verificar ou entrar por convite.</p></div><Link size={18}/></div><div className="field"><label>Convite</label><input value={invite} onChange={e=>setInvite(e.target.value)} placeholder="https://chat.whatsapp.com/..."/></div><div className="head-actions"><button className="button ghost" disabled={!accountId||!invite} onClick={async()=>{try{setVerified(await window.attozap.groups.verify(accountId,invite));setError('')}catch(e:any){setError(e?.message??String(e))}}}>Verificar</button><button className="button primary" disabled={!accountId||!invite} onClick={async()=>{try{await window.attozap.groups.join(accountId,invite);await reload(true)}catch(e:any){setError(e?.message??String(e))}}}>Entrar no grupo</button></div>{verified&&<div className="verified-group"><CheckCircle2 size={17}/><div><b>{verified.subject}</b><span>{verified.size} membros</span><p>{verified.description||'Sem descrição'}</p></div></div>}</section>
      <section className="card"><div className="card-head"><div><h3>Criar grupo</h3><p>Bulk Group Creator começa por aqui.</p></div><Plus size={18}/></div><div className="field"><label>Nome</label><input value={subject} onChange={e=>setSubject(e.target.value)} placeholder="Nome do grupo"/></div><div className="field"><label>Participantes</label><textarea value={participants} onChange={e=>setParticipants(e.target.value)} placeholder={'5511999999999\n5511888888888'}/></div><button className="button primary full" disabled={!accountId||!subject} onClick={async()=>{try{await window.attozap.groups.create(accountId,subject,parseNumbers(participants));setSubject('');setParticipants('');await reload(true)}catch(e:any){setError(e?.message??String(e))}}}><Plus size={16}/> Criar grupo</button></section>
    </div>
  </div>;
}

function AddParticipants({accountId,groupId,onDone}:{accountId:string;groupId:string;onDone:()=>void}){const [raw,setRaw]=useState('');const numbers=parseNumbers(raw);return <details className="advanced"><summary>Adicionar membros ao grupo</summary><div className="field"><textarea value={raw} onChange={e=>setRaw(e.target.value)} placeholder={'5511999999999\n5511888888888'}/></div><button className="button ghost" disabled={!numbers.length} onClick={async()=>{await window.attozap.groups.add(accountId,groupId,numbers);setRaw('');onDone()}}><Plus size={15}/> Adicionar {numbers.length}</button></details>}

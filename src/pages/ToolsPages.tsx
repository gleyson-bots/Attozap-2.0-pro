import { useEffect, useMemo, useState } from 'react';
import { Activity, Ban, CheckCircle2, ClipboardPaste, Download, ExternalLink, Filter, Heart, Link, Plus, RefreshCw, Search, Users, WandSparkles, XCircle } from 'lucide-react';
import { downloadCsv, parseNumbers, parseRecipients, toLocalDateTime } from '../lib';

export function NumberFilterPage({ accounts }: { accounts: any[] }) {
  const connected = accounts.filter(account => account.status === 'connected');
  const [accountId, setAccountId] = useState(connected[0]?.id ?? '');
  const [raw, setRaw] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [generator, setGenerator] = useState({ countryCode: '55', prefix: '', start: 1, end: 100, width: 8 });
  const numbers = useMemo(() => parseNumbers(raw), [raw]);

  useEffect(() => {
    if (!accountId && connected[0]?.id) setAccountId(connected[0].id);
  }, [accounts, accountId]);

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
    <div className="page-head"><div><span className="kicker">NUMBER FILTER</span><h2>Filtro de números</h2><p>Valide lotes de números antes de usar em uma campanha.</p></div>{results.length > 0 && <button className="button ghost" onClick={() => downloadCsv('number-filter.csv', [['number','exists','jid'], ...results.map(result => [result.input,result.exists,result.jid??''])])}><Download size={16}/> Exportar CSV</button>}</div>
    {error && <div className="notice error">{error}</div>}
    <div className="tools-grid">
      <section className="card"><div className="card-head"><div><h3>Números</h3><p>{numbers.length} números únicos</p></div></div><div className="field"><label>Conta conectada</label><select value={accountId} onChange={e => setAccountId(e.target.value)}><option value="">Selecione...</option>{connected.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}</select></div><div className="field"><label>Lista</label><textarea className="tall-area" value={raw} onChange={e => setRaw(e.target.value)} placeholder={'5511999999999\n5511888888888'}/></div><button className="button primary full" disabled={busy || !accountId || !numbers.length} onClick={() => void filter()}><Filter size={16}/>{busy ? 'Validando...' : 'Filtrar números'}</button></section>
      <section className="card"><div className="card-head"><div><h3>Gerador de números</h3><p>Gere uma sequência para filtrar depois.</p></div><WandSparkles size={18}/></div><div className="form-grid two"><div className="field"><label>País</label><input value={generator.countryCode} onChange={e => setGenerator(value => ({...value,countryCode:e.target.value}))}/></div><div className="field"><label>Prefixo</label><input value={generator.prefix} onChange={e => setGenerator(value => ({...value,prefix:e.target.value}))} placeholder="119"/></div><div className="field"><label>Início</label><input type="number" value={generator.start} onChange={e => setGenerator(value => ({...value,start:Number(e.target.value)}))}/></div><div className="field"><label>Fim</label><input type="number" value={generator.end} onChange={e => setGenerator(value => ({...value,end:Number(e.target.value)}))}/></div><div className="field"><label>Dígitos da sequência</label><input type="number" value={generator.width} onChange={e => setGenerator(value => ({...value,width:Number(e.target.value)}))}/></div></div><button className="button ghost full" onClick={() => void generate()}><Plus size={16}/> Gerar lista</button></section>
    </div>
    <section className="card"><div className="card-head"><div><h3>Resultado</h3><p>{results.filter(result => result.exists).length} encontrados · {results.filter(result => !result.exists).length} não encontrados</p></div></div><div className="result-table"><div className="result-head"><span>NÚMERO</span><span>STATUS</span><span>JID</span></div>{results.slice(0,5000).map(row => <div className="result-row" key={row.input}><span>+{row.input}</span><span className={row.exists?'valid':'invalid'}>{row.exists?<><CheckCircle2 size={14}/> WhatsApp</>:<><XCircle size={14}/> Não encontrado</>}</span><code>{row.jid??'—'}</code></div>)}{!results.length && <div className="empty mini"><Filter size={24}/><p>Os resultados aparecerão aqui.</p></div>}</div></section>
  </div>;
}

export function ContactsPage() {
  const [contacts, setContacts] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [raw, setRaw] = useState('');
  const [showImport, setShowImport] = useState(false);

  async function reload(query = search) { setContacts(await window.attozap.contacts.list(query)); }
  useEffect(() => { void reload(''); }, []);

  async function importNow() {
    const parsed = parseRecipients(raw).map(recipient => ({ phone: recipient.target, name: recipient.name, variables: recipient.variables }));
    await window.attozap.contacts.import(parsed); setRaw(''); setShowImport(false); await reload('');
  }

  async function toggle(phone: string, key: 'block'|'friendly', value: boolean) { await window.attozap.contacts[key](phone, value); await reload(); }

  function exportGoogleContacts() {
    downloadCsv('google-contacts.csv', [
      ['Name','Given Name','Phone 1 - Type','Phone 1 - Value'],
      ...contacts.map(contact => [contact.name || contact.phone, contact.name || '', 'Mobile', `+${contact.phone}`]),
    ]);
  }

  return <div className="page-stack"><div className="page-head"><div><span className="kicker">CONTACTS</span><h2>Contatos & listas</h2><p>Base local usada pelo sender, blocklist e friendly list.</p></div><div className="head-actions"><button className="button ghost" onClick={exportGoogleContacts}><Download size={16}/> Google CSV</button><button className="button ghost" onClick={() => downloadCsv('contacts.csv',[['phone','name','blocked','friendly','wa_exists'],...contacts.map(contact => [contact.phone,contact.name??'',contact.is_blocked,contact.is_friendly,contact.wa_exists??''])])}><Download size={16}/> CSV</button><button className="button primary" onClick={() => setShowImport(value => !value)}><ClipboardPaste size={16}/> Importar</button></div></div>
    {showImport && <section className="card import-box"><div><h3>Importar contatos</h3><p>Formato: número;nome;campo=valor, uma linha por contato.</p></div><textarea value={raw} onChange={e => setRaw(e.target.value)} placeholder={'5511999999999;Maria;cidade=SP\n5511888888888;João;cidade=RJ'}/><div className="head-actions"><button className="button ghost" onClick={() => setShowImport(false)}>Cancelar</button><button className="button primary" onClick={() => void importNow()}>Importar {parseRecipients(raw).length}</button></div></section>}
    <section className="card"><div className="table-toolbar"><div className="search-input"><Search size={16}/><input value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && void reload()} placeholder="Buscar nome ou número..."/></div><button className="button ghost" onClick={() => void reload()}><RefreshCw size={15}/> Atualizar</button></div><div className="contacts-table"><div className="contacts-head"><span>CONTATO</span><span>WHATSAPP</span><span>FRIENDLY</span><span>BLOCKLIST</span></div>{contacts.map(contact => <div className="contacts-row" key={contact.phone}><div><b>{contact.name || 'Sem nome'}</b><small>+{contact.phone}</small></div><span>{contact.wa_exists === 1 ? <span className="valid"><CheckCircle2 size={14}/> Sim</span> : contact.wa_exists === 0 ? <span className="invalid"><XCircle size={14}/> Não</span> : 'Não verificado'}</span><button className={`list-toggle ${contact.is_friendly?'on friendly':''}`} onClick={() => void toggle(contact.phone,'friendly',!contact.is_friendly)}><Heart size={15}/>{contact.is_friendly?'Na lista':'Adicionar'}</button><button className={`list-toggle ${contact.is_blocked?'on blocked':''}`} onClick={() => void toggle(contact.phone,'block',!contact.is_blocked)}><Ban size={15}/>{contact.is_blocked?'Bloqueado':'Bloquear'}</button></div>)}{!contacts.length && <div className="empty mini"><Users size={24}/><p>Nenhum contato salvo.</p></div>}</div></section>
  </div>;
}

export function GroupsPage({ accounts }: { accounts: any[] }) {
  const connected = accounts.filter(account => account.status === 'connected');
  const [accountId, setAccountId] = useState(connected[0]?.id ?? '');
  const [groups, setGroups] = useState<any[]>([]);
  const [selected, setSelected] = useState<any|null>(null);
  const [members, setMembers] = useState<string[]>([]);
  const [activeMembers, setActiveMembers] = useState<any[]>([]);
  const [memberMode, setMemberMode] = useState<'all'|'active'>('all');
  const [activeDays, setActiveDays] = useState(30);
  const [invite, setInvite] = useState('');
  const [verified, setVerified] = useState<any|null>(null);
  const [bulkInvites, setBulkInvites] = useState('');
  const [bulkResults, setBulkResults] = useState<any[]>([]);
  const [subject, setSubject] = useState('');
  const [participants, setParticipants] = useState('');
  const [error, setError] = useState('');

  async function reload(sync = false) {
    if (!accountId) return;
    try {
      if (sync) await window.attozap.groups.sync(accountId);
      setGroups(await window.attozap.groups.list(accountId));
    } catch (e: any) { setError(e?.message ?? String(e)); }
  }

  useEffect(() => { void reload(false); }, [accountId]);

  async function loadMembers(group: any, mode: 'all'|'active' = memberMode) {
    setSelected(group);
    const groupId = group.group_id ?? group.id;
    if (mode === 'active') {
      setActiveMembers(await window.attozap.groups.activeMembers(accountId, groupId, activeDays));
      setMembers([]);
    } else {
      setMembers(await window.attozap.groups.members(accountId, groupId));
      setActiveMembers([]);
    }
  }

  async function changeMemberMode(mode: 'all'|'active') {
    setMemberMode(mode);
    if (selected) await loadMembers(selected, mode);
  }

  async function importMembers() {
    const phones = memberMode === 'active' ? activeMembers.map(item => item.phone) : members.map(jid => jid.split('@')[0].split(':')[0]);
    await window.attozap.contacts.import(phones.map(phone => ({ phone })));
  }

  async function exportGroupLinks() {
    if (!accountId || !groups.length) return;
    const rows: unknown[][] = [['group','members','invite']];
    for (const group of groups) {
      try { rows.push([group.subject, group.member_count ?? group.size ?? 0, await window.attozap.groups.invite(accountId, group.group_id ?? group.id)]); }
      catch { rows.push([group.subject, group.member_count ?? group.size ?? 0, '']); }
    }
    downloadCsv('group-links.csv', rows);
  }

  async function verifyBulk() {
    const links = bulkInvites.split(/\r?\n/).map(value => value.trim()).filter(Boolean);
    if (!links.length) return;
    try { setBulkResults(await window.attozap.groups.verifyMany(accountId, links)); }
    catch (e: any) { setError(e?.message ?? String(e)); }
  }

  return <div className="page-stack">
    <div className="page-head"><div><span className="kicker">GROUP TOOLS</span><h2>Ferramentas de grupos</h2><p>Listar, criar, entrar, verificar links, extrair membros e observar atividade.</p></div><div className="head-actions"><select className="top-select" value={accountId} onChange={e => setAccountId(e.target.value)}><option value="">Conta...</option>{connected.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}</select><button className="button ghost" disabled={!accountId || !groups.length} onClick={() => void exportGroupLinks()}><Download size={16}/> Links</button><button className="button primary" disabled={!accountId} onClick={() => void reload(true)}><RefreshCw size={16}/> Sincronizar</button></div></div>
    {error && <div className="notice error">{error}</div>}

    <div className="tools-grid">
      <section className="card"><div className="card-head"><div><h3>Meus grupos</h3><p>{groups.length} grupos sincronizados</p></div></div><div className="group-list">{groups.map(group => <button key={group.group_id ?? group.id} className={(selected?.group_id ?? selected?.id) === (group.group_id ?? group.id) ? 'selected' : ''} onClick={() => void loadMembers(group)}><span className="group-avatar"><Users size={16}/></span><span><b>{group.subject}</b><small>{group.member_count ?? group.size ?? 0} membros</small></span><ExternalLink size={14}/></button>)}{!groups.length && <div className="empty mini"><Users size={24}/><p>Sincronize para carregar os grupos.</p></div>}</div></section>

      <section className="card">
        <div className="card-head"><div><h3>{selected?.subject ?? 'Membros do grupo'}</h3><p>{memberMode === 'active' ? `${activeMembers.length} ativos observados` : `${members.length} participantes`}</p></div>{(members.length > 0 || activeMembers.length > 0) && <button className="button tiny" onClick={() => void importMembers()}>Importar contatos</button>}</div>
        <div className="member-mode"><button className={memberMode === 'all' ? 'active' : ''} onClick={() => void changeMemberMode('all')}><Users size={14}/> Todos</button><button className={memberMode === 'active' ? 'active' : ''} onClick={() => void changeMemberMode('active')}><Activity size={14}/> Ativos</button>{memberMode === 'active' && <label>Últimos <input type="number" min="1" max="3650" value={activeDays} onChange={e => setActiveDays(Number(e.target.value))}/> dias <button onClick={() => selected && void loadMembers(selected,'active')}>Aplicar</button></label>}</div>
        <div className="member-list active-capable">{memberMode === 'all' ? members.slice(0,2000).map(jid => <span key={jid}>+{jid.split('@')[0].split(':')[0]}</span>) : activeMembers.slice(0,2000).map(item => <span key={item.jid} title={`Última atividade: ${toLocalDateTime(item.lastMessageAt)}`}><b>+{item.phone}</b><small>{item.messageCount} msg · {toLocalDateTime(item.lastMessageAt)}</small></span>)}{memberMode === 'all' && !members.length && <div className="empty mini"><Users size={24}/><p>Selecione um grupo.</p></div>}{memberMode === 'active' && !activeMembers.length && <div className="empty mini"><Activity size={24}/><p>A atividade começa a ser registrada enquanto esta conta recebe mensagens dos grupos.</p></div>}</div>
        {selected && <AddParticipants accountId={accountId} groupId={selected.group_id ?? selected.id} onDone={() => void loadMembers(selected, memberMode)}/>} 
      </section>
    </div>

    <div className="tools-grid">
      <section className="card"><div className="card-head"><div><h3>Link de grupo</h3><p>Verificar ou entrar por convite.</p></div><Link size={18}/></div><div className="field"><label>Convite</label><input value={invite} onChange={e => setInvite(e.target.value)} placeholder="https://chat.whatsapp.com/..."/></div><div className="head-actions"><button className="button ghost" disabled={!accountId || !invite} onClick={async () => { try { setVerified(await window.attozap.groups.verify(accountId,invite)); setError(''); } catch (e: any) { setError(e?.message ?? String(e)); } }}>Verificar</button><button className="button primary" disabled={!accountId || !invite} onClick={async () => { try { await window.attozap.groups.join(accountId,invite); await reload(true); } catch (e: any) { setError(e?.message ?? String(e)); } }}>Entrar no grupo</button></div>{verified && <div className="verified-group"><CheckCircle2 size={17}/><div><b>{verified.subject}</b><span>{verified.size} membros</span><p>{verified.description || 'Sem descrição'}</p></div></div>}</section>
      <section className="card"><div className="card-head"><div><h3>Criar grupo</h3><p>Criação com participantes iniciais.</p></div><Plus size={18}/></div><div className="field"><label>Nome</label><input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Nome do grupo"/></div><div className="field"><label>Participantes</label><textarea value={participants} onChange={e => setParticipants(e.target.value)} placeholder={'5511999999999\n5511888888888'}/></div><button className="button primary full" disabled={!accountId || !subject} onClick={async () => { try { await window.attozap.groups.create(accountId,subject,parseNumbers(participants)); setSubject(''); setParticipants(''); await reload(true); } catch (e: any) { setError(e?.message ?? String(e)); } }}><Plus size={16}/> Criar grupo</button></section>
    </div>

    <section className="card bulk-verify-card"><div className="card-head"><div><h3>Bulk Group Links Verify</h3><p>Verifique uma lista inteira de links do WhatsApp.</p></div>{bulkResults.length > 0 && <button className="button tiny" onClick={() => downloadCsv('group-link-verify.csv',[['invite','valid','group','members','error'],...bulkResults.map(result => [result.invite,result.valid,result.group?.subject??'',result.group?.size??'',result.error??''])])}><Download size={14}/> CSV</button>}</div><div className="bulk-verify-grid"><div className="field"><label>Links — um por linha</label><textarea value={bulkInvites} onChange={e => setBulkInvites(e.target.value)} placeholder={'https://chat.whatsapp.com/...\nhttps://chat.whatsapp.com/...'}/><button className="button primary" disabled={!accountId || !bulkInvites.trim()} onClick={() => void verifyBulk()}><CheckCircle2 size={15}/> Verificar links</button></div><div className="bulk-results">{bulkResults.map(result => <div key={result.invite} className={result.valid ? 'valid-row' : 'invalid-row'}>{result.valid ? <CheckCircle2 size={14}/> : <XCircle size={14}/>}<div><b>{result.group?.subject ?? (result.valid ? 'Grupo válido' : 'Link inválido')}</b><small>{result.valid ? `${result.group?.size ?? 0} membros` : result.error}</small><code>{result.invite}</code></div></div>)}{!bulkResults.length && <div className="empty mini"><Link size={23}/><p>Os links validados aparecerão aqui.</p></div>}</div></div></section>
  </div>;
}

function AddParticipants({ accountId, groupId, onDone }: { accountId: string; groupId: string; onDone: () => void }) {
  const [raw, setRaw] = useState('');
  const numbers = parseNumbers(raw);
  return <details className="advanced"><summary>Adicionar membros ao grupo</summary><div className="field"><textarea value={raw} onChange={e => setRaw(e.target.value)} placeholder={'5511999999999\n5511888888888'}/></div><button className="button ghost" disabled={!numbers.length} onClick={async () => { await window.attozap.groups.add(accountId,groupId,numbers); setRaw(''); onDone(); }}><Plus size={15}/> Adicionar {numbers.length}</button></details>;
}

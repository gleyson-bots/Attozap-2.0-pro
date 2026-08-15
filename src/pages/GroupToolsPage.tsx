import { useEffect, useState } from 'react';
import { Activity, CheckCircle2, Download, ExternalLink, Link, Plus, RefreshCw, Users, XCircle } from 'lucide-react';
import { downloadCsv, parseIdentityTargets, toLocalDateTime } from '../lib';

export function GroupToolsPage({ accounts }: { accounts: any[] }) {
  const connected = accounts.filter(account => account.status === 'connected');
  const [accountId, setAccountId] = useState(connected[0]?.id ?? '');
  const [groups, setGroups] = useState<any[]>([]);
  const [selected, setSelected] = useState<any | null>(null);
  const [members, setMembers] = useState<any[]>([]);
  const [activeMembers, setActiveMembers] = useState<any[]>([]);
  const [memberMode, setMemberMode] = useState<'all' | 'active'>('all');
  const [activeDays, setActiveDays] = useState(30);
  const [invite, setInvite] = useState('');
  const [verified, setVerified] = useState<any | null>(null);
  const [subject, setSubject] = useState('');
  const [participants, setParticipants] = useState('');
  const [bulkInvites, setBulkInvites] = useState('');
  const [bulkResults, setBulkResults] = useState<any[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!accountId && connected[0]?.id) setAccountId(connected[0].id);
  }, [accounts, accountId]);

  async function reload(sync = false) {
    if (!accountId) return;
    try {
      if (sync) await window.attozap.groups.sync(accountId);
      setGroups(await window.attozap.groups.list(accountId));
      setError('');
    } catch (e: any) { setError(e?.message ?? String(e)); }
  }

  useEffect(() => { void reload(false); }, [accountId]);

  async function loadMembers(group: any, mode: 'all' | 'active' = memberMode) {
    if (!accountId) return;
    setSelected(group);
    const groupId = group.group_id ?? group.id;
    try {
      if (mode === 'active') {
        setActiveMembers(await window.attozap.groups.activeMembers(accountId, groupId, activeDays));
        setMembers([]);
      } else {
        setMembers(await window.attozap.groups.members(accountId, groupId));
        setActiveMembers([]);
      }
      setError('');
    } catch (e: any) { setError(e?.message ?? String(e)); }
  }

  async function changeMode(mode: 'all' | 'active') {
    setMemberMode(mode);
    if (selected) await loadMembers(selected, mode);
  }

  async function importResolvedPhones() {
    const source = memberMode === 'active' ? activeMembers : members;
    const contacts = source.filter(item => item.phone).map(item => ({ phone: item.phone }));
    if (!contacts.length) return;
    await window.attozap.contacts.import(contacts);
  }

  function exportMembers() {
    const source = memberMode === 'active' ? activeMembers : members;
    downloadCsv('group-members.csv', [
      ['canonical_jid','lid','pn_jid','phone','admin','message_count','last_activity'],
      ...source.map(item => [item.jid ?? '', item.lid ?? '', item.pnJid ?? '', item.phone ?? '', item.admin ?? '', item.messageCount ?? '', item.lastMessageAt ?? '']),
    ]);
  }

  async function exportGroupLinks() {
    if (!accountId || !groups.length) return;
    const rows: unknown[][] = [['group','group_jid','members','invite']];
    for (const group of groups) {
      const groupJid = group.group_id ?? group.id;
      try { rows.push([group.subject, groupJid, group.member_count ?? group.size ?? 0, await window.attozap.groups.invite(accountId, groupJid)]); }
      catch { rows.push([group.subject, groupJid, group.member_count ?? group.size ?? 0, '']); }
    }
    downloadCsv('group-links.csv', rows);
  }

  async function verifyBulk() {
    const links = bulkInvites.split(/\r?\n/).map(value => value.trim()).filter(Boolean);
    if (!links.length || !accountId) return;
    try { setBulkResults(await window.attozap.groups.verifyMany(accountId, links)); setError(''); }
    catch (e: any) { setError(e?.message ?? String(e)); }
  }

  const visibleMembers = memberMode === 'active' ? activeMembers : members;
  const resolvedCount = visibleMembers.filter(item => item.phone).length;

  return <div className="page-stack">
    <div className="page-head">
      <div><span className="kicker">GROUP TOOLS</span><h2>Ferramentas de grupos</h2><p>Metadata, membros, LID/PN, convites e atividade observada.</p></div>
      <div className="head-actions">
        <select className="top-select" value={accountId} onChange={e => setAccountId(e.target.value)}><option value="">Conta...</option>{connected.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}</select>
        <button className="button ghost" disabled={!groups.length} onClick={() => void exportGroupLinks()}><Download size={16}/> Links</button>
        <button className="button primary" disabled={!accountId} onClick={() => void reload(true)}><RefreshCw size={16}/> Sincronizar</button>
      </div>
    </div>

    {error && <div className="notice error">{error}</div>}

    <div className="tools-grid">
      <section className="card">
        <div className="card-head"><div><h3>Meus grupos</h3><p>{groups.length} sincronizados</p></div></div>
        <div className="group-list">{groups.map(group => {
          const jid = group.group_id ?? group.id;
          return <button key={jid} className={(selected?.group_id ?? selected?.id) === jid ? 'selected' : ''} onClick={() => void loadMembers(group)}><span className="group-avatar"><Users size={16}/></span><span><b>{group.subject}</b><small>{group.member_count ?? group.size ?? 0} membros · {jid}</small></span><ExternalLink size={14}/></button>;
        })}{!groups.length && <div className="empty mini"><Users size={24}/><p>Sincronize para carregar os grupos.</p></div>}</div>
      </section>

      <section className="card">
        <div className="card-head"><div><h3>{selected?.subject ?? 'Membros do grupo'}</h3><p>{visibleMembers.length} identidades · {resolvedCount} com PN/telefone</p></div><div className="head-actions">{visibleMembers.length > 0 && <button className="button tiny" onClick={exportMembers}><Download size={14}/> CSV</button>}{resolvedCount > 0 && <button className="button tiny" onClick={() => void importResolvedPhones()}>Importar resolvidos</button>}</div></div>
        <div className="member-mode"><button className={memberMode === 'all' ? 'active' : ''} onClick={() => void changeMode('all')}><Users size={14}/> Todos</button><button className={memberMode === 'active' ? 'active' : ''} onClick={() => void changeMode('active')}><Activity size={14}/> Ativos</button>{memberMode === 'active' && <label>Últimos <input type="number" min="1" max="3650" value={activeDays} onChange={e => setActiveDays(Number(e.target.value))}/> dias <button onClick={() => selected && void loadMembers(selected, 'active')}>Aplicar</button></label>}</div>
        <div className="member-list active-capable">{visibleMembers.slice(0, 3000).map(item => <span key={item.jid} title={item.lastMessageAt ? `Última atividade: ${toLocalDateTime(item.lastMessageAt)}` : item.jid}><b>{item.phone ? `+${item.phone}` : item.jid}</b><small>{item.lid ? `LID: ${item.lid}` : ''}{item.pnJid ? `${item.lid ? ' · ' : ''}PN: ${item.pnJid}` : ''}{item.messageCount ? ` · ${item.messageCount} msg` : ''}</small></span>)}{!visibleMembers.length && <div className="empty mini"><Users size={24}/><p>{selected ? 'Nenhum membro carregado nesse modo.' : 'Selecione um grupo.'}</p></div>}</div>
        {selected && <AddParticipants accountId={accountId} groupId={selected.group_id ?? selected.id} onDone={() => void loadMembers(selected, memberMode)}/>} 
      </section>
    </div>

    <div className="tools-grid">
      <section className="card">
        <div className="card-head"><div><h3>Link de grupo</h3><p>Verificar ou entrar por convite.</p></div><Link size={18}/></div>
        <div className="field"><label>Convite</label><input value={invite} onChange={e => setInvite(e.target.value)} placeholder="https://chat.whatsapp.com/..."/></div>
        <div className="head-actions"><button className="button ghost" disabled={!accountId || !invite} onClick={async () => { try { setVerified(await window.attozap.groups.verify(accountId, invite)); setError(''); } catch (e: any) { setError(e?.message ?? String(e)); } }}>Verificar</button><button className="button primary" disabled={!accountId || !invite} onClick={async () => { try { await window.attozap.groups.join(accountId, invite); await reload(true); } catch (e: any) { setError(e?.message ?? String(e)); } }}>Entrar no grupo</button></div>
        {verified && <div className="verified-group"><CheckCircle2 size={17}/><div><b>{verified.subject}</b><span>{verified.size} membros</span><p>{verified.description || 'Sem descrição'}</p></div></div>}
      </section>

      <section className="card">
        <div className="card-head"><div><h3>Criar grupo</h3><p>Criação individual com participantes opcionais.</p></div><Plus size={18}/></div>
        <div className="field"><label>Nome</label><input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Nome do grupo"/></div>
        <div className="field"><label>Participantes — número, PN JID ou LID</label><textarea value={participants} onChange={e => setParticipants(e.target.value)} placeholder={'5511999999999\n5511888888888@s.whatsapp.net\n123456789012345@lid'}/></div>
        <button className="button primary full" disabled={!accountId || !subject} onClick={async () => { try { await window.attozap.groups.create(accountId, subject, parseIdentityTargets(participants)); setSubject(''); setParticipants(''); await reload(true); } catch (e: any) { setError(e?.message ?? String(e)); } }}><Plus size={16}/> Criar grupo</button>
      </section>
    </div>

    <section className="card bulk-verify-card">
      <div className="card-head"><div><h3>Bulk Group Links Verify</h3><p>Valide uma lista de convites.</p></div>{bulkResults.length > 0 && <button className="button tiny" onClick={() => downloadCsv('group-link-verify.csv', [['invite','valid','group','members','error'], ...bulkResults.map(result => [result.invite,result.valid,result.group?.subject ?? '',result.group?.size ?? '',result.error ?? ''])])}><Download size={14}/> CSV</button>}</div>
      <div className="bulk-verify-grid"><div className="field"><label>Links — um por linha</label><textarea value={bulkInvites} onChange={e => setBulkInvites(e.target.value)} placeholder={'https://chat.whatsapp.com/...\nhttps://chat.whatsapp.com/...'}/><button className="button primary" disabled={!accountId || !bulkInvites.trim()} onClick={() => void verifyBulk()}><CheckCircle2 size={15}/> Verificar links</button></div><div className="bulk-results">{bulkResults.map(result => <div key={result.invite} className={result.valid ? 'valid-row' : 'invalid-row'}>{result.valid ? <CheckCircle2 size={14}/> : <XCircle size={14}/>}<div><b>{result.group?.subject ?? (result.valid ? 'Grupo válido' : 'Link inválido')}</b><small>{result.valid ? `${result.group?.size ?? 0} membros` : result.error}</small><code>{result.invite}</code></div></div>)}{!bulkResults.length && <div className="empty mini"><Link size={23}/><p>Os links validados aparecerão aqui.</p></div>}</div></div>
    </section>

    <div className="notice info">LIDs são tratados como identificadores opacos. A interface só mostra/importa telefone quando existe PN/telefone resolvido pelo WhatsApp.</div>
  </div>;
}

function AddParticipants({ accountId, groupId, onDone }: { accountId: string; groupId: string; onDone: () => void }) {
  const [raw, setRaw] = useState('');
  const targets = parseIdentityTargets(raw);
  return <details className="advanced"><summary>Adicionar membros ao grupo</summary><div className="field"><textarea value={raw} onChange={e => setRaw(e.target.value)} placeholder={'5511999999999\n5511888888888@s.whatsapp.net\n123456789012345@lid'}/></div><button className="button ghost" disabled={!targets.length} onClick={async () => { await window.attozap.groups.add(accountId, groupId, targets); setRaw(''); onDone(); }}><Plus size={15}/> Adicionar {targets.length}</button></details>;
}

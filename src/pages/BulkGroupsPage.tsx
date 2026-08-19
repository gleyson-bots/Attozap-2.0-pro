import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Download, Plus, RefreshCw, Users, XCircle } from 'lucide-react';
import { downloadCsv, parseIdentityTargets } from '../lib';

type Mode = 'create' | 'add';

function parseCreateJobs(text: string) {
  const jobs: Array<{ subject: string; participants: string[] }> = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const separator = line.indexOf('|');
    const subject = (separator >= 0 ? line.slice(0, separator) : line).trim();
    const participantText = separator >= 0 ? line.slice(separator + 1) : '';
    if (!subject) continue;
    jobs.push({ subject, participants: parseIdentityTargets(participantText) });
  }
  return jobs.slice(0, 25);
}

export function BulkGroupsPage({ accounts }: { accounts: any[] }) {
  const connected = accounts.filter(account => account.status === 'connected');
  const [accountId, setAccountId] = useState(connected[0]?.id ?? '');
  const [mode, setMode] = useState<Mode>('create');
  const [createText, setCreateText] = useState('Equipe A | 5511999999999\nEquipe B | 123456789012345@lid');
  const [groups, setGroups] = useState<any[]>([]);
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const [participantText, setParticipantText] = useState('');
  const [delayMs, setDelayMs] = useState(1200);
  const [results, setResults] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!accountId && connected[0]?.id) setAccountId(connected[0].id);
  }, [accounts, accountId]);

  async function loadGroups(sync = false) {
    if (!accountId) return;
    try {
      if (sync) await window.attozap.groups.sync(accountId);
      setGroups(await window.attozap.groups.list(accountId));
    } catch (e: any) { setError(e?.message ?? String(e)); }
  }

  useEffect(() => { void loadGroups(false); }, [accountId]);

  const createJobs = useMemo(() => parseCreateJobs(createText), [createText]);
  const participants = useMemo(() => parseIdentityTargets(participantText), [participantText]);

  async function runCreate() {
    if (!accountId || !createJobs.length) return;
    setBusy(true); setError(''); setResults([]);
    try {
      const output = await window.attozap.groups.createMany(accountId, createJobs, delayMs);
      setResults(output);
      await loadGroups(true);
    } catch (e: any) { setError(e?.message ?? String(e)); }
    finally { setBusy(false); }
  }

  async function runAdd() {
    if (!accountId || !selectedGroups.length || !participants.length) return;
    setBusy(true); setError(''); setResults([]);
    try {
      const jobs = selectedGroups.map(groupJid => ({ groupJid, participants }));
      setResults(await window.attozap.groups.addMany(accountId, jobs, delayMs));
    } catch (e: any) { setError(e?.message ?? String(e)); }
    finally { setBusy(false); }
  }

  function toggleGroup(jid: string, checked: boolean) {
    setSelectedGroups(current => checked ? [...new Set([...current, jid])] : current.filter(value => value !== jid));
  }

  function exportResults() {
    downloadCsv('bulk-group-results.csv', [
      ['target','success','error'],
      ...results.map(row => [row.subject ?? row.groupJid ?? '', row.ok, row.error ?? '']),
    ]);
  }

  return <div className="page-stack">
    <div className="page-head">
      <div><span className="kicker">BULK GROUP TOOLS</span><h2>Operações em lote de grupos</h2><p>Criação sequencial e adição de participantes preservando números, PN JID e LID.</p></div>
      <div className="head-actions">
        <select className="top-select" value={accountId} onChange={e => setAccountId(e.target.value)}><option value="">Conta...</option>{connected.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}</select>
        {results.length > 0 && <button className="button ghost" onClick={exportResults}><Download size={16}/> Resultado</button>}
      </div>
    </div>

    {error && <div className="notice error">{error}</div>}
    <div className="member-mode">
      <button className={mode === 'create' ? 'active' : ''} onClick={() => { setMode('create'); setResults([]); }}><Plus size={14}/> Bulk Group Creator</button>
      <button className={mode === 'add' ? 'active' : ''} onClick={() => { setMode('add'); setResults([]); }}><Users size={14}/> Bulk Member Adder</button>
    </div>

    {mode === 'create' ? <div className="tools-grid">
      <section className="card">
        <div className="card-head"><div><h3>Grupos para criar</h3><p>{createJobs.length} trabalho(s), máximo 25 por execução</p></div></div>
        <div className="field"><label>Formato: Nome do grupo | participantes</label><textarea className="tall-area" value={createText} onChange={e => setCreateText(e.target.value)} placeholder={'Equipe A | 5511999999999,5511888888888\nEquipe B | 123456789012345@lid'}/><small>Participantes podem ser número, <code>@s.whatsapp.net</code> ou <code>@lid</code>. O LID nunca é convertido em telefone.</small></div>
        <div className="field"><label>Intervalo entre grupos (ms)</label><input type="number" min="250" max="30000" value={delayMs} onChange={e => setDelayMs(Number(e.target.value))}/></div>
        <button className="button primary full" disabled={!accountId || busy || !createJobs.length} onClick={() => void runCreate()}><Plus size={16}/>{busy ? 'Executando...' : `Criar ${createJobs.length} grupo(s)`}</button>
      </section>
      <section className="card"><div className="card-head"><div><h3>Prévia</h3><p>O que será enviado ao provider</p></div></div><div className="group-list">{createJobs.map((job, index) => <div key={`${job.subject}-${index}`} className="verified-group"><Users size={17}/><div><b>{job.subject}</b><span>{job.participants.length} participante(s)</span><p>{job.participants.slice(0, 3).join(', ')}{job.participants.length > 3 ? '…' : ''}</p></div></div>)}</div></section>
    </div> : <div className="tools-grid">
      <section className="card">
        <div className="card-head"><div><h3>Grupos de destino</h3><p>{selectedGroups.length} selecionado(s), máximo 50</p></div><button className="button tiny" disabled={!accountId} onClick={() => void loadGroups(true)}><RefreshCw size={14}/> Sincronizar</button></div>
        <div className="group-picker">{groups.map(group => { const jid = group.group_id ?? group.id; return <label key={jid}><input type="checkbox" checked={selectedGroups.includes(jid)} onChange={e => toggleGroup(jid, e.target.checked)}/><span><b>{group.subject}</b><small>{jid} · {group.member_count ?? group.size ?? 0} membros</small></span></label>; })}{!groups.length && <div className="empty mini"><Users size={23}/><p>Sincronize seus grupos.</p></div>}</div>
      </section>
      <section className="card">
        <div className="card-head"><div><h3>Participantes</h3><p>{participants.length} identidade(s), máximo 500 por grupo</p></div></div>
        <div className="field"><label>Número, PN JID ou LID — um por linha</label><textarea className="tall-area" value={participantText} onChange={e => setParticipantText(e.target.value)} placeholder={'5511999999999\n5511888888888@s.whatsapp.net\n123456789012345@lid'}/></div>
        <div className="field"><label>Intervalo entre grupos (ms)</label><input type="number" min="250" max="30000" value={delayMs} onChange={e => setDelayMs(Number(e.target.value))}/></div>
        <button className="button primary full" disabled={!accountId || busy || !selectedGroups.length || !participants.length} onClick={() => void runAdd()}><Users size={16}/>{busy ? 'Executando...' : `Adicionar em ${selectedGroups.length} grupo(s)`}</button>
      </section>
    </div>}

    <section className="card">
      <div className="card-head"><div><h3>Resultado da execução</h3><p>{results.filter(row => row.ok).length} sucesso · {results.filter(row => !row.ok).length} falha(s)</p></div></div>
      <div className="bulk-results">{results.map((row, index) => <div key={`${row.subject ?? row.groupJid}-${index}`} className={row.ok ? 'valid-row' : 'invalid-row'}>{row.ok ? <CheckCircle2 size={14}/> : <XCircle size={14}/>}<div><b>{row.subject ?? row.groupJid}</b><small>{row.ok ? 'Concluído' : row.error}</small></div></div>)}{!results.length && <div className="empty mini"><Users size={24}/><p>Os resultados aparecerão aqui.</p></div>}</div>
    </section>

    <div className="notice info">Use as operações em lote somente em grupos administrados por você e com participantes que esperam ser adicionados. Não há lógica de contorno de restrições do WhatsApp.</div>
  </div>;
}

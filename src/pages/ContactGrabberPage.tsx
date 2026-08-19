import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, ContactRound, Download, RefreshCw, Search, Users } from 'lucide-react';
import { downloadCsv, toLocalDateTime } from '../lib';

export function ContactGrabberPage({ accounts }: { accounts: any[] }) {
  const connected = accounts.filter(account => account.status === 'connected');
  const [accountId, setAccountId] = useState(connected[0]?.id ?? '');
  const [rows, setRows] = useState<any[]>([]);
  const [query, setQuery] = useState('');
  const [includeGroups, setIncludeGroups] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!accountId && connected[0]?.id) setAccountId(connected[0].id);
  }, [accounts, accountId]);

  async function reload() {
    if (!accountId) return;
    setBusy(true); setError('');
    try { setRows(await window.attozap.chats.list(accountId, includeGroups)); }
    catch (e: any) { setError(e?.message ?? String(e)); }
    finally { setBusy(false); }
  }

  useEffect(() => { void reload(); }, [accountId, includeGroups]);

  const filtered = useMemo(() => {
    const value = query.trim().toLowerCase();
    if (!value) return rows;
    return rows.filter(row => [row.name, row.jid, row.phone].some(item => String(item ?? '').toLowerCase().includes(value)));
  }, [rows, query]);

  const stats = useMemo(() => ({
    total: rows.length,
    importable: rows.filter(row => row.importable).length,
    lids: rows.filter(row => String(row.jid).endsWith('@lid')).length,
    groups: rows.filter(row => row.isGroup).length,
  }), [rows]);

  async function grabAllResolved() {
    if (!accountId) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await window.attozap.chats.grabContacts(accountId);
      setNotice(`${result.imported} contatos importados; ${result.skipped} identidades sem PN/telefone foram preservadas apenas como JID/LID.`);
    } catch (e: any) { setError(e?.message ?? String(e)); }
    finally { setBusy(false); }
  }

  function exportRows() {
    downloadCsv('contact-grabber.csv', [
      ['name','canonical_jid','phone','type','messages','first_seen','last_seen','importable'],
      ...filtered.map(row => [row.name ?? '', row.jid, row.phone ?? '', row.isGroup ? 'group' : String(row.jid).endsWith('@lid') ? 'lid' : 'contact', row.messageCount, row.firstMessageAt, row.lastMessageAt, row.importable]),
    ]);
  }

  return <div className="page-stack">
    <div className="page-head">
      <div><span className="kicker">CONTACT GRABBER</span><h2>Chats & identidades observadas</h2><p>Lista JID/LID/PN vistos pela sessão sem converter LID em telefone artificial.</p></div>
      <div className="head-actions">
        <select className="top-select" value={accountId} onChange={e => setAccountId(e.target.value)}><option value="">Conta...</option>{connected.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}</select>
        <button className="button ghost" disabled={!rows.length} onClick={exportRows}><Download size={16}/> CSV</button>
        <button className="button primary" disabled={!accountId || busy} onClick={() => void reload()}><RefreshCw size={16}/>{busy ? 'Atualizando...' : 'Atualizar'}</button>
      </div>
    </div>

    {error && <div className="notice error">{error}</div>}
    {notice && <div className="notice info">{notice}</div>}

    <section className="metric-grid">
      <article className="metric-card"><div className="metric-icon"><ContactRound size={18}/></div><span>Observados</span><b>{stats.total}</b><small>Chats persistidos</small></article>
      <article className="metric-card"><div className="metric-icon"><CheckCircle2 size={18}/></div><span>Com PN/telefone</span><b>{stats.importable}</b><small>Podem ir para contatos</small></article>
      <article className="metric-card"><div className="metric-icon"><Users size={18}/></div><span>LID canônico</span><b>{stats.lids}</b><small>Sem inferir telefone</small></article>
      <article className="metric-card"><div className="metric-icon"><Users size={18}/></div><span>Grupos</span><b>{stats.groups}</b><small>{includeGroups ? 'Incluídos' : 'Ocultos'}</small></article>
    </section>

    <section className="card">
      <div className="table-toolbar">
        <div className="search-input"><Search size={16}/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar nome, JID, LID ou telefone..."/></div>
        <label className="check-row compact-check"><input type="checkbox" checked={includeGroups} onChange={e => setIncludeGroups(e.target.checked)}/><span><b>Incluir grupos</b></span></label>
        <button className="button ghost" disabled={!stats.importable || busy} onClick={() => void grabAllResolved()}><ContactRound size={16}/> Importar resolvidos</button>
      </div>

      <div className="result-table">
        <div className="result-head"><span>IDENTIDADE</span><span>TIPO / TELEFONE</span><span>ATIVIDADE</span></div>
        {filtered.map(row => <div className="result-row" key={`${row.accountId}:${row.jid}`}>
          <span><b>{row.name || 'Sem nome'}</b><small style={{display:'block'}}>{row.jid}</small></span>
          <span>{row.isGroup ? 'Grupo' : row.phone ? `+${row.phone}` : String(row.jid).endsWith('@lid') ? 'LID sem PN resolvido' : 'JID sem telefone'}</span>
          <span><b>{row.messageCount} msg</b><small style={{display:'block'}}>{toLocalDateTime(row.lastMessageAt)}</small></span>
        </div>)}
        {!filtered.length && <div className="empty mini"><ContactRound size={24}/><p>{accountId ? 'Ainda não há chats observados nessa sessão.' : 'Conecte uma conta para usar o grabber.'}</p></div>}
      </div>
    </section>

    <div className="notice info">Identidades <code>@lid</code> ficam no cache mesmo sem número. Só entram na base de contatos telefônicos quando o WhatsApp/Baileys fornece um PN correspondente.</div>
  </div>;
}

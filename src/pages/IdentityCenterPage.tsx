import { useEffect, useState } from 'react';
import { Copy, Download, Fingerprint, RefreshCw, Search } from 'lucide-react';
import { downloadCsv, toLocalDateTime } from '../lib';

export function IdentityCenterPage({ accounts }: { accounts: any[] }) {
  const [accountId, setAccountId] = useState('');
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState<any[]>([]);
  const [stats, setStats] = useState<any>({});
  const [error, setError] = useState('');

  async function reload() {
    try {
      const [items, summary] = await Promise.all([window.attozap.identities.list(accountId || undefined, search), window.attozap.identities.stats()]);
      setRows(items); setStats(summary || {}); setError('');
    } catch (e: any) { setError(e?.message ?? String(e)); }
  }
  useEffect(() => { void reload(); }, [accountId]);

  async function copy(value?: string) { if (value) await window.attozap.clipboard.writeText(value); }
  async function exportRows() {
    await downloadCsv('attozap-identidades-jid-lid.csv', [
      ['conta','pushname','canonical_jid','lid','pn_jid','phone','source','last_seen'],
      ...rows.map(row => [row.account_name,row.push_name,row.canonical_jid,row.lid,row.pn_jid,row.phone,row.source,row.last_seen_at]),
    ]);
  }

  return <div className="page-stack">
    <div className="page-head"><div><span className="kicker">IDENTIDADE WHATSAPP</span><h2>Centro JID / LID</h2><p>Diagnóstico da identidade canônica, LID, PN JID e telefone quando realmente resolvido.</p></div><div className="head-actions"><button className="button ghost" onClick={() => void exportRows()}><Download size={15}/> CSV</button><button className="button ghost" onClick={() => void reload()}><RefreshCw size={15}/> Atualizar</button></div></div>
    {error && <div className="notice error">{error}</div>}
    <div className="identity-stats"><article className="card"><span>Total observado</span><b>{Number(stats.total ?? 0)}</b></article><article className="card"><span>Com LID</span><b>{Number(stats.with_lid ?? 0)}</b></article><article className="card"><span>Com PN JID</span><b>{Number(stats.with_pn ?? 0)}</b></article><article className="card"><span>Com telefone</span><b>{Number(stats.with_phone ?? 0)}</b></article><article className="card"><span>Com pushname</span><b>{Number(stats.with_pushname ?? 0)}</b></article></div>
    <div className="notice info"><Fingerprint size={15}/> O trecho numérico de um <code>@lid</code> nunca é tratado como telefone. O telefone só aparece quando o WhatsApp fornece ou permite resolver o vínculo PN/LID.</div>
    <section className="card identities-card"><div className="identity-toolbar"><select value={accountId} onChange={e => setAccountId(e.target.value)}><option value="">Todas as contas</option>{accounts.map(account => <option key={account.id} value={account.id}>{account.name}{account.phone ? ` · +${account.phone}` : ''}</option>)}</select><div className="identity-search"><Search size={15}/><input value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && void reload()} placeholder="JID, LID, telefone ou pushname..."/></div><button className="button primary" onClick={() => void reload()}>Buscar</button></div>
      <div className="identity-table"><div className="identity-head"><span>Contato</span><span>Canônico / LID</span><span>PN / telefone</span><span>Origem</span><span>Visto</span></div>{rows.map((row:any) => <div className="identity-row" key={`${row.account_id}-${row.canonical_jid}`}><div><b>{row.push_name || row.phone ? row.push_name || `+${row.phone}` : 'Sem nome'}</b><small>{row.account_name}</small></div><div className="identity-values"><code>{row.canonical_jid}</code><button title="Copiar canônico" onClick={() => void copy(row.canonical_jid)}><Copy size={12}/></button>{row.lid && row.lid !== row.canonical_jid && <><code>{row.lid}</code><button title="Copiar LID" onClick={() => void copy(row.lid)}><Copy size={12}/></button></>}</div><div className="identity-values">{row.pn_jid ? <><code>{row.pn_jid}</code><button title="Copiar PN JID" onClick={() => void copy(row.pn_jid)}><Copy size={12}/></button></> : <span className="muted">PN não resolvido</span>}{row.phone && <small>+{row.phone}</small>}</div><div><span className="status-chip">{row.source || 'observado'}</span></div><time>{toLocalDateTime(row.last_seen_at)}</time></div>)}{!rows.length && <div className="identity-empty">Nenhuma identidade encontrada para este filtro.</div>}</div>
    </section>
  </div>;
}

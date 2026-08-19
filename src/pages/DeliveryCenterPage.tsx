import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowDownLeft, ArrowUpRight, CheckCircle2, Clock3, Filter, RefreshCw, Search, ShieldAlert, XCircle } from 'lucide-react';
import { toLocalDateTime } from '../lib';

const statusLabels: Record<string, string> = {
  pending: 'Pendente',
  awaiting_ack: 'Aguardando ACK',
  sent: 'Enviada',
  delivered: 'Entregue',
  read: 'Lida',
  played: 'Reproduzida',
  failed: 'Falhou',
  received: 'Recebida',
  skipped: 'Ignorada',
  simulated: 'Simulação',
};
const sourceLabels: Record<string, string> = { all: 'Todas as origens', webchat: 'WebChat', campaign: 'Campanhas', warmup: 'Aquecimento' };
function statusLabel(value?: string) { return statusLabels[String(value || '').toLowerCase()] || value || 'Desconhecido'; }
function statusIcon(value?: string) {
  const status = String(value || '').toLowerCase();
  if (status === 'failed') return <XCircle size={15}/>;
  if (['delivered', 'read', 'played'].includes(status)) return <CheckCircle2 size={15}/>;
  if (status === 'pending' || status === 'awaiting_ack') return <Clock3 size={15}/>;
  if (status === 'simulated') return <CheckCircle2 size={15}/>;
  return <ArrowUpRight size={15}/>;
}
function displayTarget(row: any) { return row.recipient_target || row.remote_jid || 'Destino desconhecido'; }
function sourceLabel(value?: string) { return sourceLabels[String(value || '')] || value || 'WebChat'; }

export function DeliveryCenterPage({ accounts }: { accounts: any[] }) {
  const [source, setSource] = useState('all');
  const [status, setStatus] = useState('all');
  const [accountId, setAccountId] = useState('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [data, setData] = useState<any>({ items: [], total: 0, statusCounts: {} });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pageSize = 50;

  async function reload() {
    setBusy(true);
    setError('');
    try {
      const next = await window.attozap.delivery.query({ source, status, accountId: accountId === 'all' ? undefined : accountId, search, limit: pageSize, offset: page * pageSize });
      setData(next || { items: [], total: 0, statusCounts: {} });
    } catch (err: any) {
      setError(err?.message ?? String(err));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => { void reload(); }, [source, status, accountId, page]);
  useEffect(() => { const timer = setTimeout(() => { setPage(0); void reload(); }, 250); return () => clearTimeout(timer); }, [search]);

  const totalPages = Math.max(1, Math.ceil(Number(data.total || 0) / pageSize));
  const counts = data.statusCounts || {};
  const failed = Number(counts.failed || 0);
  const awaiting = Number(counts.pending || 0) + Number(counts.awaiting_ack || 0);
  const successful = Number(counts.sent || 0) + Number(counts.delivered || 0) + Number(counts.read || 0) + Number(counts.played || 0) + Number(counts.simulated || 0);
  const currentRange = useMemo(() => {
    const start = data.total ? page * pageSize + 1 : 0;
    const end = Math.min(Number(data.total || 0), (page + 1) * pageSize);
    return `${start}–${end} de ${Number(data.total || 0)}`;
  }, [data.total, page]);

  return <div className="page-stack delivery-center-page">
    <div className="page-head"><div><span className="kicker">DELIVERY CENTER</span><h2>Centro de entregas</h2><p>Rastreie WebChat, campanhas e aquecimento numa única visão local.</p></div><button className="button ghost" onClick={() => void reload()} disabled={busy}><RefreshCw size={15}/> {busy ? 'Atualizando…' : 'Atualizar'}</button></div>
    {error && <div className="notice error"><AlertTriangle size={16}/> {error}</div>}
    <section className="delivery-metrics">
      <div className="delivery-metric"><span>Total filtrado</span><b>{Number(data.total || 0).toLocaleString('pt-BR')}</b><small>mensagens de saída</small></div>
      <div className="delivery-metric success"><span>Confirmadas</span><b>{successful.toLocaleString('pt-BR')}</b><small>enviadas ou lidas</small></div>
      <div className="delivery-metric pending"><span>Aguardando</span><b>{awaiting.toLocaleString('pt-BR')}</b><small>sem confirmação final</small></div>
      <div className="delivery-metric danger"><span>Falhas</span><b>{failed.toLocaleString('pt-BR')}</b><small>requerem diagnóstico</small></div>
    </section>
    <section className="card delivery-filters">
      <div className="delivery-filter-search"><Search size={16}/><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Pesquisar JID, mensagem, conta ou erro…"/></div>
      <div className="delivery-filter-select"><Filter size={15}/><select value={source} onChange={event => { setSource(event.target.value); setPage(0); }}>{Object.entries(sourceLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
      <div className="delivery-filter-select"><ShieldAlert size={15}/><select value={status} onChange={event => { setStatus(event.target.value); setPage(0); }}><option value="all">Todos os estados</option>{Object.entries(statusLabels).filter(([value]) => value !== 'received').map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
      <div className="delivery-filter-select"><select value={accountId} onChange={event => { setAccountId(event.target.value); setPage(0); }}><option value="all">Todas as contas</option>{accounts.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}</select></div>
    </section>
    <section className="card delivery-table-card">
      <div className="card-head"><div><h3>Mensagens rastreadas</h3><p>O estado é reconciliado com os ACKs reais do WhatsApp; não é um contador otimista.</p></div><span className="delivery-range">{currentRange}</span></div>
      <div className="delivery-table-wrap"><table className="delivery-table"><thead><tr><th>Origem</th><th>Destino / JID</th><th>Conteúdo</th><th>Estado</th><th>Falha técnica</th><th>Data</th></tr></thead><tbody>{data.items?.map((row: any) => <tr key={`${row.account_id}:${row.id}`}>
        <td><span className={`delivery-source ${row.source}`}><span className="delivery-source-dot"/>{sourceLabel(row.source)}</span><small>{row.account_name || row.account_id}</small>{row.campaign_name && <small>{row.campaign_name}</small>}{row.warmup_name && <small>{row.warmup_name}</small>}</td>
        <td><b className="delivery-jid">{displayTarget(row)}</b>{row.transport_jid && row.transport_jid !== row.remote_jid && <small>Transporte: {row.transport_jid}</small>}{row.participant_jid && <small>Participante: {row.participant_jid}</small>}</td>
        <td><span className="delivery-direction">{row.direction === 'in' ? <ArrowDownLeft size={14}/> : <ArrowUpRight size={14}/>} {row.message_type || 'text'}</span><p>{row.text || row.file_name || 'Sem conteúdo textual'}</p></td>
        <td><span className={`delivery-status ${row.status}`}>{statusIcon(row.status)} {statusLabel(row.status)}</span>{row.failure_class === 'account_restriction' && <small className="delivery-restriction">Restrição remota</small>}</td>
        <td>{row.error ? <span className="delivery-error" title={String(row.error)}>{String(row.failure_code || '') && <b>#{row.failure_code} </b>}{row.error}</span> : <span className="delivery-muted">—</span>}</td>
        <td><span className="delivery-date">{toLocalDateTime(row.created_at)}</span><small>{row.id}</small></td>
      </tr>)}{!data.items?.length && <tr><td colSpan={6}><div className="empty-inline">Nenhum envio corresponde aos filtros atuais.</div></td></tr>}</tbody></table></div>
      <div className="delivery-pagination"><button className="button ghost tiny" disabled={page <= 0 || busy} onClick={() => setPage(value => Math.max(0, value - 1))}>Anterior</button><span>Página {page + 1} de {totalPages}</span><button className="button ghost tiny" disabled={page + 1 >= totalPages || busy} onClick={() => setPage(value => Math.min(totalPages - 1, value + 1))}>Próxima</button></div>
    </section>
  </div>;
}

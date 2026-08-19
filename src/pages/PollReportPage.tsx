import { useEffect, useMemo, useState } from 'react';
import { BarChart3, Download, RefreshCw, Users } from 'lucide-react';
import { downloadCsv, toLocalDateTime } from '../lib';

export function PollReportPage({ accounts }: { accounts: any[] }) {
  const [accountId, setAccountId] = useState('');
  const [reports, setReports] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState('');

  async function reload() {
    try { setReports(await window.attozap.polls.list(accountId || undefined)); setError(''); }
    catch (e: any) { setError(e?.message ?? String(e)); }
  }

  useEffect(() => {
    void reload();
    const off = window.attozap.polls.onUpdate(() => void reload());
    return () => off?.();
  }, [accountId]);

  const selected = useMemo(() => reports.find(item => `${item.account_id}:${item.poll_id}` === selectedId) ?? reports[0], [reports, selectedId]);
  const votes = (selected?.votes ?? []) as Array<{ name: string; voters: string[] }>;
  const totalSelections = votes.reduce((sum, item) => sum + (item.voters?.length ?? 0), 0);

  function exportReport() {
    if (!selected) return;
    downloadCsv('poll-report.csv', [
      ['poll_id','remote_jid','question','option','voter_jid'],
      ...votes.flatMap(option => option.voters?.length
        ? option.voters.map(voter => [selected.poll_id, selected.remote_jid, selected.question ?? '', option.name, voter])
        : [[selected.poll_id, selected.remote_jid, selected.question ?? '', option.name, '']]),
    ]);
  }

  return <div className="page-stack">
    <div className="page-head">
      <div><span className="kicker">POLL REPORT</span><h2>Relatório de enquetes</h2><p>Resultados agregados das enquetes enviadas durante as sessões do WASender.</p></div>
      <div className="head-actions"><select className="top-select" value={accountId} onChange={e => setAccountId(e.target.value)}><option value="">Todas as contas</option>{accounts.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}</select><button className="button ghost" onClick={() => void reload()}><RefreshCw size={15}/> Atualizar</button>{selected && <button className="button primary" onClick={exportReport}><Download size={15}/> CSV</button>}</div>
    </div>

    {error && <div className="notice error">{error}</div>}

    <div className="tools-grid">
      <section className="card">
        <div className="card-head"><div><h3>Enquetes registradas</h3><p>{reports.length} relatório(s)</p></div></div>
        <div className="group-list">{reports.map(item => {
          const key = `${item.account_id}:${item.poll_id}`;
          const itemVotes = (item.votes ?? []) as Array<{ voters?: string[] }>;
          const count = itemVotes.reduce((sum, option) => sum + (option.voters?.length ?? 0), 0);
          return <button key={key} className={(selectedId ?? (reports[0] ? `${reports[0].account_id}:${reports[0].poll_id}` : '')) === key ? 'selected' : ''} onClick={() => setSelectedId(key)}><span className="group-avatar"><BarChart3 size={16}/></span><span><b>{item.question || 'Enquete'}</b><small>{count} seleção(ões) · {toLocalDateTime(item.updated_at)}</small></span></button>;
        })}{!reports.length && <div className="empty mini"><BarChart3 size={24}/><p>Nenhum voto de enquete registrado ainda.</p></div>}</div>
      </section>

      <section className="card">
        <div className="card-head"><div><h3>{selected?.question || 'Detalhes da enquete'}</h3><p>{selected ? selected.remote_jid : 'Selecione uma enquete'}</p></div>{selected && <span className="status-chip connected">{totalSelections} votos</span>}</div>
        <div className="poll-report-options">{votes.map((option, index) => {
          const count = option.voters?.length ?? 0;
          const max = Math.max(1, ...votes.map(item => item.voters?.length ?? 0));
          return <div className="card" key={`${option.name}-${index}`}><div className="card-head"><div><h3>{option.name || `Opção ${index + 1}`}</h3><p>{count} voto(s)</p></div><strong>{totalSelections ? Math.round((count / totalSelections) * 100) : 0}%</strong></div><div className="mini-progress"><i style={{width:`${Math.round((count / max) * 100)}%`}}/></div><div className="member-list active-capable">{(option.voters ?? []).map(voter => <span key={voter}><b>{voter}</b><small>{voter.endsWith('@lid') ? 'LID' : voter.endsWith('@s.whatsapp.net') ? 'PN JID' : 'JID'}</small></span>)}{!count && <div className="empty mini"><Users size={20}/><p>Nenhum voto nessa opção.</p></div>}</div></div>;
        })}{selected && !votes.length && <div className="empty mini"><BarChart3 size={24}/><p>Aguardando atualizações de votos.</p></div>}</div>
      </section>
    </div>

    <div className="notice info">O agregado fica salvo localmente. Após reiniciar o aplicativo, resultados já agregados continuam visíveis; novos votos de uma enquete criada antes da reinicialização exigem que a mensagem original da enquete seja restaurada, algo que será tratado numa etapa posterior.</div>
  </div>;
}

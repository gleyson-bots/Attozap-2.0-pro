import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock3, Gauge, ListChecks, Pause, Play, RefreshCw, Send, Square, TimerReset, Users, Wifi } from 'lucide-react';
import { campaignPercent, toLocalDateTime } from '../lib';

function parseOptions(campaign: any) {
  try { return JSON.parse(String(campaign?.options_json || '{}')); }
  catch { return {}; }
}
function formatCountdown(ms: number) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}
function phaseLabel(phase?: string) {
  const labels: Record<string,string> = {
    preparing: 'Preparando próximo item', checking: 'Validando destinatário', sending: 'Enviando agora', waiting: 'Intervalo entre envios',
    paused: 'Campanha pausada', completed: 'Concluída', stopped: 'Interrompida', error: 'Falha no último envio',
  };
  return labels[phase || ''] || 'Aguardando execução';
}
function statusLabel(status: string) {
  const map: Record<string,string> = { running: 'Em execução', paused: 'Pausada', completed: 'Concluída', stopped: 'Parada', failed: 'Com falhas', scheduled: 'Agendada', draft: 'Rascunho', stopping: 'Parando' };
  return map[status] || status;
}

export function CampaignCenterPage({ campaigns, accounts, reloadCampaigns }: { campaigns: any[]; accounts: any[]; reloadCampaigns: () => Promise<void> }) {
  const [selectedId, setSelectedId] = useState('');
  const [runtime, setRuntime] = useState<any>(null);
  const [recipients, setRecipients] = useState<any[]>([]);
  const [now, setNow] = useState(Date.now());
  const [error, setError] = useState('');

  const selected = useMemo(() => campaigns.find(item => item.id === selectedId) ?? campaigns.find(item => ['running','paused'].includes(item.status)) ?? campaigns[0], [campaigns, selectedId]);
  const options = useMemo(() => parseOptions(selected), [selected]);
  const pct = selected ? campaignPercent(selected) : 0;
  const remaining = runtime?.nextAt ? Math.max(0, Number(runtime.nextAt) - now) : 0;
  const account = accounts.find(item => item.id === runtime?.accountId);
  const pending = selected ? Math.max(0, Number(selected.total || 0) - Number(selected.sent || 0) - Number(selected.failed || 0) - Number(selected.skipped || 0)) : 0;
  const attempted = selected ? Number(selected.sent || 0) + Number(selected.failed || 0) : 0;
  const successRate = attempted ? Math.round(Number(selected.sent || 0) / attempted * 1000) / 10 : 100;

  async function refresh(id = selected?.id) {
    if (!id) { setRuntime(null); setRecipients([]); return; }
    try {
      const [nextRuntime, rows] = await Promise.all([window.attozap.campaigns.runtime(id), window.attozap.campaigns.recipients(id)]);
      setRuntime(nextRuntime); setRecipients(rows); setError('');
    } catch (e: any) { setError(e?.message ?? String(e)); }
  }

  useEffect(() => {
    if (!selectedId && selected?.id) setSelectedId(selected.id);
  }, [selected?.id, selectedId]);

  useEffect(() => { void refresh(selected?.id); }, [selected?.id]);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    const offRuntime = window.attozap.campaigns.onRuntime((payload: any) => {
      if (!selected?.id || payload?.campaignId !== selected.id) return;
      setRuntime(payload);
    });
    const offProgress = window.attozap.campaigns.onProgress((payload: any) => {
      void reloadCampaigns();
      if (payload?.id === selected?.id) void refresh(selected.id);
    });
    const offError = window.attozap.campaigns.onError((payload: any) => {
      if (!selected?.id || payload?.campaignId !== selected.id) return;
      setError(payload?.message || 'Falha durante a campanha');
      void refresh(selected.id);
    });
    return () => { offRuntime?.(); offProgress?.(); offError?.(); };
  }, [selected?.id, reloadCampaigns]);

  async function control(action: 'pause'|'resume'|'stop'|'start') {
    if (!selected?.id) return;
    setError('');
    try {
      await window.attozap.campaigns[action](selected.id);
      await reloadCampaigns();
      await refresh(selected.id);
    } catch (e: any) { setError(e?.message ?? String(e)); }
  }

  return <div className="page-stack campaign-center-page">
    <div className="page-head"><div><span className="kicker">CAMPAIGN CENTER</span><h2>Campanhas em tempo real</h2><p>Acompanhe fila, intervalo, sessão atual, destinatário, erros e resultados sem voltar para o compositor.</p></div><button className="button ghost" onClick={() => { void reloadCampaigns(); void refresh(); }}><RefreshCw size={16}/> Atualizar</button></div>
    {error && <div className="notice error">{error}</div>}

    <div className="campaign-center-layout">
      <aside className="campaign-center-list card">
        <div className="card-head"><div><h3>Campanhas</h3><p>{campaigns.length} registradas</p></div></div>
        <div className="campaign-center-scroll">{campaigns.map(item => {
          const itemOptions = parseOptions(item);
          return <button key={item.id} className={selected?.id === item.id ? 'active' : ''} onClick={() => setSelectedId(item.id)}>
            <div><b>{item.name}</b><span>{item.target_type === 'group' ? 'Grupos' : 'Contatos'} · {itemOptions.profile || 'personalizado'}</span></div>
            <small className={`status-chip ${item.status}`}>{statusLabel(item.status)}</small>
            <div className="mini-progress"><i style={{ width: `${campaignPercent(item)}%` }}/></div>
            <em>{item.sent}/{item.total}</em>
          </button>;
        })}{!campaigns.length && <div className="empty mini"><Send size={25}/><p>Nenhuma campanha criada.</p></div>}</div>
      </aside>

      <section className="campaign-center-main">
        {!selected ? <div className="card empty"><Send size={34}/><h3>Nenhuma campanha selecionada</h3><p>Crie uma campanha no Contact Sender ou Group Sender.</p></div> : <>
          {options.profile === 'extreme' && <div className="notice warning campaign-extreme-warning"><AlertTriangle size={17}/><div><b>Perfil Extremo ativo</b><span>Intervalos curtos aumentam a pressão sobre a sessão. Blocklist, validações, falhas e desconexões continuam interrompendo ou pulando itens quando necessário.</span></div></div>}

          <div className="campaign-live-grid">
            <section className="card campaign-runtime-card">
              <div className="runtime-top"><div><span className="kicker">EXECUÇÃO</span><h3>{selected.name}</h3><p>{phaseLabel(runtime?.phase)}</p></div><span className={`status-chip ${selected.status}`}>{statusLabel(selected.status)}</span></div>
              <div className="runtime-body">
                <div className={`countdown-ring ${runtime?.phase === 'sending' ? 'sending' : ''}`} style={{ '--progress': `${remaining && options.maxDelayMs ? Math.max(5, Math.min(100, 100 - remaining / Number(options.maxDelayMs) * 100)) : 100}%` } as any}>
                  <Clock3 size={24}/><b>{runtime?.phase === 'waiting' ? formatCountdown(remaining) : runtime?.phase === 'sending' ? 'AGORA' : '--:--'}</b><span>próxima ação</span>
                </div>
                <div className="runtime-details">
                  <div><span><Wifi size={14}/> Conta atual</span><b>{account?.name || runtime?.accountId || '—'}</b><small>{account?.phone ? `+${account.phone}` : ''}</small></div>
                  <div><span><Users size={14}/> Destinatário</span><b>{runtime?.target || '—'}</b><small>{runtime?.index ? `${runtime.index} de ${runtime.total || selected.total}` : 'Aguardando'}</small></div>
                  <div><span><Gauge size={14}/> Perfil</span><b>{String(options.profile || 'personalizado').toUpperCase()}</b><small>{options.minDelayMs && options.maxDelayMs ? `${Math.round(options.minDelayMs/1000)}–${Math.round(options.maxDelayMs/1000)}s aleatórios` : 'Intervalo personalizado'}</small></div>
                  <div><span><TimerReset size={14}/> Intervalo controlado</span><b>{runtime?.phase === 'waiting' ? 'Em cooldown' : 'Acompanhando fila'}</b><small>O intervalo não ignora bloqueios ou falhas.</small></div>
                </div>
              </div>
              <div className="runtime-progress"><div><span>Progresso geral</span><b>{pct}%</b></div><div className="campaign-progress"><i style={{ width: `${pct}%` }}/></div></div>
              <div className="runtime-controls">
                {selected.status === 'running' && <button className="button ghost" onClick={() => void control('pause')}><Pause size={16}/> Pausar</button>}
                {selected.status === 'paused' && <button className="button primary" onClick={() => void control('resume')}><Play size={16}/> Retomar</button>}
                {['draft','stopped','failed'].includes(selected.status) && <button className="button primary" onClick={() => void control('start')}><Play size={16}/> Iniciar</button>}
                {['running','paused','stopping'].includes(selected.status) && <button className="button danger-soft" onClick={() => void control('stop')}><Square size={16}/> Parar campanha</button>}
              </div>
            </section>

            <section className="campaign-stats-grid">
              <article className="metric-card"><div className="metric-icon"><Send size={18}/></div><span>Enviados</span><b>{Number(selected.sent || 0)}</b><small>de {selected.total}</small></article>
              <article className="metric-card"><div className="metric-icon"><CheckCircle2 size={18}/></div><span>Sucesso</span><b>{successRate}%</b><small>sobre tentativas</small></article>
              <article className="metric-card"><div className="metric-icon"><AlertTriangle size={18}/></div><span>Falhas</span><b>{Number(selected.failed || 0)}</b><small>erros registrados</small></article>
              <article className="metric-card"><div className="metric-icon"><ListChecks size={18}/></div><span>Pendentes</span><b>{pending}</b><small>{Number(selected.skipped || 0)} ignorados</small></article>
            </section>
          </div>

          <section className="card campaign-queue-card">
            <div className="card-head"><div><h3>Fila de destinatários</h3><p>Status individual atualizado durante a execução.</p></div><span>{recipients.length} itens</span></div>
            <div className="campaign-recipient-table"><div className="campaign-recipient-row header"><span>Destinatário</span><span>Nome</span><span>Status</span><span>Enviado em</span><span>Detalhe</span></div>{recipients.slice(0, 300).map(row => <div className="campaign-recipient-row" key={row.id}><span>{row.target}</span><span>{row.name || '—'}</span><span><i className={`recipient-state ${row.status}`}/>{row.status}</span><span>{row.sent_at ? toLocalDateTime(row.sent_at) : '—'}</span><span title={row.error || ''}>{row.error || row.message_id || '—'}</span></div>)}</div>
          </section>
        </>}
      </section>
    </div>
  </div>;
}

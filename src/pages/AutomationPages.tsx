import { useEffect, useMemo, useState } from 'react';
import { Bot, CalendarClock, Clock3, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { toLocalDateTime } from '../lib';

export function AutoReplyPage({ accounts }: { accounts: any[] }) {
  const connected = accounts.filter(account => account.status === 'connected');
  const [accountId, setAccountId] = useState(connected[0]?.id ?? accounts[0]?.id ?? '');
  const [rules, setRules] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ name: 'Resposta automática', matchType: 'contains', triggerText: 'olá', responseText: 'Olá! Como posso ajudar?', priority: 0 });

  useEffect(() => {
    if (!accountId && accounts[0]?.id) setAccountId(accounts[0].id);
  }, [accounts, accountId]);

  async function reload() {
    try {
      setRules(await window.attozap.autoReply.list(accountId || undefined));
      setError('');
    } catch (e: any) { setError(e?.message ?? String(e)); }
  }

  useEffect(() => { void reload(); }, [accountId]);

  async function create() {
    if (!accountId) { setError('Crie uma conta do WhatsApp antes de cadastrar uma regra.'); return; }
    if (!form.responseText.trim()) { setError('Informe o texto da resposta automática.'); return; }
    setBusy(true); setError(''); setNotice('');
    try {
      await window.attozap.autoReply.create({ accountId, ...form });
      await reload();
      setNotice('Regra criada com sucesso.');
    } catch (e: any) { setError(e?.message ?? String(e)); }
    finally { setBusy(false); }
  }

  async function toggle(rule: any) {
    setBusy(true); setError(''); setNotice('');
    try {
      await window.attozap.autoReply.update(rule.id, { enabled: !rule.enabled });
      await reload();
      setNotice(rule.enabled ? 'Regra desativada.' : 'Regra ativada.');
    } catch (e: any) { setError(e?.message ?? String(e)); }
    finally { setBusy(false); }
  }

  async function remove(rule: any) {
    setBusy(true); setError(''); setNotice('');
    try {
      await window.attozap.autoReply.remove(rule.id);
      await reload();
      setNotice('Regra excluída.');
    } catch (e: any) { setError(e?.message ?? String(e)); }
    finally { setBusy(false); }
  }

  return <div className="page-stack">
    <div className="page-head">
      <div><span className="kicker">AUTO REPLY</span><h2>Bot de respostas automáticas</h2><p>Regras simples por conta, sem depender da tela estar aberta.</p></div>
      <select className="top-select" value={accountId} onChange={e => setAccountId(e.target.value)}><option value="">Selecione a conta...</option>{accounts.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}</select>
    </div>
    {!accounts.length && <div className="notice warning">Crie e ative uma conta do WhatsApp para usar o Auto Reply.</div>}
    {error && <div className="notice error">{error}</div>}
    {notice && <div className="notice info">{notice}</div>}

    <div className="automation-layout">
      <section className="card">
        <div className="card-head"><div><h3>Nova regra</h3><p>Primeira regra compatível encerra o processamento.</p></div><Bot size={18}/></div>
        <div className="field"><label>Nome</label><input value={form.name} onChange={e => setForm(value => ({ ...value, name: e.target.value }))}/></div>
        <div className="form-grid two">
          <div className="field"><label>Condição</label><select value={form.matchType} onChange={e => setForm(value => ({ ...value, matchType: e.target.value }))}><option value="contains">Contém</option><option value="equals">Igual a</option><option value="startsWith">Começa com</option><option value="regex">Regex</option><option value="all">Qualquer mensagem</option></select></div>
          <div className="field"><label>Prioridade</label><input type="number" value={form.priority} onChange={e => setForm(value => ({ ...value, priority: Number(e.target.value) }))}/></div>
        </div>
        <div className="field"><label>Texto de gatilho</label><input value={form.triggerText} onChange={e => setForm(value => ({ ...value, triggerText: e.target.value }))} disabled={form.matchType === 'all'}/></div>
        <div className="field"><label>Resposta</label><textarea value={form.responseText} onChange={e => setForm(value => ({ ...value, responseText: e.target.value }))}/></div>
        <button className="button primary full" disabled={busy || !accountId || !form.responseText.trim()} onClick={() => void create()}><Plus size={16}/>{busy ? 'Processando...' : 'Criar regra'}</button>
      </section>

      <section className="card">
        <div className="card-head"><div><h3>Regras</h3><p>{rules.length} configuradas</p></div><button className="icon-button" disabled={busy} onClick={() => void reload()}><RefreshCw size={15}/></button></div>
        <div className="rule-list">{rules.map(rule => <div className="rule-row" key={rule.id}><button className={`switch ${rule.enabled ? 'on' : ''}`} disabled={busy} onClick={() => void toggle(rule)}><i/></button><div className="grow"><b>{rule.name}</b><span>{rule.match_type === 'all' ? 'Qualquer mensagem' : `${rule.match_type}: “${rule.trigger_text}”`}</span><p>{rule.response_text}</p></div><small>P{rule.priority}</small><button className="icon-button danger" disabled={busy} onClick={() => void remove(rule)}><Trash2 size={15}/></button></div>)}{!rules.length && <div className="empty mini"><Bot size={24}/><p>Nenhuma regra cadastrada.</p></div>}</div>
      </section>
    </div>
  </div>;
}

export function SchedulerPage({ campaigns }: { campaigns: any[] }) {
  const schedulable = useMemo(() => campaigns.filter(campaign => !['running', 'completed'].includes(campaign.status)), [campaigns]);
  const [campaignId, setCampaignId] = useState('');
  const [runAt, setRunAt] = useState('');
  const [schedules, setSchedules] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!campaignId && schedulable[0]?.id) setCampaignId(schedulable[0].id);
    if (campaignId && !schedulable.some(campaign => campaign.id === campaignId)) setCampaignId(schedulable[0]?.id ?? '');
  }, [schedulable, campaignId]);

  async function reload() {
    try { setSchedules(await window.attozap.campaigns.schedules()); setError(''); }
    catch (e: any) { setError(e?.message ?? String(e)); }
  }

  useEffect(() => { void reload(); }, []);

  async function schedule() {
    if (!campaignId) { setError('Crie ou selecione uma campanha antes de agendar.'); return; }
    if (!runAt) { setError('Escolha a data e o horário do envio.'); return; }
    const date = new Date(runAt);
    if (Number.isNaN(date.getTime())) { setError('Data de agendamento inválida.'); return; }
    if (date.getTime() <= Date.now()) { setError('O horário do agendamento precisa estar no futuro.'); return; }
    setBusy(true); setError(''); setNotice('');
    try {
      await window.attozap.campaigns.schedule(campaignId, date.toISOString());
      setRunAt('');
      await reload();
      setNotice('Campanha agendada com sucesso.');
    } catch (e: any) { setError(e?.message ?? String(e)); }
    finally { setBusy(false); }
  }

  return <div className="page-stack">
    <div className="page-head"><div><span className="kicker">SCHEDULER</span><h2>Agendamentos</h2><p>Prepare uma campanha e defina quando ela deverá iniciar.</p></div><button className="button ghost" disabled={busy} onClick={() => void reload()}><RefreshCw size={15}/> Atualizar</button></div>
    {!schedulable.length && <div className="notice warning">Ainda não existe uma campanha disponível para agendamento. Crie uma campanha no Contact Sender ou Group Sender primeiro.</div>}
    {error && <div className="notice error">{error}</div>}
    {notice && <div className="notice info">{notice}</div>}
    <section className="card schedule-create"><div className="schedule-icon"><CalendarClock size={22}/></div><div className="field grow"><label>Campanha</label><select value={campaignId} onChange={e => setCampaignId(e.target.value)}><option value="">Selecione...</option>{schedulable.map(campaign => <option key={campaign.id} value={campaign.id}>{campaign.name} · {campaign.total} destinatários</option>)}</select></div><div className="field"><label>Executar em</label><input type="datetime-local" value={runAt} onChange={e => setRunAt(e.target.value)}/></div><button className="button primary" disabled={busy || !campaignId || !runAt} onClick={() => void schedule()}><Clock3 size={16}/>{busy ? 'Agendando...' : 'Agendar'}</button></section>
    <section className="card"><div className="card-head"><div><h3>Fila de agendamentos</h3><p>{schedules.length} registros</p></div></div><div className="schedule-list">{schedules.map(item => <div className="schedule-row" key={item.id}><span className="schedule-dot"/><div className="grow"><b>{item.campaign_name}</b><span>{toLocalDateTime(item.run_at)}</span></div><span className={`status-chip ${item.status}`}>{item.status}</span></div>)}{!schedules.length && <div className="empty mini"><CalendarClock size={24}/><p>Nenhum envio agendado.</p></div>}</div></section>
  </div>;
}

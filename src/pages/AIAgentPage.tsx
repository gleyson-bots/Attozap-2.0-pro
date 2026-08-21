import { useEffect, useMemo, useState } from 'react';
import { Bot, CheckCircle2, CircleAlert, MessageSquareText, Save, Settings2, Sparkles, Trash2 } from 'lucide-react';

const MODES = [
  { id: 'auto_reply', label: 'Resposta automática', hint: 'Responde conversas individuais recebidas.' },
  { id: 'qualification', label: 'Qualificar lead', hint: 'Faz perguntas curtas para identificar intenção.' },
  { id: 'reactivation', label: 'Reativar conversa', hint: 'Retoma temas existentes sem insistência.' },
  { id: 'assist', label: 'Assistente', hint: 'Tom geral de apoio ao atendimento.' },
] as const;

type Props = { accounts: any[] };
type AgentForm = {
  name: string; enabled: boolean; provider: string; model: string; systemPrompt: string;
  temperature: string; mode: string; allowGroups: boolean; maxHistory: string;
};

const INITIAL_FORM: AgentForm = {
  name: 'Agente de atendimento', enabled: false, provider: 'openai', model: '', systemPrompt: '',
  temperature: '0.6', mode: 'auto_reply', allowGroups: false, maxHistory: '12',
};

export function AIAgentPage({ accounts }: Props) {
  const connected = accounts.filter(account => account.status === 'connected');
  const [agents, setAgents] = useState<any[]>([]);
  const [providers, setProviders] = useState<any[]>([]);
  const [accountId, setAccountId] = useState('');
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [logs, setLogs] = useState<any[]>([]);
  const [form, setForm] = useState<AgentForm>(INITIAL_FORM);

  const selected = useMemo(() => agents.find(agent => agent.account_id === accountId), [agents, accountId]);
  const configured = useMemo(() => providers.filter(provider => provider.configured), [providers]);
  const selectedProvider = providers.find(provider => provider.id === form.provider);
  const activeMode = MODES.find(mode => mode.id === form.mode);

  async function refresh() {
    const [nextAgents, nextProviders] = await Promise.all([
      window.attozap.aiAgents.list(), window.attozap.ai.providers(),
    ]);
    setAgents(nextAgents);
    setProviders(nextProviders);
  }

  useEffect(() => { void refresh().catch(error => setNotice(error instanceof Error ? error.message : String(error))); }, []);
  useEffect(() => { if (!accountId && connected[0]?.id) setAccountId(connected[0].id); }, [accountId, connected]);
  useEffect(() => {
    if (!accountId) return;
    const agent = agents.find(item => item.account_id === accountId);
    if (agent) {
      setForm({
        name: agent.name,
        enabled: Boolean(agent.enabled),
        provider: agent.provider,
        model: agent.model ?? '',
        systemPrompt: agent.system_prompt ?? '',
        temperature: String(agent.temperature ?? 0.6),
        mode: agent.mode,
        allowGroups: Boolean(agent.allow_groups),
        maxHistory: String(agent.max_history ?? 12),
      });
      void window.attozap.aiAgents.logs(agent.id).then(setLogs).catch(() => setLogs([]));
    } else {
      setForm({ ...INITIAL_FORM });
      setLogs([]);
    }
  }, [accountId, agents]);

  async function save() {
    if (!accountId) { setNotice('Conecte e selecione uma conta WhatsApp antes de configurar o agente.'); return; }
    setSaving(true);
    setNotice('');
    try {
      const result = await window.attozap.aiAgents.save({
        accountId,
        name: form.name,
        enabled: form.enabled,
        provider: form.provider,
        model: form.model,
        systemPrompt: form.systemPrompt,
        temperature: Number(form.temperature),
        mode: form.mode,
        allowGroups: form.allowGroups,
        maxHistory: Number(form.maxHistory),
      });
      setNotice(`Agente “${result.name}” salvo neste canal.`);
      await refresh();
    } catch (error) { setNotice(error instanceof Error ? error.message : String(error)); }
    finally { setSaving(false); }
  }

  async function remove() {
    if (!accountId || !selected || !confirm('Remover a configuração deste agente? O histórico de execuções será apagado.')) return;
    try {
      await window.attozap.aiAgents.remove(accountId);
      setNotice('Agente removido deste canal.');
      await refresh();
    } catch (error) { setNotice(error instanceof Error ? error.message : String(error)); }
  }

  return (
    <div className="page-stack ai-agent-page">
      <section className="page-hero compact">
        <div>
          <span className="kicker"><Sparkles size={14} /> AGENTE LOCAL</span>
          <h2>IA por canal WhatsApp conectado</h2>
          <p>Configure um agente com contexto do contacto e do histórico local. As chaves continuam protegidas no processo Electron e cada canal decide se o agente está ativo.</p>
        </div>
        <div className="hero-actions">
          <button className="button ghost" onClick={() => void refresh()}><Settings2 size={16} /> Atualizar</button>
          <button className="button primary" onClick={() => void save()} disabled={saving || !accountId}><Save size={16} />{saving ? 'Salvando...' : 'Salvar agente'}</button>
        </div>
      </section>

      {notice && <div className={`inline-notice ${notice.includes('salvo') || notice.includes('removido') ? 'success' : 'warning'}`}><CircleAlert size={16} /><span>{notice}</span></div>}

      {!connected.length ? (
        <section className="empty-state"><Bot size={34} /><h3>Nenhum canal conectado</h3><p>Conecte uma conta WhatsApp em <b>Contas</b> para disponibilizar o agente local.</p></section>
      ) : (
        <div className="ai-agent-layout">
          <section className="card agent-form-card">
            <div className="card-head">
              <div><h3>Configuração do canal</h3><p>Uma configuração ativa por conta conectada.</p></div>
              <span className={`status-pill ${form.enabled ? 'success' : 'muted'}`}>{form.enabled ? 'Ativo' : 'Em pausa'}</span>
            </div>
            <div className="form-grid">
              <label>Canal WhatsApp
                <select value={accountId} onChange={event => setAccountId(event.target.value)}>
                  {connected.map(account => <option value={account.id} key={account.id}>{account.name} · {account.phone || 'conectada'}</option>)}
                </select>
              </label>
              <label>Nome do agente<input value={form.name} maxLength={120} onChange={event => setForm({ ...form, name: event.target.value })} /></label>
              <label>Provedor IA
                <select value={form.provider} onChange={event => setForm({ ...form, provider: event.target.value })}>
                  {providers.map(provider => <option value={provider.id} key={provider.id}>{provider.label}{provider.configured ? '' : ' · configurar chave'}</option>)}
                </select>
              </label>
              <label>Modelo<input value={form.model} placeholder={selectedProvider?.model || 'Padrão configurado'} onChange={event => setForm({ ...form, model: event.target.value })} /></label>
              <label>Modo
                <select value={form.mode} onChange={event => setForm({ ...form, mode: event.target.value })}>
                  {MODES.map(mode => <option value={mode.id} key={mode.id}>{mode.label}</option>)}
                </select>
                <small>{activeMode?.hint}</small>
              </label>
              <label>Temperatura<input type="number" min="0" max="2" step="0.1" value={form.temperature} onChange={event => setForm({ ...form, temperature: event.target.value })} /></label>
              <label>Histórico usado
                <select value={form.maxHistory} onChange={event => setForm({ ...form, maxHistory: event.target.value })}>
                  <option value="6">6 mensagens</option><option value="12">12 mensagens</option><option value="20">20 mensagens</option><option value="32">32 mensagens</option>
                </select>
              </label>
              <label className="check-field"><input type="checkbox" checked={form.enabled} onChange={event => setForm({ ...form, enabled: event.target.checked })} /><span><b>Ativar resposta automática</b><small>O agente responde apenas a mensagens recebidas.</small></span></label>
              <label className="check-field"><input type="checkbox" checked={form.allowGroups} onChange={event => setForm({ ...form, allowGroups: event.target.checked })} /><span><b>Permitir grupos</b><small>Desativado por padrão para evitar respostas indevidas.</small></span></label>
            </div>
            <label className="wide-field">System prompt adaptativo
              <textarea value={form.systemPrompt} maxLength={8000} rows={8} placeholder="Ex.: Você atende a empresa X. Use um tom próximo, confirme a necessidade do contacto e encaminhe para uma pessoa quando não houver informação suficiente." onChange={event => setForm({ ...form, systemPrompt: event.target.value })} />
              <small>O ATTOZAP acrescenta automaticamente canal, nome disponível do contacto, modo escolhido e histórico local. Nunca coloque chaves de API aqui.</small>
            </label>
            <div className="form-actions">
              <div>{configured.length ? <span className="helper success"><CheckCircle2 size={15} />{configured.length} provedor(es) com chave configurada</span> : <span className="helper warning">Configure a chave do provedor em Configurações antes de ativar.</span>}</div>
              <div className="button-row">
                <button className="button ghost danger" onClick={() => void remove()} disabled={!selected}><Trash2 size={16} /> Remover</button>
                <button className="button primary" onClick={() => void save()} disabled={saving}>{saving ? 'Salvando...' : 'Salvar configuração'}</button>
              </div>
            </div>
          </section>
          <aside className="card agent-activity">
            <div className="card-head"><div><h3>Atividade recente</h3><p>Execuções deste agente.</p></div><MessageSquareText size={18} /></div>
            {logs.length ? <div className="agent-log-list">{logs.slice(0, 12).map(log => <article key={log.id}><div><b>{log.status === 'sent' ? 'Resposta enviada' : log.status === 'failed' ? 'Falha no agente' : 'Em processamento'}</b><span>{new Date(log.created_at).toLocaleString('pt-BR')}</span></div><p>{log.response_text || log.error || 'Aguardando resposta do provedor.'}</p></article>)}</div> : <div className="empty-inline"><Bot size={24} /><p>Sem execuções neste canal. O histórico aparecerá aqui depois da primeira mensagem recebida.</p></div>}
          </aside>
        </div>
      )}
    </div>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { Flame, Play, RefreshCw, Save, Square, Trash2 } from 'lucide-react';
import { toLocalDateTime } from '../lib';

function lines(value: string) { return [...new Set(value.split(/\r?\n/).map(item => item.trim()).filter(Boolean))]; }

export function WarmupPage({ accounts }: { accounts: any[] }) {
  const connected = accounts.filter(account => account.status === 'connected');
  const [profiles, setProfiles] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    accountId: connected[0]?.id ?? '', name: 'Aquecimento controlado', targets: '',
    messages: 'Olá! Teste de conexão.\nTudo certo por aí?\nMensagem de teste do ATTOZAP.',
    minDelaySeconds: 300, maxDelaySeconds: 900, dailyLimit: 12, activeHourStart: 9, activeHourEnd: 20,
  });

  async function reload() {
    setProfiles(await window.attozap.warmup.list());
    setLogs(await window.attozap.warmup.logs(selectedId || undefined, 300));
  }

  useEffect(() => { void reload(); }, [selectedId]);
  useEffect(() => { if (!form.accountId && connected[0]?.id) setForm(current => ({ ...current, accountId: connected[0].id })); }, [accounts]);

  const selected = useMemo(() => profiles.find(item => item.id === selectedId), [profiles, selectedId]);

  function load(profile: any) {
    setSelectedId(profile.id);
    setForm({
      accountId: profile.account_id, name: profile.name,
      targets: (profile.targets ?? []).join('\n'), messages: (profile.messages ?? []).join('\n'),
      minDelaySeconds: profile.min_delay_seconds, maxDelaySeconds: profile.max_delay_seconds,
      dailyLimit: profile.daily_limit, activeHourStart: profile.active_hour_start, activeHourEnd: profile.active_hour_end,
    });
  }

  function reset() {
    setSelectedId('');
    setForm({ accountId: connected[0]?.id ?? '', name: 'Aquecimento controlado', targets: '', messages: 'Olá! Teste de conexão.\nTudo certo por aí?', minDelaySeconds: 300, maxDelaySeconds: 900, dailyLimit: 12, activeHourStart: 9, activeHourEnd: 20 });
  }

  async function save() {
    setBusy(true); setError('');
    try {
      const payload = { ...form, targets: lines(form.targets), messages: lines(form.messages) };
      const profile = selectedId ? await window.attozap.warmup.update(selectedId, payload) : await window.attozap.warmup.create(payload);
      setSelectedId(profile.id); await reload();
    } catch (e: any) { setError(e?.message ?? String(e)); }
    finally { setBusy(false); }
  }

  async function start() {
    if (!selectedId) { setError('Salve o perfil antes de iniciar.'); return; }
    try { await window.attozap.warmup.start(selectedId); await reload(); }
    catch (e: any) { setError(e?.message ?? String(e)); }
  }
  async function stop() { if (selectedId) { await window.attozap.warmup.stop(selectedId); await reload(); } }
  async function remove() { if (selectedId) { await window.attozap.warmup.remove(selectedId); reset(); await reload(); } }

  return <div className="page-stack">
    <div className="page-head"><div><span className="kicker">WARMUP</span><h2>Sistema de aquecimento</h2><p>Cadência gradual para contas e contatos de teste que consentiram com a interação.</p></div><button className="button ghost" onClick={() => void reload()}><RefreshCw size={15}/> Atualizar</button></div>
    {error && <div className="notice error">{error}</div>}
    <div className="notice info"><b>Modo seguro:</b> o módulo limita o volume a 30 mensagens/dia por perfil, exige intervalo mínimo de 3 minutos e não tenta contornar bloqueios, bans ou mecanismos de proteção do WhatsApp.</div>

    <div className="warmup-layout">
      <section className="card warmup-editor">
        <div className="card-head"><div><h3>{selectedId ? 'Editar perfil' : 'Novo perfil'}</h3><p>Use apenas números/JIDs/LIDs ou grupos de teste autorizados.</p></div><Flame size={19}/></div>
        <div className="form-grid two"><div className="field"><label>Conta conectada</label><select value={form.accountId} onChange={e => setForm(v => ({...v,accountId:e.target.value}))}><option value="">Selecione...</option>{connected.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}</select></div><div className="field"><label>Nome</label><input value={form.name} onChange={e => setForm(v => ({...v,name:e.target.value}))}/></div></div>
        <div className="field"><label>Destinos de teste — um por linha</label><textarea className="tall-area" value={form.targets} onChange={e => setForm(v => ({...v,targets:e.target.value}))} placeholder={'5511999999999\n123456789012345@lid\n120363...@g.us'}/><small>{lines(form.targets).length} destino(s). O sistema preserva LID/PN/JID.</small></div>
        <div className="field"><label>Mensagens — uma por linha</label><textarea value={form.messages} onChange={e => setForm(v => ({...v,messages:e.target.value}))}/></div>
        <div className="form-grid three"><div className="field"><label>Intervalo mín. (s)</label><input type="number" min="180" max="3600" value={form.minDelaySeconds} onChange={e => setForm(v => ({...v,minDelaySeconds:Number(e.target.value)}))}/></div><div className="field"><label>Intervalo máx. (s)</label><input type="number" min="180" max="7200" value={form.maxDelaySeconds} onChange={e => setForm(v => ({...v,maxDelaySeconds:Number(e.target.value)}))}/></div><div className="field"><label>Limite diário</label><input type="number" min="1" max="30" value={form.dailyLimit} onChange={e => setForm(v => ({...v,dailyLimit:Number(e.target.value)}))}/></div></div>
        <div className="form-grid two"><div className="field"><label>Início da janela (hora)</label><input type="number" min="0" max="23" value={form.activeHourStart} onChange={e => setForm(v => ({...v,activeHourStart:Number(e.target.value)}))}/></div><div className="field"><label>Fim da janela (hora)</label><input type="number" min="1" max="24" value={form.activeHourEnd} onChange={e => setForm(v => ({...v,activeHourEnd:Number(e.target.value)}))}/></div></div>
        <div className="head-actions"><button className="button primary" disabled={busy || !form.accountId || !lines(form.targets).length || !lines(form.messages).length} onClick={() => void save()}><Save size={15}/> {selectedId ? 'Salvar alterações' : 'Criar perfil'}</button><button className="button ghost" onClick={reset}>Novo</button>{selectedId && <button className="button ghost danger" onClick={() => void remove()}><Trash2 size={15}/> Excluir</button>}</div>
      </section>

      <section className="card warmup-profiles"><div className="card-head"><div><h3>Perfis</h3><p>{profiles.length} configurado(s)</p></div></div><div className="warmup-profile-list">{profiles.map(profile => <button key={profile.id} onClick={() => load(profile)} className={selectedId === profile.id ? 'active' : ''}><span className={`warmup-fire ${profile.status === 'running' ? 'running' : ''}`}><Flame size={17}/></span><span className="grow"><b>{profile.name}</b><small>{profile.targets.length} destinos · {profile.sent_today}/{profile.daily_limit} hoje</small></span><span className={`status-chip ${profile.status}`}>{profile.status}</span></button>)}</div>{selected && <div className="warmup-controls"><button className="button primary" disabled={selected.status === 'running'} onClick={() => void start()}><Play size={15}/> Iniciar</button><button className="button ghost" disabled={selected.status !== 'running'} onClick={() => void stop()}><Square size={15}/> Parar</button></div>}</section>
    </div>

    <section className="card"><div className="card-head"><div><h3>Logs do aquecimento</h3><p>Últimas tentativas e falhas.</p></div></div><div className="audit-list">{logs.map(log => <div key={log.id}><span className={`audit-dot ${log.status}`}/><div><b>{log.target_jid ?? '—'}</b><small>{log.message || 'Sem texto'}{log.error ? ` · ${log.error}` : ''}</small></div><time>{toLocalDateTime(log.created_at)}</time></div>)}</div></section>
  </div>;
}

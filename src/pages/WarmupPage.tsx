import { useEffect, useMemo, useState } from 'react';
import { Bot, Flame, MessageCircleMore, Play, RefreshCw, Save, Sparkles, Square, Trash2, Users } from 'lucide-react';
import { toLocalDateTime } from '../lib';

function lines(value: string) { return [...new Set(value.split(/\r?\n/).map(item => item.trim()).filter(Boolean))]; }

export function WarmupPage({ accounts }: { accounts: any[] }) {
  const connected = accounts.filter(account => account.status === 'connected');
  const [profiles, setProfiles] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [groups, setGroups] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    mode: 'direct' as 'direct'|'pool', peerAccountIds: [] as string[],
    accountId: connected[0]?.id ?? '', name: 'Aquecimento controlado', targets: '',
    messages: 'Olá! Tudo certo por aí?\nComo está seu dia?\nTeste concluído por aqui.',
    minDelaySeconds: 300, maxDelaySeconds: 900, dailyLimit: 12, activeHourStart: 9, activeHourEnd: 20,
    messageSource: 'library' as 'library'|'ai', aiProvider: 'xai' as 'xai'|'poolside', aiModel: '',
    aiPrompt: 'Conversa casual curta entre minhas próprias contas de teste, sem propaganda e sem links.', aiDailyLimit: 6,
  });

  async function reload() {
    setProfiles(await window.attozap.warmup.list());
    setLogs(await window.attozap.warmup.logs(selectedId || undefined, 300));
  }
  async function loadGroups(accountId = form.accountId) {
    if (!accountId) { setGroups([]); return; }
    try { setGroups(await window.attozap.groups.list(accountId)); } catch { setGroups([]); }
  }
  useEffect(() => { void reload(); }, [selectedId]);
  useEffect(() => { if (!form.accountId && connected[0]?.id) setForm(current => ({ ...current, accountId: connected[0].id })); }, [accounts]);
  useEffect(() => { if (form.mode === 'direct') void loadGroups(); }, [form.accountId, form.mode]);

  const selected = useMemo(() => profiles.find(item => item.id === selectedId), [profiles, selectedId]);
  const accountById = (id?: string) => accounts.find(account => account.id === id);
  function load(profile: any) {
    setSelectedId(profile.id);
    setForm({ mode: profile.mode || 'direct', peerAccountIds: profile.peer_account_ids || [], accountId: profile.account_id, name: profile.name, targets: (profile.targets ?? []).join('\n'), messages: (profile.messages ?? []).join('\n'), minDelaySeconds: profile.min_delay_seconds, maxDelaySeconds: profile.max_delay_seconds, dailyLimit: profile.daily_limit, activeHourStart: profile.active_hour_start, activeHourEnd: profile.active_hour_end, messageSource: profile.message_source || 'library', aiProvider: profile.ai_provider || 'xai', aiModel: profile.ai_model || '', aiPrompt: profile.ai_prompt || '', aiDailyLimit: profile.ai_daily_limit || 6 });
  }
  function reset() {
    setSelectedId('');
    setForm({ mode: 'direct', peerAccountIds: [], accountId: connected[0]?.id ?? '', name: 'Aquecimento controlado', targets: '', messages: 'Olá! Tudo certo por aí?\nComo está seu dia?', minDelaySeconds: 300, maxDelaySeconds: 900, dailyLimit: 12, activeHourStart: 9, activeHourEnd: 20, messageSource: 'library', aiProvider: 'xai', aiModel: '', aiPrompt: 'Conversa casual curta entre minhas próprias contas de teste, sem propaganda e sem links.', aiDailyLimit: 6 });
  }
  function addOwnAccount(account: any) {
    if (!account?.phone) { setError('Essa conta ainda não possui número resolvido. Conecte-a primeiro.'); return; }
    setForm(v => ({ ...v, targets: [...lines(v.targets), account.phone].filter((x, i, a) => a.indexOf(x) === i).join('\n') }));
  }
  function togglePeer(accountId: string) {
    setForm(v => ({ ...v, peerAccountIds: v.peerAccountIds.includes(accountId) ? v.peerAccountIds.filter(id => id !== accountId) : [...v.peerAccountIds, accountId] }));
  }
  function addGroup(group: any) {
    const jid = group.group_id ?? group.id;
    if (!jid) return;
    setForm(v => ({ ...v, targets: [...lines(v.targets), jid].filter((x, i, a) => a.indexOf(x) === i).join('\n') }));
  }

  async function save() {
    setBusy(true); setError('');
    try {
      const payload = { ...form, accountId: form.mode === 'pool' ? (form.peerAccountIds[0] || form.accountId) : form.accountId, targets: lines(form.targets), messages: lines(form.messages) };
      const profile = selectedId ? await window.attozap.warmup.update(selectedId, payload) : await window.attozap.warmup.create(payload);
      setSelectedId(profile.id); await reload();
    } catch (e: any) { setError(e?.message ?? String(e)); }
    finally { setBusy(false); }
  }
  async function start() { if (!selectedId) { setError('Salve o perfil antes de iniciar.'); return; } try { await window.attozap.warmup.start(selectedId); await reload(); } catch (e: any) { setError(e?.message ?? String(e)); } }
  async function stop() { if (selectedId) { await window.attozap.warmup.stop(selectedId); await reload(); } }
  async function remove() { if (selectedId) { await window.attozap.warmup.remove(selectedId); reset(); await reload(); } }

  const canSave = form.mode === 'pool'
    ? form.peerAccountIds.length >= 2 && (form.messageSource === 'ai' || lines(form.messages).length > 0)
    : Boolean(form.accountId) && lines(form.targets).length > 0 && (form.messageSource === 'ai' || lines(form.messages).length > 0);

  return <div className="page-stack">
    <div className="page-head"><div><span className="kicker">WARMUP</span><h2>Sistema de aquecimento</h2><p>Interações graduais entre suas próprias contas e grupos sincronizados, com conversa recíproca e IA opcional.</p></div><button className="button ghost" onClick={() => void reload()}><RefreshCw size={15}/> Atualizar</button></div>
    {error && <div className="notice error">{error}</div>}
    <div className="notice info"><b>Modo Pool:</b> selecione pelo menos duas contas próprias conectadas. O motor alterna A → B, B → A (ou round-robin com 3+) para criar uma conversa real entre as sessões. Limites: até 30 mensagens/dia por perfil, intervalo mínimo de 3 minutos e até 12 chamadas de IA/dia.</div>

    <div className="warmup-layout">
      <section className="card warmup-editor">
        <div className="card-head"><div><h3>{selectedId ? 'Editar perfil' : 'Novo perfil'}</h3><p>Escolha envio direto ou conversa entre suas contas.</p></div><Flame size={19}/></div>

        <div className="field"><label>Modo de aquecimento</label><div className="member-mode"><button className={form.mode === 'direct' ? 'active' : ''} onClick={() => setForm(v => ({...v,mode:'direct'}))}><Flame size={14}/> Direto / grupos</button><button className={form.mode === 'pool' ? 'active' : ''} onClick={() => setForm(v => ({...v,mode:'pool'}))}><MessageCircleMore size={14}/> Pool de contas</button></div></div>
        <div className="field"><label>Nome do perfil</label><input value={form.name} onChange={e => setForm(v => ({...v,name:e.target.value}))}/></div>

        {form.mode === 'pool' ? <>
          <div className="field"><label>Contas participantes — marque 2 ou mais</label><div className="warmup-target-picker">{connected.map(account => <button type="button" key={account.id} className={form.peerAccountIds.includes(account.id) ? 'active' : ''} onClick={() => togglePeer(account.id)}><span className="online-dot"/><b>{account.name}</b><small>{account.phone ? `+${account.phone}` : 'número não resolvido'}</small></button>)}{connected.length < 2 && <small>Conecte pelo menos duas contas WhatsApp para usar o modo Pool.</small>}</div><small>{form.peerAccountIds.length} conta(s) selecionada(s). Todas precisam estar conectadas e com número resolvido.</small></div>
          <div className="notice info">Ordem de conversa: {form.peerAccountIds.length >= 2 ? form.peerAccountIds.map(id => accountById(id)?.name || id).join(' → ') + ` → ${accountById(form.peerAccountIds[0])?.name || ''}` : 'selecione as contas acima'}</div>
        </> : <>
          <div className="form-grid two"><div className="field"><label>Conta que envia</label><select value={form.accountId} onChange={e => setForm(v => ({...v,accountId:e.target.value}))}><option value="">Selecione...</option>{connected.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}</select></div><div className="field"><label>Adicionar minhas contas</label><div className="warmup-target-picker compact">{accounts.filter(a => a.phone).map(account => <button type="button" key={account.id} onClick={() => addOwnAccount(account)}><span className="online-dot"/><b>{account.name}</b><small>+{account.phone}</small></button>)}</div></div></div>
          <div className="field"><label>Adicionar grupos sincronizados</label><div className="warmup-target-picker">{groups.slice(0,80).map(group => <button type="button" key={group.group_id ?? group.id} onClick={() => addGroup(group)}><Users size={13}/><b>{group.subject}</b><small>{group.member_count ?? group.size ?? 0} membros</small></button>)}{!groups.length && <small>Sincronize os grupos em Ferramentas de grupos para escolhê-los aqui.</small>}</div></div>
          <div className="field"><label>Destinos selecionados — um por linha</label><textarea className="tall-area" value={form.targets} onChange={e => setForm(v => ({...v,targets:e.target.value}))} placeholder={'5511999999999\n120363...@g.us'}/><small>{lines(form.targets).length} destino(s). Destinos de terceiros são recusados pelo motor.</small></div>
        </>}

        <div className="field"><label>Fonte das mensagens</label><div className="member-mode"><button className={form.messageSource === 'library' ? 'active' : ''} onClick={() => setForm(v => ({...v,messageSource:'library'}))}>Biblioteca local</button><button className={form.messageSource === 'ai' ? 'active' : ''} onClick={() => setForm(v => ({...v,messageSource:'ai'}))}><Sparkles size={14}/> IA + fallback local</button></div></div>
        <div className="field"><label>Mensagens prontas — uma por linha</label><textarea value={form.messages} onChange={e => setForm(v => ({...v,messages:e.target.value}))}/><small>No Pool, as mensagens são usadas em sequência; com IA, o histórico recente entra no contexto para continuar a conversa.</small></div>

        {form.messageSource === 'ai' && <div className="ai-warmup-box"><div className="card-head"><div><h3><Bot size={15}/> IA para conversas de teste</h3><p>A chave é configurada localmente em Configurações.</p></div></div><div className="form-grid three"><div className="field"><label>Provedor</label><select value={form.aiProvider} onChange={e => setForm(v => ({...v,aiProvider:e.target.value as any}))}><option value="xai">xAI / Grok</option><option value="poolside">Poolside</option></select></div><div className="field"><label>Modelo opcional</label><input value={form.aiModel} onChange={e => setForm(v => ({...v,aiModel:e.target.value}))} placeholder="Usar modelo das Configurações"/></div><div className="field"><label>Máx. IA/dia</label><input type="number" min="1" max="12" value={form.aiDailyLimit} onChange={e => setForm(v => ({...v,aiDailyLimit:Number(e.target.value)}))}/></div></div><div className="field"><label>Contexto da conversa</label><textarea value={form.aiPrompt} onChange={e => setForm(v => ({...v,aiPrompt:e.target.value}))}/></div></div>}

        <div className="form-grid three"><div className="field"><label>Intervalo mín. (s)</label><input type="number" min="180" max="3600" value={form.minDelaySeconds} onChange={e => setForm(v => ({...v,minDelaySeconds:Number(e.target.value)}))}/></div><div className="field"><label>Intervalo máx. (s)</label><input type="number" min="180" max="7200" value={form.maxDelaySeconds} onChange={e => setForm(v => ({...v,maxDelaySeconds:Number(e.target.value)}))}/></div><div className="field"><label>Limite diário</label><input type="number" min="1" max="30" value={form.dailyLimit} onChange={e => setForm(v => ({...v,dailyLimit:Number(e.target.value)}))}/></div></div>
        <div className="form-grid two"><div className="field"><label>Início da janela</label><input type="number" min="0" max="23" value={form.activeHourStart} onChange={e => setForm(v => ({...v,activeHourStart:Number(e.target.value)}))}/></div><div className="field"><label>Fim da janela</label><input type="number" min="1" max="24" value={form.activeHourEnd} onChange={e => setForm(v => ({...v,activeHourEnd:Number(e.target.value)}))}/></div></div>
        <div className="head-actions"><button className="button primary" disabled={busy || !canSave} onClick={() => void save()}><Save size={15}/> {selectedId ? 'Salvar alterações' : 'Criar perfil'}</button><button className="button ghost" onClick={reset}>Novo</button>{selectedId && <button className="button ghost danger" onClick={() => void remove()}><Trash2 size={15}/> Excluir</button>}</div>
      </section>

      <section className="card warmup-profiles"><div className="card-head"><div><h3>Perfis</h3><p>{profiles.length} configurado(s)</p></div></div><div className="warmup-profile-list">{profiles.map(profile => <button key={profile.id} onClick={() => load(profile)} className={selectedId === profile.id ? 'active' : ''}><span className={`warmup-fire ${profile.status === 'running' ? 'running' : ''}`}><Flame size={17}/></span><span className="grow"><b>{profile.name}</b><small>{profile.mode === 'pool' ? `${profile.peer_account_ids?.length || 0} contas em conversa` : `${profile.targets.length} destinos`} · {profile.sent_today}/{profile.daily_limit} hoje · {profile.message_source === 'ai' ? 'IA' : 'local'}</small></span><span className={`status-chip ${profile.status}`}>{profile.status}</span></button>)}</div>{selected && <div className="warmup-controls"><button className="button primary" disabled={selected.status === 'running'} onClick={() => void start()}><Play size={15}/> Iniciar</button><button className="button ghost" disabled={selected.status !== 'running'} onClick={() => void stop()}><Square size={15}/> Parar</button></div>}</section>
    </div>

    <section className="card"><div className="card-head"><div><h3>Logs do aquecimento</h3><p>Remetente → destinatário, origem local/IA, tentativas e falhas.</p></div></div><div className="audit-list">{logs.map(log => <div key={log.id}><span className={`audit-dot ${log.status}`}/><div><b>{accountById(log.sender_account_id)?.name || log.sender_account_id || 'conta'} → {accountById(log.recipient_account_id)?.name || log.target_jid || 'destino'} <span className="status-chip">{log.source || 'local'}</span></b><small>{log.message || 'Sem texto'}{log.error ? ` · ${log.error}` : ''}</small></div><time>{toLocalDateTime(log.created_at)}</time></div>)}</div></section>
  </div>;
}

import { useEffect, useMemo, useState } from 'react';
import { Activity, Bot, FileAudio, FileText, Film, Flame, Image, MessageCircleMore, Paperclip, Play, RefreshCw, Save, Sparkles, Square, Timer, Trash2, Users, X } from 'lucide-react';
import { toLocalDateTime } from '../lib';

function lines(value: string) { return [...new Set(value.split(/\r?\n/).map(item => item.trim()).filter(Boolean))]; }
function fileName(path: string) { return path.split(/[\\/]/).pop() || path; }
function mediaType(path: string) {
  const ext = (path.match(/\.([^.]+)$/)?.[1] || '').toLowerCase();
  if (['jpg','jpeg','png','gif'].includes(ext)) return 'image';
  if (['mp4','mov','mkv','webm'].includes(ext)) return 'video';
  if (['mp3','ogg','opus','wav','m4a','aac'].includes(ext)) return 'audio';
  if (ext === 'webp') return 'sticker';
  return 'document';
}
function mediaIcon(type: string) { return type === 'image' ? <Image size={16}/> : type === 'video' ? <Film size={16}/> : type === 'audio' ? <FileAudio size={16}/> : type === 'sticker' ? <Sparkles size={16}/> : <FileText size={16}/>; }
function phaseLabel(phase?: string) { return ({starting:'Iniciando',waiting:'Aguardando próximo turno',typing:'Digitando…',sending:'Enviando…',sent:'Enviado',error:'Falha',paused:'Pausado'} as Record<string,string>)[phase || ''] || 'Parado'; }
function clock(seconds: number) { const safe=Math.max(0,seconds||0); const m=Math.floor(safe/60),s=safe%60; return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`; }
function hourLabel(value: unknown, end = false) { const hour = Math.max(0, Math.min(end ? 24 : 23, Number(value) || (end ? 20 : 9))); return end && hour === 24 ? '24:00' : `${String(hour).padStart(2,'0')}:00`; }

export function WarmupPage({ accounts }: { accounts: any[] }) {
  const connected = accounts.filter(account => account.status === 'connected');
  const [profiles, setProfiles] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [groups, setGroups] = useState<any[]>([]);
  const [runtime, setRuntime] = useState<any>(null);
  const [now, setNow] = useState(Date.now());
  const [selectedId, setSelectedId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    mode: 'direct' as 'direct'|'pool', peerAccountIds: [] as string[], accountId: connected[0]?.id ?? '', name: 'Aquecimento controlado', targets: '',
    messages: 'Olá! Tudo certo por aí?\nComo está seu dia?\nTudo tranquilo por aí?', minDelaySeconds: 300, maxDelaySeconds: 900, dailyLimit: 12, activeHourStart: 9, activeHourEnd: 20,
    messageSource: 'library' as 'library'|'ai', aiProvider: 'xai' as 'xai'|'poolside', aiModel: '', aiPrompt: 'Conversa casual curta entre minhas próprias contas de teste, sem propaganda e sem links.', aiDailyLimit: 6,
    mediaItems: [] as any[], mediaChance: 25,
  });

  async function reload() {
    setProfiles(await window.attozap.warmup.list());
    setLogs(await window.attozap.warmup.logs(selectedId || undefined, 300));
    if (selectedId) setRuntime(await window.attozap.warmup.runtime(selectedId));
  }
  async function loadGroups(accountId = form.accountId) { if (!accountId) { setGroups([]); return; } try { setGroups(await window.attozap.groups.list(accountId)); } catch { setGroups([]); } }
  useEffect(() => { void reload(); }, [selectedId]);
  useEffect(() => { if (!form.accountId && connected[0]?.id) setForm(current => ({ ...current, accountId: connected[0].id })); }, [accounts]);
  useEffect(() => { if (form.mode === 'direct') void loadGroups(); }, [form.accountId, form.mode]);
  useEffect(() => { const timer=setInterval(()=>setNow(Date.now()),1000); return()=>clearInterval(timer); }, []);
  useEffect(() => { if (!selectedId) { setRuntime(null); return; } const timer=setInterval(async()=>{ try { setRuntime(await window.attozap.warmup.runtime(selectedId)); setProfiles(await window.attozap.warmup.list()); setLogs(await window.attozap.warmup.logs(selectedId,120)); } catch {} },2000); return()=>clearInterval(timer); }, [selectedId]);

  const selected = useMemo(() => profiles.find(item => item.id === selectedId), [profiles, selectedId]);
  const accountById = (id?: string) => accounts.find(account => account.id === id);
  const countdown = runtime?.nextRunAt ? Math.max(0, Math.ceil((runtime.nextRunAt-now)/1000)) : 0;
  const runtimeFailed = runtime?.phase === 'error';
  const runtimeRunning = selected?.status === 'running' && !runtimeFailed;
  const scheduledPause = selected?.status === 'running' && runtime?.phase === 'paused';
  const activeWindow = selected ? `${hourLabel(selected.active_hour_start)}–${hourLabel(selected.active_hour_end, true)}` : '';
  function load(profile: any) { setSelectedId(profile.id); setForm({ mode: profile.mode || 'direct', peerAccountIds: profile.peer_account_ids || [], accountId: profile.account_id, name: profile.name, targets: (profile.targets ?? []).join('\n'), messages: (profile.messages ?? []).join('\n'), minDelaySeconds: profile.min_delay_seconds, maxDelaySeconds: profile.max_delay_seconds, dailyLimit: profile.daily_limit, activeHourStart: profile.active_hour_start, activeHourEnd: profile.active_hour_end, messageSource: profile.message_source || 'library', aiProvider: profile.ai_provider || 'xai', aiModel: profile.ai_model || '', aiPrompt: profile.ai_prompt || '', aiDailyLimit: profile.ai_daily_limit || 6, mediaItems: profile.media_items || [], mediaChance: profile.media_chance ?? 25 }); }
  function reset() { setSelectedId(''); setRuntime(null); setForm({ mode:'direct',peerAccountIds:[],accountId:connected[0]?.id??'',name:'Aquecimento controlado',targets:'',messages:'Olá! Tudo certo por aí?\nComo está seu dia?',minDelaySeconds:300,maxDelaySeconds:900,dailyLimit:12,activeHourStart:9,activeHourEnd:20,messageSource:'library',aiProvider:'xai',aiModel:'',aiPrompt:'Conversa casual curta entre minhas próprias contas de teste, sem propaganda e sem links.',aiDailyLimit:6,mediaItems:[],mediaChance:25 }); }
  function addOwnAccount(account:any){if(!account?.phone){setError('Essa conta ainda não possui número resolvido. Conecte-a primeiro.');return;}setForm(v=>({...v,targets:[...lines(v.targets),account.phone].filter((x,i,a)=>a.indexOf(x)===i).join('\n')}));}
  function togglePeer(accountId:string){setForm(v=>({...v,peerAccountIds:v.peerAccountIds.includes(accountId)?v.peerAccountIds.filter(id=>id!==accountId):[...v.peerAccountIds,accountId]}));}
  function addGroup(group:any){const jid=group.group_id??group.id;if(!jid)return;setForm(v=>({...v,targets:[...lines(v.targets),jid].filter((x,i,a)=>a.indexOf(x)===i).join('\n')}));}
  async function pickMedia(){const paths=await window.attozap.files.pick({multiple:true,filters:[{name:'Mídias e documentos',extensions:['jpg','jpeg','png','gif','webp','mp4','mov','mkv','webm','mp3','ogg','opus','wav','m4a','aac','pdf','doc','docx','xls','xlsx','txt','zip']} ]});if(!paths?.length)return;setForm(v=>({...v,mediaItems:[...v.mediaItems,...paths.filter((path:string)=>!v.mediaItems.some((item:any)=>item.path===path)).map((path:string)=>({path,type:mediaType(path),ptt:mediaType(path)==='audio'}))].slice(0,30)}));}
  function removeMedia(path:string){setForm(v=>({...v,mediaItems:v.mediaItems.filter((item:any)=>item.path!==path)}));}
  async function save(){setBusy(true);setError('');try{const payload={...form,accountId:form.mode==='pool'?(form.peerAccountIds[0]||form.accountId):form.accountId,targets:lines(form.targets),messages:lines(form.messages)};const profile=selectedId?await window.attozap.warmup.update(selectedId,payload):await window.attozap.warmup.create(payload);setSelectedId(profile.id);await reload();}catch(e:any){setError(e?.message??String(e));}finally{setBusy(false);}}
  async function start(){if(!selectedId){setError('Salve o perfil antes de iniciar.');return;}setError('');try{await window.attozap.warmup.start(selectedId);await reload();}catch(e:any){setError(e?.message??String(e));}}
  async function stop(){if(selectedId){await window.attozap.warmup.stop(selectedId);setRuntime(null);await reload();}}
  async function remove(){if(selectedId){await window.attozap.warmup.remove(selectedId);reset();await reload();}}
  const hasContent=lines(form.messages).length>0||form.mediaItems.length>0||form.messageSource==='ai';
  const canSave=form.mode==='pool'?form.peerAccountIds.length>=2&&hasContent:Boolean(form.accountId)&&lines(form.targets).length>0&&hasContent;

  return <div className="page-stack">
    <div className="page-head"><div><span className="kicker">WARMUP ENGINE</span><h2>Sistema de aquecimento</h2><p>Rodízio real entre sessões, digitação simulada, multimídia e acompanhamento do processo em tempo real.</p></div><button className="button ghost" onClick={()=>void reload()}><RefreshCw size={15}/> Atualizar</button></div>
    {error&&<div className="notice error">{error}</div>}
    <div className="notice info"><b>Pool determinístico:</b> cada turno usa o próximo socket da lista e grava o índice. Com 2 contas: A → B, depois B → A. Com 3: A → B, B → C, C → A. O contador reinicia somente depois da rodada completa.</div>

    {selected&&<section className={`card warmup-live ${runtimeRunning?'is-running':''} ${runtimeFailed?'is-error':''}`}>
      <div className="warmup-live-main"><div className="warmup-live-icon"><Activity size={24}/></div><div><span className="kicker">MONITOR EM TEMPO REAL</span><h3>{scheduledPause?'Programado':phaseLabel(runtime?.phase || (selected.status==='running'?'starting':'stopped'))}</h3><p>{scheduledPause ? `Aguardando a janela local ${activeWindow}` : runtimeFailed ? 'O último turno falhou; o próximo retry será agendado.' : runtime?.senderName ? <><b>{runtime.senderName}</b> → <b>{runtime.recipientName || runtime.target}</b></> : 'Aguardando início de um turno'}</p></div></div>
      <div className="warmup-live-stats"><div><Timer size={17}/><span>{scheduledPause?'Retoma em':'Próximo evento'}</span><b>{runtimeRunning?clock(countdown):'--:--'}</b></div><div><MessageCircleMore size={17}/><span>Rodada</span><b>{runtime?.roundPosition&&runtime?.roundSize?`${runtime.roundPosition}/${runtime.roundSize}`:'—'}</b></div><div><Flame size={17}/><span>Hoje</span><b>{selected.sent_today}/{selected.daily_limit}</b></div></div>
      <div className="warmup-window-note">Janela configurada: <b>{activeWindow}</b> · horário local do computador</div>
      {(runtime?.lastMessage||runtime?.lastMediaName||runtime?.lastError)&&<div className={`warmup-current ${runtime?.lastError?'has-error':''}`}><b>{runtime?.lastError?'Diagnóstico':'Turno atual'}</b><span>{runtime?.lastError || (runtime?.lastMediaName?`${runtime.lastMediaType}: ${runtime.lastMediaName}${runtime.lastMessage?` · ${runtime.lastMessage}`:''}`:runtime?.lastMessage)}</span></div>}
    </section>}

    <div className="warmup-layout">
      <section className="card warmup-editor"><div className="card-head"><div><h3>{selectedId?'Editar perfil':'Novo perfil'}</h3><p>Configure participantes, conteúdo e ritmo.</p></div><Flame size={19}/></div>
        <div className="field"><label>Modo de aquecimento</label><div className="member-mode"><button className={form.mode==='direct'?'active':''} onClick={()=>setForm(v=>({...v,mode:'direct'}))}><Flame size={14}/> Direto / grupos</button><button className={form.mode==='pool'?'active':''} onClick={()=>setForm(v=>({...v,mode:'pool'}))}><MessageCircleMore size={14}/> Pool de contas</button></div></div>
        <div className="field"><label>Nome do perfil</label><input value={form.name} onChange={e=>setForm(v=>({...v,name:e.target.value}))}/></div>
        {form.mode==='pool'?<><div className="field"><label>Contas participantes — marque 2 ou mais</label><div className="warmup-target-picker">{connected.map(account=><button type="button" key={account.id} className={form.peerAccountIds.includes(account.id)?'active':''} onClick={()=>togglePeer(account.id)}><span className="online-dot"/><b>{account.name}</b><small>{account.phone?`+${account.phone}`:'número não resolvido'}</small></button>)}</div></div><div className="notice info">Ordem: {form.peerAccountIds.length>=2?form.peerAccountIds.map(id=>accountById(id)?.name||id).join(' → ')+` → ${accountById(form.peerAccountIds[0])?.name||''}`:'selecione as contas acima'}</div></>:<><div className="form-grid two"><div className="field"><label>Conta que envia</label><select value={form.accountId} onChange={e=>setForm(v=>({...v,accountId:e.target.value}))}><option value="">Selecione...</option>{connected.map(account=><option key={account.id} value={account.id}>{account.name}</option>)}</select></div><div className="field"><label>Adicionar minhas contas</label><div className="warmup-target-picker compact">{accounts.filter(a=>a.phone).map(account=><button type="button" key={account.id} onClick={()=>addOwnAccount(account)}><span className="online-dot"/><b>{account.name}</b><small>+{account.phone}</small></button>)}</div></div></div><div className="field"><label>Adicionar grupos sincronizados</label><div className="warmup-target-picker">{groups.slice(0,80).map(group=><button type="button" key={group.group_id??group.id} onClick={()=>addGroup(group)}><Users size={13}/><b>{group.subject}</b><small>{group.member_count??group.size??0} membros</small></button>)}</div></div><div className="field"><label>Destinos selecionados</label><textarea className="tall-area" value={form.targets} onChange={e=>setForm(v=>({...v,targets:e.target.value}))}/></div></>}

        <div className="field"><label>Fonte das mensagens</label><div className="member-mode"><button className={form.messageSource==='library'?'active':''} onClick={()=>setForm(v=>({...v,messageSource:'library'}))}>Biblioteca local</button><button className={form.messageSource==='ai'?'active':''} onClick={()=>setForm(v=>({...v,messageSource:'ai'}))}><Sparkles size={14}/> IA + fallback</button></div></div>
        <div className="field"><label>Mensagens prontas — uma por linha</label><textarea value={form.messages} onChange={e=>setForm(v=>({...v,messages:e.target.value}))}/></div>
        <div className="warmup-media-box"><div className="card-head"><div><h3><Paperclip size={15}/> Biblioteca de mídias</h3><p>Imagem, vídeo, áudio/voz, figurinha e documentos. Até 30 arquivos.</p></div><button className="button ghost tiny" onClick={()=>void pickMedia()}><Paperclip size={14}/> Adicionar arquivos</button></div><div className="form-grid two"><div className="field"><label>Chance de usar mídia em cada turno (%)</label><input type="number" min="0" max="100" value={form.mediaChance} onChange={e=>setForm(v=>({...v,mediaChance:Number(e.target.value)}))}/></div><div className="field"><label>Biblioteca</label><small>{form.mediaItems.length} arquivo(s) selecionado(s). Áudios são enviados como voz/PTT por padrão.</small></div></div><div className="warmup-media-list">{form.mediaItems.map((item:any)=><div key={item.path}>{mediaIcon(item.type||mediaType(item.path))}<span><b>{fileName(item.path)}</b><small>{item.type||mediaType(item.path)}{(item.type||mediaType(item.path))==='audio'?' · PTT':''}</small></span><button onClick={()=>removeMedia(item.path)} title="Remover"><X size={14}/></button></div>)}{!form.mediaItems.length&&<div className="empty-inline">Nenhuma mídia adicionada. O perfil pode funcionar somente com textos.</div>}</div></div>

        {form.messageSource==='ai'&&<div className="ai-warmup-box"><div className="card-head"><div><h3><Bot size={15}/> IA para conversas</h3><p>Chave configurada localmente.</p></div></div><div className="form-grid three"><div className="field"><label>Provedor</label><select value={form.aiProvider} onChange={e=>setForm(v=>({...v,aiProvider:e.target.value as any}))}><option value="xai">xAI / Grok</option><option value="poolside">Poolside</option></select></div><div className="field"><label>Modelo</label><input value={form.aiModel} onChange={e=>setForm(v=>({...v,aiModel:e.target.value}))}/></div><div className="field"><label>Máx. IA/dia</label><input type="number" min="1" max="12" value={form.aiDailyLimit} onChange={e=>setForm(v=>({...v,aiDailyLimit:Number(e.target.value)}))}/></div></div><div className="field"><label>Contexto</label><textarea value={form.aiPrompt} onChange={e=>setForm(v=>({...v,aiPrompt:e.target.value}))}/></div></div>}
        <div className="form-grid three"><div className="field"><label>Intervalo mín. (s)</label><input type="number" min="180" value={form.minDelaySeconds} onChange={e=>setForm(v=>({...v,minDelaySeconds:Number(e.target.value)}))}/></div><div className="field"><label>Intervalo máx. (s)</label><input type="number" min="180" value={form.maxDelaySeconds} onChange={e=>setForm(v=>({...v,maxDelaySeconds:Number(e.target.value)}))}/></div><div className="field"><label>Limite diário</label><input type="number" min="1" max="30" value={form.dailyLimit} onChange={e=>setForm(v=>({...v,dailyLimit:Number(e.target.value)}))}/></div></div>
        <div className="form-grid two"><div className="field"><label>Início da janela</label><input type="number" min="0" max="23" value={form.activeHourStart} onChange={e=>setForm(v=>({...v,activeHourStart:Number(e.target.value)}))}/></div><div className="field"><label>Fim da janela</label><input type="number" min="1" max="24" value={form.activeHourEnd} onChange={e=>setForm(v=>({...v,activeHourEnd:Number(e.target.value)}))}/></div></div>
        <div className="head-actions"><button className="button primary" disabled={busy||!canSave} onClick={()=>void save()}><Save size={15}/> {selectedId?'Salvar alterações':'Criar perfil'}</button><button className="button ghost" onClick={reset}>Novo</button>{selectedId&&<button className="button ghost danger" onClick={()=>void remove()}><Trash2 size={15}/> Excluir</button>}</div>
      </section>
      <section className="card warmup-profiles"><div className="card-head"><div><h3>Perfis</h3><p>{profiles.length} configurado(s)</p></div></div><div className="warmup-profile-list">{profiles.map(profile=><button key={profile.id} onClick={()=>load(profile)} className={selectedId===profile.id?'active':''}><span className={`warmup-fire ${profile.status==='running'?'running':''}`}><Flame size={17}/></span><span className="grow"><b>{profile.name}</b><small>{profile.mode==='pool'?`${profile.peer_account_ids?.length||0} contas`:`${profile.targets.length} destinos`} · {profile.sent_today}/{profile.daily_limit} hoje · {profile.media_items?.length||0} mídias</small></span><span className={`status-chip ${profile.status}`}>{profile.status}</span></button>)}</div>{selected&&<div className="warmup-controls"><button className="button primary" disabled={selected.status==='running'} onClick={()=>void start()}><Play size={15}/> Iniciar</button><button className="button ghost" disabled={selected.status!=='running'} onClick={()=>void stop()}><Square size={15}/> Parar</button></div>}</section>
    </div>
    <section className="card"><div className="card-head"><div><h3>Timeline do aquecimento</h3><p>Cada tentativa mostra qual sessão enviou, para quem, conteúdo e falhas.</p></div></div><div className="audit-list">{logs.map(log=><div key={log.id}><span className={`audit-dot ${log.status}`}/><div><b>{accountById(log.sender_account_id)?.name||log.sender_account_id||'conta'} → {accountById(log.recipient_account_id)?.name||log.target_jid||'destino'} <span className="status-chip">{log.source||'local'}</span></b><small>{log.message||'Sem texto'}{log.error?` · ${log.error}`:''}</small></div><time>{toLocalDateTime(log.created_at)}</time></div>)}</div></section>
  </div>;
}

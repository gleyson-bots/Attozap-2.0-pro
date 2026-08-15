import { useEffect, useMemo, useState } from 'react';
import { FileAudio, FileText, Image, MapPin, Pause, Play, Plus, Send, ShieldCheck, Square, Sticker, Users, Video } from 'lucide-react';
import { campaignPercent, parseRecipients } from '../lib';

type Mode = 'contact' | 'group';

function fileName(path: string) { return path.split(/[\\/]/).pop() ?? path; }

export function SenderPage({ mode, accounts, campaigns, reloadCampaigns }: { mode: Mode; accounts: any[]; campaigns: any[]; reloadCampaigns: () => Promise<void> }) {
  const connected = accounts.filter(account => account.status === 'connected');
  const [accountId, setAccountId] = useState(connected[0]?.id ?? '');
  const [name, setName] = useState(mode === 'group' ? 'Envio para grupos' : 'Nova campanha');
  const [message, setMessage] = useState('Olá {name}!');
  const [rawRecipients, setRawRecipients] = useState('');
  const [groups, setGroups] = useState<any[]>([]);
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const [parts, setParts] = useState<any[]>([]);
  const [fileType, setFileType] = useState<'image'|'video'|'document'|'audio'|'sticker'>('image');
  const [minDelay, setMinDelay] = useState(1500);
  const [maxDelay, setMaxDelay] = useState(3000);
  const [filterBefore, setFilterBefore] = useState(false);
  const [friendlyOnly, setFriendlyOnly] = useState(false);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!accountId && connected[0]?.id) setAccountId(connected[0].id);
  }, [accounts, accountId, connected]);

  useEffect(() => {
    const off = window.attozap.campaigns.onProgress(() => void reloadCampaigns());
    const offError = window.attozap.campaigns.onError((payload: any) => setError(payload.message));
    return () => { off?.(); offError?.(); };
  }, [reloadCampaigns]);

  useEffect(() => {
    if (mode !== 'group' || !accountId) return;
    void (async () => {
      try {
        let list = await window.attozap.groups.list(accountId);
        if (!list.length) { await window.attozap.groups.sync(accountId); list = await window.attozap.groups.list(accountId); }
        setGroups(list);
      } catch { setGroups([]); }
    })();
  }, [mode, accountId]);

  const recipients = useMemo(() => mode === 'contact'
    ? parseRecipients(rawRecipients)
    : selectedGroups.map(groupId => ({ target: groupId, name: groups.find(g => (g.group_id ?? g.id) === groupId)?.subject ?? 'Grupo' })),
  [mode, rawRecipients, selectedGroups, groups]);

  async function addFile() {
    const paths = await window.attozap.files.pick({ multiple: true });
    if (!paths?.length) return;
    setParts(current => [...current, ...paths.map((path: string) => ({
      type: fileType,
      input: { path, fileName: fileName(path), ptt: fileType === 'audio' },
    }))]);
  }

  async function createAndStart() {
    if (!accountId) { setError('Conecte e selecione uma conta do WhatsApp.'); return; }
    if (!recipients.length) { setError(mode === 'contact' ? 'Cole pelo menos um número.' : 'Selecione pelo menos um grupo.'); return; }
    if (!message.trim() && !parts.length) { setError('Adicione uma mensagem ou anexo.'); return; }
    setCreating(true); setError('');
    try {
      const campaign = await window.attozap.campaigns.create({
        accountId, name, targetType: mode, messageTemplate: message, recipients, parts,
        options: { minDelayMs: minDelay, maxDelayMs: maxDelay, filterBeforeSend: mode === 'contact' && filterBefore, skipBlocked: true, friendlyOnly: mode === 'contact' && friendlyOnly },
      });
      await reloadCampaigns();
      await window.attozap.campaigns.start(campaign.id);
    } catch (e: any) { setError(e?.message ?? String(e)); }
    finally { setCreating(false); }
  }

  const relevantCampaigns = campaigns.filter(item => item.target_type === mode).slice(0, 20);

  return <div className="page-stack">
    <div className="page-head"><div><span className="kicker">{mode === 'contact' ? 'CONTACT SENDER' : 'GROUP SENDER'}</span><h2>{mode === 'contact' ? 'Envio para contatos' : 'Envio para grupos'}</h2><p>Campanhas sequenciais com fila, pausa, stop, anexos e personalização.</p></div><span className="safety-pill"><ShieldCheck size={15}/> Blocklist sempre respeitada</span></div>
    {error && <div className="notice error">{error}</div>}

    <div className="sender-layout">
      <section className="card composer-card">
        <div className="section-title"><div><span>01</span><div><h3>Mensagem</h3><p>Conteúdo e anexos da campanha</p></div></div></div>
        <div className="form-grid two"><div className="field"><label>Conta</label><select value={accountId} onChange={e => setAccountId(e.target.value)}><option value="">Selecione...</option>{connected.map(account => <option key={account.id} value={account.id}>{account.name} {account.phone ? `(+${account.phone})` : ''}</option>)}</select></div><div className="field"><label>Nome da campanha</label><input value={name} onChange={e => setName(e.target.value)}/></div></div>
        <div className="field"><label>Mensagem</label><textarea className="message-box" value={message} onChange={e => setMessage(e.target.value)} placeholder="Digite a mensagem..."/><div className="variable-row"><span>Variáveis:</span><button onClick={() => setMessage(v => v + ' {name}')}>{'{name}'}</button><button onClick={() => setMessage(v => v + ' {phone}')}>{'{phone}'}</button><small>Também aceita {'{{campo}}'} das colunas importadas.</small></div></div>

        <div className="attachment-builder">
          <div className="field compact"><label>Tipo de anexo</label><select value={fileType} onChange={e => setFileType(e.target.value as any)}><option value="image">Imagem</option><option value="video">Vídeo</option><option value="document">Documento</option><option value="audio">Áudio / PTT</option><option value="sticker">Sticker</option></select></div>
          <button className="button ghost" onClick={() => void addFile()}><Plus size={16}/> Adicionar arquivo</button>
        </div>
        {!!parts.length && <div className="parts-list">{parts.map((part, index) => <div key={`${part.input?.path}-${index}`}><span className="part-icon">{part.type === 'image' ? <Image size={15}/> : part.type === 'video' ? <Video size={15}/> : part.type === 'audio' ? <FileAudio size={15}/> : part.type === 'sticker' ? <Sticker size={15}/> : <FileText size={15}/>}</span><span>{fileName(part.input.path)}</span><small>{part.type}</small><button onClick={() => setParts(current => current.filter((_, i) => i !== index))}>×</button></div>)}</div>}

        <details className="advanced"><summary>Adicionar localização, contato ou enquete</summary><AdvancedParts onAdd={part => setParts(current => [...current, part])}/></details>
      </section>

      <section className="card targets-card">
        <div className="section-title"><div><span>02</span><div><h3>Destinatários</h3><p>{recipients.length} selecionado(s)</p></div></div></div>
        {mode === 'contact' ? <>
          <div className="field"><label>Números / contatos</label><textarea className="recipients-box" value={rawRecipients} onChange={e => setRawRecipients(e.target.value)} placeholder={'5511999999999;Maria;cidade=São Paulo\n5511888888888;João;cidade=Campinas'}/><small>Formato: número;nome;campo=valor. Uma linha por contato.</small></div>
          <label className="check-row"><input type="checkbox" checked={filterBefore} onChange={e => setFilterBefore(e.target.checked)}/><span><b>Filtrar números antes de enviar</b><small>Consulta todos os números antes da campanha.</small></span></label>
          <label className="check-row"><input type="checkbox" checked={friendlyOnly} onChange={e => setFriendlyOnly(e.target.checked)}/><span><b>Somente Friendly List</b><small>Ignora contatos que não estejam marcados como amigáveis.</small></span></label>
        </> : <div className="group-picker">{groups.length === 0 ? <div className="empty mini"><Users size={24}/><p>Sincronize os grupos na ferramenta de grupos.</p></div> : groups.map(group => { const id = group.group_id ?? group.id; return <label key={id}><input type="checkbox" checked={selectedGroups.includes(id)} onChange={e => setSelectedGroups(current => e.target.checked ? [...current,id] : current.filter(value => value !== id))}/><span><b>{group.subject}</b><small>{group.member_count ?? group.size ?? 0} membros</small></span></label> })}</div>}

        <div className="delay-box"><div className="field"><label>Delay mínimo (ms)</label><input type="number" min="500" value={minDelay} onChange={e => setMinDelay(Number(e.target.value))}/></div><div className="field"><label>Delay máximo (ms)</label><input type="number" min="500" value={maxDelay} onChange={e => setMaxDelay(Number(e.target.value))}/></div></div>
        <button className="button primary big full" disabled={creating || !connected.length} onClick={() => void createAndStart()}><Send size={18}/>{creating ? 'Preparando...' : `Iniciar envio para ${recipients.length}`}</button>
        {!connected.length && <small className="warning-text">Conecte uma conta antes de iniciar uma campanha.</small>}
      </section>
    </div>

    <section className="card campaigns-card"><div className="card-head"><div><h3>Campanhas recentes</h3><p>Acompanhe o andamento e controle a fila.</p></div></div><div className="campaign-list">{!relevantCampaigns.length && <div className="empty mini"><Send size={24}/><p>Nenhuma campanha criada ainda.</p></div>}{relevantCampaigns.map(campaign => <CampaignRow key={campaign.id} campaign={campaign} reload={reloadCampaigns}/>)}</div></section>
  </div>;
}

function CampaignRow({ campaign, reload }: { campaign: any; reload: () => Promise<void> }) {
  const pct = campaignPercent(campaign);
  async function control(action: 'pause'|'resume'|'stop'|'start') { await window.attozap.campaigns[action](campaign.id); await reload(); }
  return <div className="campaign-row"><div className="campaign-main"><div><strong>{campaign.name}</strong><span>{campaign.sent} enviados · {campaign.failed} falhas · {campaign.skipped} ignorados · {campaign.total} total</span></div><span className={`status-chip ${campaign.status}`}>{campaign.status}</span></div><div className="campaign-progress"><i style={{width:`${pct}%`}}/><span>{pct}%</span></div><div className="campaign-controls">{campaign.status === 'running' && <button className="icon-button" onClick={() => void control('pause')} title="Pausar"><Pause size={15}/></button>}{campaign.status === 'paused' && <button className="icon-button" onClick={() => void control('resume')} title="Continuar"><Play size={15}/></button>}{['draft','stopped','failed'].includes(campaign.status) && <button className="icon-button" onClick={() => void control('start')} title="Iniciar"><Play size={15}/></button>}{['running','paused','stopping'].includes(campaign.status) && <button className="icon-button danger" onClick={() => void control('stop')} title="Parar"><Square size={15}/></button>}</div></div>;
}

function AdvancedParts({ onAdd }: { onAdd: (part: any) => void }) {
  const [lat, setLat] = useState(''); const [lng, setLng] = useState(''); const [locationName, setLocationName] = useState('');
  const [contactName, setContactName] = useState(''); const [contactPhone, setContactPhone] = useState('');
  const [pollName, setPollName] = useState(''); const [pollValues, setPollValues] = useState('');
  return <div className="advanced-grid">
    <div className="mini-builder"><div className="builder-title"><MapPin size={15}/><b>Localização</b></div><input placeholder="Nome do local" value={locationName} onChange={e=>setLocationName(e.target.value)}/><div className="inline-inputs"><input placeholder="Latitude" value={lat} onChange={e=>setLat(e.target.value)}/><input placeholder="Longitude" value={lng} onChange={e=>setLng(e.target.value)}/></div><button className="button tiny" onClick={()=>{const latitude=Number(lat),longitude=Number(lng);if(Number.isFinite(latitude)&&Number.isFinite(longitude)) onAdd({type:'location',input:{latitude,longitude,name:locationName}})}}>Adicionar</button></div>
    <div className="mini-builder"><div className="builder-title"><Users size={15}/><b>Contato</b></div><input placeholder="Nome" value={contactName} onChange={e=>setContactName(e.target.value)}/><input placeholder="Telefone" value={contactPhone} onChange={e=>setContactPhone(e.target.value)}/><button className="button tiny" onClick={()=>contactPhone && onAdd({type:'contact',input:{displayName:contactName||contactPhone,phone:contactPhone}})}>Adicionar</button></div>
    <div className="mini-builder"><div className="builder-title"><Plus size={15}/><b>Enquete</b></div><input placeholder="Pergunta" value={pollName} onChange={e=>setPollName(e.target.value)}/><textarea placeholder={'Opção 1\nOpção 2'} value={pollValues} onChange={e=>setPollValues(e.target.value)}/><button className="button tiny" onClick={()=>{const values=pollValues.split(/\r?\n/).map(v=>v.trim()).filter(Boolean);if(pollName&&values.length>=2)onAdd({type:'poll',input:{name:pollName,values,selectableCount:1}})}}>Adicionar</button></div>
  </div>;
}

import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, FileAudio, FileText, Gauge, Image, MapPin, Pause, Play, Plus, Send, ShieldCheck, Square, Sticker, TestTube2, Trash2, Users, Video } from 'lucide-react';
import { campaignPercent, parseRecipients } from '../lib';

type Mode = 'contact' | 'group';
type MessageMode = 'all' | 'rotate';
type CadenceProfile = 'light'|'moderate'|'extreme'|'custom';

const cadenceProfiles: Record<CadenceProfile, { label: string; description: string; min: number; max: number; switchAfter: number }> = {
  light: { label: 'Leve', description: 'Cadência espaçada para operações pequenas.', min: 45_000, max: 90_000, switchAfter: 10 },
  moderate: { label: 'Moderado', description: 'Equilíbrio entre velocidade e intervalo.', min: 20_000, max: 45_000, switchAfter: 8 },
  extreme: { label: 'Extremo', description: 'Cadência curta com aviso e proteções mantidas.', min: 8_000, max: 18_000, switchAfter: 5 },
  custom: { label: 'Personalizado', description: 'Defina manualmente os intervalos.', min: 20_000, max: 45_000, switchAfter: 8 },
};

function fileName(path?: string) {
  const value = String(path ?? '');
  return value.split(/[\\/]/).pop() ?? value;
}
const TESTABLE_MEDIA_TYPES = new Set(['image', 'video', 'document', 'audio', 'sticker']);
const TESTABLE_RICH_TYPES = new Set(['location', 'contact', 'poll']);
function previewTemplate(template: string, recipient: any) {
  const hour = new Date().getHours();
  const saudacao = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';
  const displayName = String(recipient?.pushName ?? recipient?.name ?? '').trim();
  const firstName = displayName.split(/\s+/)[0] || '';
  const variables = Object.fromEntries(Object.entries(recipient?.variables ?? {}).map(([key, value]) => [key, String(value ?? '')]));
  const values: Record<string,string> = { name: displayName, nome: displayName, pushname: displayName, pushName: displayName, push_name: displayName, primeiro_nome: firstName, saudacao, phone: String(recipient?.variables?.phone ?? ''), jid: String(recipient?.target ?? ''), ...variables };
  return String(template ?? '').replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (_m,key) => values[key] ?? '').replace(/\{([\w.-]+)\}/g, (_m,key) => values[key] ?? '');
}
function seconds(ms: number) { return Math.max(0, Math.round(ms / 1000)); }
function sleep(ms: number) { return new Promise(resolve => window.setTimeout(resolve, ms)); }
function isConfirmed(status?: string) { return ['sent','delivered','read','played'].includes(String(status ?? '')); }
async function waitForDelivery(accountId: string, messageId: string, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  let last: any;
  while (Date.now() < deadline) {
    last = await window.attozap.webchat.messageStatus(accountId, messageId);
    if (last?.status === 'failed') throw new Error(last.error || 'O WhatsApp rejeitou a mensagem de teste.');
    if (isConfirmed(last?.status)) return last;
    await sleep(300);
  }
  return last;
}

export function SenderPage({ mode, accounts, campaigns, reloadCampaigns }: { mode: Mode; accounts: any[]; campaigns: any[]; reloadCampaigns: () => Promise<void> }) {
  const connected = accounts.filter(account => account.status === 'connected');
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([]);
  const [name, setName] = useState(mode === 'group' ? 'Envio para grupos' : 'Nova campanha');
  const [messages, setMessages] = useState<string[]>(['Olá {primeiro_nome}!']);
  const [messageMode, setMessageMode] = useState<MessageMode>('all');
  const [profile, setProfile] = useState<CadenceProfile>('moderate');
  const [rawRecipients, setRawRecipients] = useState('');
  const [groups, setGroups] = useState<any[]>([]);
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const [parts, setParts] = useState<any[]>([]);
  const [fileType, setFileType] = useState<'image'|'video'|'document'|'audio'|'sticker'>('image');
  const [minDelay, setMinDelay] = useState(cadenceProfiles.moderate.min);
  const [maxDelay, setMaxDelay] = useState(cadenceProfiles.moderate.max);
  const [switchAfter, setSwitchAfter] = useState(cadenceProfiles.moderate.switchAfter);
  const [filterBefore, setFilterBefore] = useState(false);
  const [friendlyOnly, setFriendlyOnly] = useState(false);
  const [error, setError] = useState('');
  const [testStatus, setTestStatus] = useState('');
  const [testKind, setTestKind] = useState<'info'|'success'>('info');
  const [creating, setCreating] = useState(false);
  const [testing, setTesting] = useState(false);

  const accountId = selectedAccountIds[0] ?? '';

  useEffect(() => {
    const available = new Set(connected.map(account => account.id));
    setSelectedAccountIds(current => {
      const valid = current.filter(id => available.has(id));
      return valid.length ? valid : connected[0]?.id ? [connected[0].id] : [];
    });
  }, [accounts]);

  useEffect(() => {
    if (profile === 'custom') return;
    const preset = cadenceProfiles[profile];
    setMinDelay(preset.min); setMaxDelay(preset.max); setSwitchAfter(preset.switchAfter);
  }, [profile]);

  useEffect(() => {
    const off = window.attozap.campaigns.onProgress(() => void reloadCampaigns());
    const offError = window.attozap.campaigns.onError((payload: any) => setError(`Falha em ${payload.target ?? 'campanha'}${payload.resolvedTarget ? ` (${payload.resolvedTarget})` : ''}: ${payload.message}`));
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
    : selectedGroups.map(groupId => ({ target: groupId, name: groups.find(group => (group.group_id ?? group.id) === groupId)?.subject ?? 'Grupo' })),
  [mode, rawRecipients, selectedGroups, groups]);

  const nonEmptyMessages = messages.map(value => value.trim()).filter(Boolean);

  function toggleAccount(id: string, checked: boolean) { setSelectedAccountIds(current => checked ? [...new Set([...current, id])] : current.filter(value => value !== id)); }
  function updateMessage(index: number, value: string) { setMessages(current => current.map((item, i) => i === index ? value : item)); }
  function addVariable(index: number, variable: string) { updateMessage(index, `${messages[index]} ${variable}`); }

  async function addFile() {
    const paths = await window.attozap.files.pick({ multiple: true });
    if (!paths?.length) return;
    const mimeByExtension: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', mp3: 'audio/mpeg', ogg: 'audio/ogg', opus: 'audio/ogg; codecs=opus', wav: 'audio/wav', m4a: 'audio/mp4', pdf: 'application/pdf' };
    setParts(current => [...current, ...paths.map((path: string) => { const name = fileName(path); const extension = String(name ?? '').split('.').pop()?.toLowerCase() ?? ''; return { type: fileType, input: { path, fileName: name, mimetype: mimeByExtension[extension], ptt: fileType === 'audio' } }; })]);
  }

  async function testFirstRecipient() {
    if (!accountId) { setError('Conecte e selecione uma conta.'); return; }
    if (!recipients[0]) { setError(mode === 'contact' ? 'Informe pelo menos um destinatário para testar.' : 'Selecione um grupo para testar.'); return; }
    const testPart = parts.find(part => TESTABLE_MEDIA_TYPES.has(String(part.type)) || TESTABLE_RICH_TYPES.has(String(part.type)));
    if (!nonEmptyMessages[0] && !testPart) { setError('Digite uma mensagem ou adicione um conteúdo para o teste.'); return; }
    if (testPart?.type === 'audio' && nonEmptyMessages.length) { setError('Áudio/PTT não suporta texto ou legenda. Deixe a mensagem vazia para testar o áudio.'); return; }
    setTesting(true); setError(''); setTestStatus(''); setTestKind('info');
    try {
      const recipient = recipients[0];
      const text = nonEmptyMessages[0] ? previewTemplate(nonEmptyMessages[0], recipient) : '';
      let receipt: any;
      if (!testPart) receipt = await window.attozap.webchat.sendText(accountId, recipient.target, text);
      else if (TESTABLE_MEDIA_TYPES.has(String(testPart.type))) receipt = await window.attozap.webchat.sendMedia(accountId, recipient.target, testPart.type, { ...testPart.input, ...(testPart.type === 'audio' || testPart.type === 'sticker' || !text ? {} : { caption: text }) });
      else if (testPart.type === 'location') receipt = await window.attozap.webchat.sendLocation(accountId, recipient.target, { ...testPart.input, latitude: Number(testPart.input?.latitude), longitude: Number(testPart.input?.longitude), name: previewTemplate(String(testPart.input?.name ?? ''), recipient) || undefined, address: previewTemplate(String(testPart.input?.address ?? ''), recipient) || undefined });
      else if (testPart.type === 'contact') receipt = await window.attozap.webchat.sendContact(accountId, recipient.target, { ...testPart.input, displayName: previewTemplate(String(testPart.input?.displayName ?? ''), recipient), phone: previewTemplate(String(testPart.input?.phone ?? ''), recipient), organization: previewTemplate(String(testPart.input?.organization ?? ''), recipient) || undefined });
      else {
        const values = Array.isArray(testPart.input?.values) ? testPart.input.values.map((value: unknown) => previewTemplate(String(value ?? ''), recipient)).filter(Boolean) : [];
        receipt = await window.attozap.webchat.sendPoll(accountId, recipient.target, { ...testPart.input, name: previewTemplate(String(testPart.input?.name ?? ''), recipient), values });
      }
      const target = receipt.resolvedTarget ?? receipt.remoteJid ?? recipient.target;
      const contentLabel = testPart?.type === 'location' ? 'Localização' : testPart?.type === 'contact' ? 'Contacto' : testPart?.type === 'poll' ? 'Enquete' : testPart ? 'Mídia' : 'Mensagem';
      setTestStatus(`${contentLabel} submetida para ${target}. Aguardando confirmação do WhatsApp…`);
      const confirmation = await waitForDelivery(accountId, receipt.id);
      if (isConfirmed(confirmation?.status)) {
        setTestKind('success');
        setTestStatus(`Teste confirmado · ${target} · ${confirmation.status} · ID ${receipt.id}`);
      } else {
        setTestKind('info');
        setTestStatus(`Teste submetido · ${target} · ACK ainda pendente · ID ${receipt.id}. Confira o status no WebChat/Health Center.`);
      }
    } catch (e: any) { setTestStatus(''); setError(e?.message ?? String(e)); }
    finally { setTesting(false); }
  }

  async function createAndStart() {
    if (!accountId) { setError('Conecte e selecione pelo menos uma conta do WhatsApp.'); return; }
    if (!recipients.length) { setError(mode === 'contact' ? 'Cole pelo menos um número.' : 'Selecione pelo menos um grupo.'); return; }
    if (!nonEmptyMessages.length && !parts.length) { setError('Adicione uma mensagem ou anexo.'); return; }
    if (maxDelay < minDelay) { setError('O delay máximo precisa ser maior ou igual ao mínimo.'); return; }
    const hasAudio = parts.some(part => part.type === 'audio');
    if (hasAudio && nonEmptyMessages.length) { setError('Áudio/PPG não suporta texto ou legenda. Remova o texto da campanha antes de iniciar o disparo de áudio.'); return; }
    setCreating(true); setError(''); setTestStatus('');
    try {
      const campaign = await window.attozap.campaigns.create({
        accountId, accountIds: selectedAccountIds, name, targetType: mode, messageTemplates: nonEmptyMessages, messageMode, recipients, parts,
        options: { profile, minDelayMs: minDelay, maxDelayMs: maxDelay, switchAccountAfterRecipients: selectedAccountIds.length > 1 ? switchAfter : 0, filterBeforeSend: mode === 'contact' && filterBefore, skipBlocked: true, friendlyOnly: mode === 'contact' && friendlyOnly },
      });
      await reloadCampaigns();
      await window.attozap.campaigns.start(campaign.id);
      setTestKind('info');
      setTestStatus(`Campanha ${campaign.name} aceita pela fila. Os contadores só avançam após confirmação do WhatsApp.`);
      setTimeout(() => void reloadCampaigns(), 500);
    } catch (e: any) { setError(e?.message ?? String(e)); }
    finally { setCreating(false); }
  }

  const relevantCampaigns = campaigns.filter(item => item.target_type === mode).slice(0, 12);
  const hasTestablePart = parts.some(part => TESTABLE_MEDIA_TYPES.has(String(part.type)) || TESTABLE_RICH_TYPES.has(String(part.type)));
  const canTest = Boolean(accountId && recipients.length && (nonEmptyMessages.length || hasTestablePart) && !(parts.some(part => part.type === 'audio') && nonEmptyMessages.length));

  return <div className="page-stack">
    <div className="page-head"><div><span className="kicker">{mode === 'contact' ? 'CONTACT SENDER' : 'GROUP SENDER'}</span><h2>{mode === 'contact' ? 'Envio para contatos' : 'Envio para grupos'}</h2><p>Campanhas com perfis de cadência, múltiplas mensagens, contas, mídia, documentos e resolução JID/LID.</p></div><span className="safety-pill"><ShieldCheck size={15}/> Blocklist sempre respeitada</span></div>
    {error && <div className="notice error">{error}</div>}
    {testStatus && <div className={`notice ${testKind}`}>{testKind === 'success' ? <CheckCircle2 size={15}/> : <TestTube2 size={15}/>} {testStatus}</div>}
    {profile === 'extreme' && <div className="notice warning"><AlertTriangle size={16}/><div><b>Perfil Extremo</b><span>Usa intervalos menores. Erros, blocklist, contas desconectadas e limites continuam sendo respeitados. Use apenas em destinatários que esperam seu contato.</span></div></div>}

    <section className="card cadence-card">
      <div className="section-title"><div><span><Gauge size={16}/></span><div><h3>Perfil de cadência</h3><p>Todos os perfis usam tempo aleatório dentro da faixa escolhida.</p></div></div></div>
      <div className="cadence-profiles">{(Object.keys(cadenceProfiles) as CadenceProfile[]).map(key => { const item = cadenceProfiles[key]; return <button key={key} className={profile === key ? 'active' : ''} onClick={() => setProfile(key)}><b>{item.label}</b><span>{key === 'custom' ? 'Manual' : `${seconds(item.min)}–${seconds(item.max)}s`}</span><small>{item.description}</small></button>; })}</div>
      <div className="delay-box"><div className="field"><label>Random time mínimo (s)</label><input type="number" min="1" value={seconds(minDelay)} disabled={profile !== 'custom'} onChange={e => setMinDelay(Math.max(1000, Number(e.target.value) * 1000))}/></div><div className="field"><label>Random time máximo (s)</label><input type="number" min="1" value={seconds(maxDelay)} disabled={profile !== 'custom'} onChange={e => setMaxDelay(Math.max(1000, Number(e.target.value) * 1000))}/></div></div>
    </section>

    <div className="sender-layout">
      <section className="card composer-card">
        <div className="section-title"><div><span>01</span><div><h3>Mensagens & mídia</h3><p>Envie todas as mensagens ou use variações rotativas por destinatário.</p></div></div></div>
        <div className="form-grid two"><div className="field"><label>Nome da campanha</label><input value={name} onChange={e => setName(e.target.value)}/></div><div className="field"><label>Variações de mensagem</label><select value={messageMode} onChange={e => setMessageMode(e.target.value as MessageMode)}><option value="all">Enviar todas para cada destinatário</option><option value="rotate">Escolher uma variação por destinatário</option></select></div></div>
        <div className="message-variants">{messages.map((message, index) => <div className="message-variant" key={index}><div className="message-variant-head"><b>Mensagem {index + 1}</b><button className="icon-button danger" onClick={() => setMessages(current => current.length > 1 ? current.filter((_, i) => i !== index) : [''])} title="Remover texto"><Trash2 size={14}/></button></div><textarea className="message-box" value={message} onChange={e => updateMessage(index, e.target.value)} placeholder="Digite a mensagem..."/><div className="variable-row"><span>Variáveis:</span><button onClick={() => addVariable(index, '{name}')}>{'{name}'}</button><button onClick={() => addVariable(index, '{primeiro_nome}')}>{'{primeiro_nome}'}</button><button onClick={() => addVariable(index, '{saudacao}')}>{'{saudacao}'}</button><button onClick={() => addVariable(index, '{phone}')}>{'{phone}'}</button><small>Também aceita {'{{campo}}'} das colunas importadas.</small></div></div>)}<button className="button ghost" onClick={() => setMessages(current => [...current, ''])}><Plus size={15}/> Adicionar outra variação</button></div>
        <div className="attachment-builder"><div className="field compact"><label>Tipo de mídia/anexo</label><select value={fileType} onChange={e => setFileType(e.target.value as any)}><option value="image">Imagem</option><option value="video">Vídeo</option><option value="document">Documento</option><option value="audio">Áudio / PTT</option><option value="sticker">Sticker</option></select></div><button className="button ghost" onClick={() => void addFile()}><Plus size={16}/> Adicionar arquivos</button></div>{parts.some(part => part.type === 'audio') && <div className="notice warning sender-audio-notice"><FileAudio size={16}/><span>Áudio/PPG não aceita texto ou legenda. Para iniciar esta campanha, deixe todas as mensagens de texto vazias.</span></div>}
        {!!parts.length && <div className="parts-list">{parts.map((part, index) => <div key={`${part.input?.path}-${index}`}><span className="part-icon">{part.type === 'image' ? <Image size={15}/> : part.type === 'video' ? <Video size={15}/> : part.type === 'audio' ? <FileAudio size={15}/> : part.type === 'sticker' ? <Sticker size={15}/> : <FileText size={15}/>}</span><span>{fileName(part.input.path)}</span><small>{part.type}</small><button onClick={() => setParts(current => current.filter((_, i) => i !== index))}>×</button></div>)}</div>}
        <details className="advanced"><summary>Adicionar localização, contato ou enquete</summary><AdvancedParts onAdd={part => setParts(current => [...current, part])}/></details>
      </section>

      <section className="card targets-card">
        <div className="section-title"><div><span>02</span><div><h3>Contas & destinatários</h3><p>{recipients.length} selecionado(s)</p></div></div></div>
        <div className="field"><label>Contas conectadas</label><div className="group-picker account-picker">{connected.map(account => <label key={account.id}><input type="checkbox" checked={selectedAccountIds.includes(account.id)} onChange={e => toggleAccount(account.id, e.target.checked)}/><span><b>{account.name}</b><small>{account.phone ? `+${account.phone}` : 'Conectada'}</small></span></label>)}{!connected.length && <div className="empty mini"><Users size={22}/><p>Conecte uma conta primeiro.</p></div>}</div></div>
        {selectedAccountIds.length > 1 && <div className="field"><label>Trocar de conta a cada X destinatários</label><input type="number" min="1" value={switchAfter} onChange={e => setSwitchAfter(Math.max(1, Number(e.target.value)))}/><small>As contas selecionadas são usadas em sequência.</small></div>}
        {mode === 'contact' ? <><div className="field"><label>Números / contatos</label><textarea className="recipients-box" value={rawRecipients} onChange={e => setRawRecipients(e.target.value)} placeholder={'5511999999999;Maria;cidade=São Paulo\n5511888888888;João;cidade=Campinas'}/><small>Formato: número;nome;campo=valor. Também aceita PN JID e LID.</small></div><label className="check-row"><input type="checkbox" checked={filterBefore} onChange={e => setFilterBefore(e.target.checked)}/><span><b>Filtrar números antes de enviar</b><small>Consulta todos os números antes da campanha.</small></span></label><label className="check-row"><input type="checkbox" checked={friendlyOnly} onChange={e => setFriendlyOnly(e.target.checked)}/><span><b>Somente Friendly List</b><small>Ignora contatos que não estejam marcados como amigáveis.</small></span></label></> : <div className="group-picker">{groups.length === 0 ? <div className="empty mini"><Users size={24}/><p>Sincronize os grupos na ferramenta de grupos.</p></div> : groups.map(group => { const id = group.group_id ?? group.id; return <label key={id}><input type="checkbox" checked={selectedGroups.includes(id)} onChange={e => setSelectedGroups(current => e.target.checked ? [...current, id] : current.filter(value => value !== id))}/><span><b>{group.subject}</b><small>{group.member_count ?? group.size ?? 0} membros</small></span></label>; })}</div>}
        <div className="sender-actions"><button className="button ghost big" disabled={testing || creating || !canTest} onClick={() => void testFirstRecipient()}><TestTube2 size={17}/>{testing ? 'Aguardando ACK...' : 'Testar 1º destinatário'}</button><button className="button primary big" disabled={creating || !selectedAccountIds.length} onClick={() => void createAndStart()}><Send size={18}/>{creating ? 'Preparando...' : `Iniciar envio para ${recipients.length}`}</button></div>
        {!connected.length && <small className="warning-text">Conecte uma conta antes de iniciar uma campanha.</small>}
      </section>
    </div>

    <section className="card campaigns-card"><div className="card-head"><div><h3>Campanhas recentes</h3><p>Resumo rápido. Para acompanhamento detalhado use o Campaign Center.</p></div></div><div className="campaign-list">{!relevantCampaigns.length && <div className="empty mini"><Send size={24}/><p>Nenhuma campanha criada ainda.</p></div>}{relevantCampaigns.map(campaign => <CampaignRow key={campaign.id} campaign={campaign} reload={reloadCampaigns}/>)}</div></section>
  </div>;
}

function CampaignRow({ campaign, reload }: { campaign: any; reload: () => Promise<void> }) {
  const pct = campaignPercent(campaign);
  const labels: Record<string,string> = { draft:'Rascunho',running:'Em execução',paused:'Pausada',awaiting_ack:'Aguardando confirmação',completed:'Concluída',failed:'Com falhas',stopped:'Parada',stopping:'Parando',scheduled:'Agendada' };
  async function control(action: 'pause'|'resume'|'stop'|'start') { await window.attozap.campaigns[action](campaign.id); await reload(); }
  return <div className="campaign-row"><div className="campaign-main"><div><strong>{campaign.name}</strong><span>{campaign.sent} confirmados · {campaign.failed} falhas · {campaign.skipped} ignorados · {campaign.total} total</span></div><span className={`status-chip ${campaign.status}`}>{labels[campaign.status]||campaign.status}</span></div><div className="campaign-progress"><i style={{width:`${pct}%`}}/><span>{pct}%</span></div><div className="campaign-controls">{campaign.status === 'running' && <button className="icon-button" onClick={() => void control('pause')} title="Pausar"><Pause size={15}/></button>}{campaign.status === 'paused' && <button className="icon-button" onClick={() => void control('resume')} title="Continuar"><Play size={15}/></button>}{['draft','stopped','failed'].includes(campaign.status) && <button className="icon-button" onClick={() => void control('start')} title="Iniciar"><Play size={15}/></button>}{['running','paused','stopping'].includes(campaign.status) && <button className="icon-button danger" onClick={() => void control('stop')} title="Parar"><Square size={15}/></button>}</div></div>;
}

function AdvancedParts({ onAdd }: { onAdd: (part: any) => void }) {
  const [lat, setLat] = useState(''); const [lng, setLng] = useState(''); const [locationName, setLocationName] = useState(''); const [locationAddress, setLocationAddress] = useState('');
  const [contactName, setContactName] = useState(''); const [contactPhone, setContactPhone] = useState(''); const [contactOrg, setContactOrg] = useState('');
  const [pollName, setPollName] = useState(''); const [pollValues, setPollValues] = useState('');
  return <div className="advanced-grid">
    <div className="mini-builder"><div className="builder-title"><MapPin size={15}/><b>Localização</b></div><input placeholder="Nome do local" value={locationName} onChange={e=>setLocationName(e.target.value)}/><input placeholder="Endereço (opcional)" value={locationAddress} onChange={e=>setLocationAddress(e.target.value)}/><div className="inline-inputs"><input inputMode="decimal" placeholder="Latitude" value={lat} onChange={e=>setLat(e.target.value)}/><input inputMode="decimal" placeholder="Longitude" value={lng} onChange={e=>setLng(e.target.value)}/></div><button className="button tiny" onClick={()=>{const latitude=Number(String(lat ?? '').replace(',', '.')),longitude=Number(String(lng ?? '').replace(',', '.'));if(Number.isFinite(latitude)&&latitude>=-90&&latitude<=90&&Number.isFinite(longitude)&&longitude>=-180&&longitude<=180) onAdd({type:'location',input:{latitude,longitude,name:locationName || undefined,address:locationAddress || undefined}})}}>Adicionar</button></div>
    <div className="mini-builder"><div className="builder-title"><Users size={15}/><b>Contacto</b></div><input placeholder="Nome" value={contactName} onChange={e=>setContactName(e.target.value)}/><input inputMode="tel" placeholder="Telefone" value={contactPhone} onChange={e=>setContactPhone(e.target.value)}/><input placeholder="Organização (opcional)" value={contactOrg} onChange={e=>setContactOrg(e.target.value)}/><button className="button tiny" onClick={()=>{const phone=String(contactPhone ?? '').replace(/[^\d]/g,'');if(phone.length>=6) onAdd({type:'contact',input:{displayName:contactName||phone,phone,organization:contactOrg || undefined}})}}>Adicionar</button></div>
    <div className="mini-builder"><div className="builder-title"><Plus size={15}/><b>Enquete</b></div><input placeholder="Pergunta" value={pollName} onChange={e=>setPollName(e.target.value)}/><textarea placeholder={'Opção 1\nOpção 2'} value={pollValues ?? ''} onChange={e=>setPollValues(e.target.value)}/><button className="button tiny" onClick={()=>{const values=String(pollValues ?? '').split(/\r?\n/).map(v=>v.trim()).filter(Boolean);if(String(pollName ?? '').trim()&&values.length>=2)onAdd({type:'poll',input:{name:String(pollName).trim(),values,selectableCount:1}})}}>Adicionar</button></div>
  </div>;
}

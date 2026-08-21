import { useEffect, useMemo, useState } from 'react';
import {
  Bot, Check, Clock3, GitBranch, MapPin, MessageCircle, Play, Plus, RefreshCw, Save,
  Send, Settings2, Trash2, UserRound, Workflow, X,
} from 'lucide-react';

type NodeType = AttozapWorkflowNode['type'];
type NodeDraft = AttozapWorkflowNode;

type Props = { accounts: any[] };

const palette: Array<{ type: NodeType; label: string; description: string; icon: any; tone: string }> = [
  { type: 'trigger_message', label: 'Mensagem recebida', description: 'Inicia quando chega uma mensagem.', icon: MessageCircle, tone: 'violet' },
  { type: 'trigger_schedule', label: 'Horário', description: 'Executa num horário definido.', icon: Clock3, tone: 'blue' },
  { type: 'condition_text', label: 'Condição', description: 'Filtra o texto recebido.', icon: GitBranch, tone: 'amber' },
  { type: 'wait', label: 'Aguardar', description: 'Pausa antes da próxima ação.', icon: Clock3, tone: 'slate' },
  { type: 'send_text', label: 'Enviar texto', description: 'Envia uma mensagem pelo WebChat.', icon: Send, tone: 'green' },
  { type: 'send_location', label: 'Enviar localização', description: 'Envia coordenadas e endereço.', icon: MapPin, tone: 'cyan' },
  { type: 'send_contact', label: 'Enviar contacto', description: 'Envia um cartão vCard.', icon: UserRound, tone: 'pink' },
  { type: 'send_poll', label: 'Enviar enquete', description: 'Envia pergunta e opções.', icon: Check, tone: 'orange' },
  { type: 'ai_rewrite', label: 'IA · Reescrever', description: 'Usa um provedor local configurado.', icon: Bot, tone: 'purple' },
];

function uid(prefix: string) { return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`; }

function defaultConfig(type: NodeType): Record<string, unknown> {
  switch (type) {
    case 'trigger_message': return { matchType: 'contains', triggerText: '' };
    case 'trigger_schedule': return { time: '09:00', days: [1, 2, 3, 4, 5] };
    case 'condition_text': return { matchType: 'contains', triggerText: '' };
    case 'wait': return { seconds: 3 };
    case 'send_text': return { target: '', text: 'Olá, {{pushName}}! Como posso ajudar?' };
    case 'send_location': return { target: '', latitude: -23.55052, longitude: -46.633308, name: 'São Paulo', address: '' };
    case 'send_contact': return { target: '', displayName: 'GleysonDevs', phone: '+5511936216745', organization: 'ATTOZAP' };
    case 'send_poll': return { target: '', name: 'Como posso ajudar?', values: ['Suporte', 'Vendas', 'Dúvidas'], selectableCount: 1 };
    case 'ai_rewrite': return { action: 'correct', provider: '', model: '', input: '{{text}}' };
    default: return {};
  }
}

function defaultNode(type: NodeType, index: number): NodeDraft {
  const item = palette.find(entry => entry.type === type);
  return { id: uid('node'), type, label: item?.label ?? type, x: 80 + (index % 3) * 250, y: 70 + Math.floor(index / 3) * 150, config: defaultConfig(type) };
}

function nodeColor(type: NodeType) { return palette.find(item => item.type === type)?.tone ?? 'slate'; }
function nodeLabel(type: NodeType) { return palette.find(item => item.type === type)?.label ?? type; }

function asNumber(value: unknown, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function VisualAutomationPage({ accounts }: Props) {
  const connected = accounts.filter(account => account.status === 'connected');
  const [accountId, setAccountId] = useState(connected[0]?.id ?? accounts[0]?.id ?? '');
  const [workflows, setWorkflows] = useState<AttozapWorkflow[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [nodes, setNodes] = useState<NodeDraft[]>([]);
  const [edges, setEdges] = useState<AttozapWorkflowEdge[]>([]);
  const [name, setName] = useState('Novo workflow');
  const [description, setDescription] = useState('Automação local do ATTOZAP.');
  const [triggerType, setTriggerType] = useState<AttozapWorkflow['trigger_type']>('message');
  const [selectedNodeId, setSelectedNodeId] = useState('');
  const [runs, setRuns] = useState<AttozapWorkflowRun[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const selectedNode = useMemo(() => nodes.find(node => node.id === selectedNodeId) ?? null, [nodes, selectedNodeId]);
  const currentWorkflow = useMemo(() => workflows.find(workflow => workflow.id === selectedId) ?? null, [workflows, selectedId]);

  useEffect(() => {
    if (!accountId && connected[0]?.id) setAccountId(connected[0].id);
  }, [accountId, connected]);

  async function reload() {
    try {
      const items = await window.attozap.workflows.list(accountId || undefined);
      setWorkflows(items);
      if (selectedId && !items.some(item => item.id === selectedId)) setSelectedId('');
      setError('');
    } catch (cause: any) { setError(cause?.message ?? String(cause)); }
  }

  useEffect(() => { void reload(); }, [accountId]);

  function clearEditor() {
    setSelectedId('');
    setName('Novo workflow');
    setDescription('Automação local do ATTOZAP.');
    setTriggerType('message');
    setNodes([defaultNode('trigger_message', 0), defaultNode('send_text', 1)]);
    setEdges([]);
    setSelectedNodeId('');
    setRuns([]);
  }

  useEffect(() => {
    if (!nodes.length && !selectedId) clearEditor();
  }, [nodes.length, selectedId]);

  async function openWorkflow(workflow: AttozapWorkflow) {
    setSelectedId(workflow.id);
    setName(workflow.name);
    setDescription(workflow.description || '');
    setTriggerType(workflow.trigger_type);
    setNodes(Array.isArray((workflow as any).nodes) ? (workflow as any).nodes : JSON.parse(workflow.nodes_json || '[]'));
    setEdges(Array.isArray((workflow as any).edges) ? (workflow as any).edges : JSON.parse(workflow.edges_json || '[]'));
    setSelectedNodeId('');
    setRuns(await window.attozap.workflows.runs(workflow.id));
  }

  function addNode(type: NodeType) {
    const next = defaultNode(type, nodes.length);
    setNodes(current => [...current, next]);
    setSelectedNodeId(next.id);
    if (nodes.length) setEdges(current => [...current, { id: uid('edge'), source: nodes[nodes.length - 1].id, target: next.id }]);
  }

  function updateNode(patch: Partial<NodeDraft>) {
    setNodes(current => current.map(node => node.id === selectedNodeId ? { ...node, ...patch } : node));
  }

  function updateConfig(key: string, value: unknown) {
    setNodes(current => current.map(node => node.id === selectedNodeId ? { ...node, config: { ...node.config, [key]: value } } : node));
  }

  function removeNode() {
    if (!selectedNodeId) return;
    setNodes(current => current.filter(node => node.id !== selectedNodeId));
    setEdges(current => current.filter(edge => edge.source !== selectedNodeId && edge.target !== selectedNodeId));
    setSelectedNodeId('');
  }

  function normalizeEdges() {
    const next = nodes.slice(0, -1).map((node, index) => ({ id: uid('edge'), source: node.id, target: nodes[index + 1].id }));
    setEdges(next);
  }

  async function save() {
    if (!name.trim()) { setError('Dê um nome ao workflow.'); return; }
    if (!nodes.length) { setError('Adicione pelo menos um nó.'); return; }
    setBusy(true); setError(''); setNotice('');
    try {
      const payload = { accountId: accountId || null, name: name.trim(), description: description.trim(), triggerType, nodes, edges };
      const saved = selectedId ? await window.attozap.workflows.update(selectedId, payload) : await window.attozap.workflows.create(payload);
      await reload();
      if (saved) await openWorkflow(saved as any);
      setNotice('Workflow guardado localmente.');
    } catch (cause: any) { setError(cause?.message ?? String(cause)); }
    finally { setBusy(false); }
  }

  async function toggle() {
    if (!currentWorkflow) return;
    setBusy(true); setError(''); setNotice('');
    try { await window.attozap.workflows.toggle(currentWorkflow.id, !currentWorkflow.enabled); await reload(); setNotice(currentWorkflow.enabled ? 'Workflow desativado.' : 'Workflow ativado.'); }
    catch (cause: any) { setError(cause?.message ?? String(cause)); }
    finally { setBusy(false); }
  }

  async function run() {
    if (!selectedId) { setError('Guarde o workflow antes de executar.'); return; }
    setBusy(true); setError(''); setNotice('');
    try { await window.attozap.workflows.run(selectedId, { accountId: accountId || undefined, triggerType: 'manual' }); setRuns(await window.attozap.workflows.runs(selectedId)); setNotice('Execução concluída.'); await reload(); }
    catch (cause: any) { setError(cause?.message ?? String(cause)); setRuns(await window.attozap.workflows.runs(selectedId)); }
    finally { setBusy(false); }
  }

  async function remove() {
    if (!selectedId || !window.confirm('Excluir este workflow local?')) return;
    setBusy(true); setError('');
    try { await window.attozap.workflows.remove(selectedId); clearEditor(); await reload(); setNotice('Workflow excluído.'); }
    catch (cause: any) { setError(cause?.message ?? String(cause)); }
    finally { setBusy(false); }
  }

  function field(label: string, key: string, type: 'text' | 'number' | 'time' = 'text', placeholder = '') {
    const value = selectedNode?.config[key] ?? '';
    return <div className="field" key={key}><label>{label}</label><input type={type} value={String(value)} placeholder={placeholder} onChange={event => updateConfig(key, type === 'number' ? asNumber(event.target.value) : event.target.value)}/></div>;
  }

  function nodeConfig() {
    if (!selectedNode) return <div className="workflow-inspector-empty"><Settings2 size={22}/><p>Selecione um nó no canvas para configurar os seus detalhes.</p></div>;
    const config = selectedNode.config;
    return <div className="workflow-inspector-form">
      <div className="field"><label>Nome do nó</label><input value={selectedNode.label} onChange={event => updateNode({ label: event.target.value })}/></div>
      {['trigger_message', 'condition_text'].includes(selectedNode.type) && <><div className="field"><label>Correspondência</label><select value={String(config.matchType ?? 'contains')} onChange={event => updateConfig('matchType', event.target.value)}><option value="contains">Contém</option><option value="equals">É igual a</option><option value="startsWith">Começa com</option><option value="regex">Expressão regular</option><option value="all">Qualquer mensagem</option></select></div>{field('Texto de gatilho', 'triggerText', 'text', 'ex.: preço')}</>}
      {selectedNode.type === 'trigger_schedule' && <><div className="field"><label>Horário</label><input type="time" value={String(config.time ?? '09:00')} onChange={event => updateConfig('time', event.target.value)}/></div><div className="field"><label>Dias</label><input value={Array.isArray(config.days) ? config.days.join(', ') : '1, 2, 3, 4, 5'} onChange={event => updateConfig('days', event.target.value.split(',').map(value => Number(value.trim())).filter(value => Number.isInteger(value) && value >= 0 && value <= 6))}/><small>0 domingo · 6 sábado</small></div></>}
      {selectedNode.type === 'wait' && field('Segundos', 'seconds', 'number', '0 a 300')}
      {selectedNode.type === 'send_text' && <>{field('Destino', 'target', 'text', 'JID, LID ou {{remoteJid}}') }<div className="field"><label>Mensagem</label><textarea value={String(config.text ?? '')} onChange={event => updateConfig('text', event.target.value)} placeholder="Use {{pushName}}, {{text}} e {{lastAi}}"/></div></>}
      {selectedNode.type === 'send_location' && <>{field('Destino', 'target', 'text', 'JID, LID ou {{remoteJid}}')}<div className="form-grid two">{field('Latitude', 'latitude', 'number')}{field('Longitude', 'longitude', 'number')}</div>{field('Nome do local', 'name')}{field('Endereço', 'address')}</>}
      {selectedNode.type === 'send_contact' && <>{field('Destino', 'target', 'text', 'JID, LID ou {{remoteJid}}')}{field('Nome exibido', 'displayName')}{field('Telefone', 'phone')}{field('Organização', 'organization')}</>}
      {selectedNode.type === 'send_poll' && <>{field('Destino', 'target', 'text', 'JID, LID ou {{remoteJid}}')}{field('Pergunta', 'name')}<div className="field"><label>Opções</label><textarea value={Array.isArray(config.values) ? config.values.join('\n') : ''} onChange={event => updateConfig('values', event.target.value.split(/\r?\n/).map(value => value.trim()).filter(Boolean))} placeholder="Uma opção por linha"/></div>{field('Escolhas permitidas', 'selectableCount', 'number')}</>}
      {selectedNode.type === 'ai_rewrite' && <><div className="field"><label>Ação IA</label><select value={String(config.action ?? 'correct')} onChange={event => updateConfig('action', event.target.value)}><option value="correct">Corrigir texto</option><option value="shorten">Encurtar</option><option value="expand">Expandir</option><option value="context">Dar contexto</option></select></div>{field('Provedor', 'provider', 'text', 'ID do provedor configurado')}{field('Modelo opcional', 'model', 'text', 'Modelo padrão')}{field('Entrada', 'input', 'text', '{{text}}')}
</>}
      <button className="button danger ghost full" onClick={removeNode}><Trash2 size={15}/> Remover nó</button>
    </div>;
  }

  return <div className="page-stack workflow-page">
    <div className="page-head workflow-page-head"><div><span className="kicker">LOCAL AUTOMATIONS</span><h2>Visual Automations</h2><p>Monte fluxos locais com nós simples, WebChat, IA e horários. Nada sai do seu computador.</p></div><div className="workflow-head-actions"><select className="top-select" value={accountId} onChange={event => setAccountId(event.target.value)}><option value="">Todas as contas</option>{accounts.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}</select><button className="button ghost" onClick={clearEditor}><Plus size={15}/> Novo workflow</button></div></div>
    {error && <div className="notice error">{error}</div>}{notice && <div className="notice info">{notice}</div>}
    <div className="workflow-shell">
      <aside className="workflow-library"><div className="workflow-panel-title"><div><span className="kicker">BIBLIOTECA</span><h3>Adicionar nó</h3></div><Workflow size={19}/></div>{palette.map(item => { const Icon = item.icon; return <button className="workflow-palette-item" key={item.type} onClick={() => addNode(item.type)}><span className={`workflow-node-icon ${item.tone}`}><Icon size={16}/></span><span><b>{item.label}</b><small>{item.description}</small></span><Plus size={14}/></button>; })}<div className="workflow-library-note"><b>Como funciona</b><p>Os nós são executados de cima para baixo. Use o botão de reorganizar para reconstruir as ligações sequenciais.</p></div></aside>
      <section className="workflow-main"><div className="workflow-toolbar"><div className="workflow-title-fields"><input className="workflow-name-input" value={name} onChange={event => setName(event.target.value)} placeholder="Nome do workflow"/><input className="workflow-description-input" value={description} onChange={event => setDescription(event.target.value)} placeholder="Descrição curta"/></div><div className="workflow-toolbar-actions"><button className="icon-button" title="Reconstruir ligações sequenciais" onClick={normalizeEdges}><GitBranch size={15}/></button><button className="button ghost" disabled={busy} onClick={() => void save()}><Save size={15}/> Guardar</button>{currentWorkflow && <><button className={`button ${currentWorkflow.enabled ? 'ghost' : 'primary'}`} disabled={busy} onClick={() => void toggle()}>{currentWorkflow.enabled ? <X size={15}/> : <Check size={15}/>} {currentWorkflow.enabled ? 'Desativar' : 'Ativar'}</button><button className="button primary" disabled={busy} onClick={() => void run()}><Play size={15}/> Executar</button></>}</div></div><div className="workflow-meta-row"><label className="workflow-trigger-select"><span>Gatilho</span><select value={triggerType} onChange={event => setTriggerType(event.target.value as AttozapWorkflow['trigger_type'])}><option value="message">Mensagem recebida</option><option value="schedule">Horário</option><option value="manual">Manual</option></select></label><span className="workflow-hint"><span className="workflow-live-dot"/> {currentWorkflow?.enabled ? 'Ativo e a monitorizar localmente' : 'Rascunho local não ativo'}</span></div><div className="workflow-canvas"><div className="workflow-canvas-grid"/>{nodes.map((node, index) => { const item = palette.find(entry => entry.type === node.type); const Icon = item?.icon ?? Workflow; return <button key={node.id} className={`workflow-canvas-node ${selectedNodeId === node.id ? 'selected' : ''}`} style={{ left: `${node.x}px`, top: `${node.y}px` }} onClick={() => setSelectedNodeId(node.id)}><span className={`workflow-node-icon ${nodeColor(node.type)}`}><Icon size={16}/></span><span className="workflow-canvas-node-copy"><b>{node.label || nodeLabel(node.type)}</b><small>{node.type === 'send_text' ? String(node.config.text ?? '').slice(0, 42) : item?.description}</small></span><span className="workflow-node-number">{index + 1}</span></button>; })}{!nodes.length && <div className="workflow-canvas-empty"><Workflow size={34}/><h3>Comece pelo primeiro nó</h3><p>Escolha um gatilho na biblioteca para começar o seu workflow local.</p></div>}</div></section>
      <aside className="workflow-inspector"><div className="workflow-panel-title"><div><span className="kicker">INSPECTOR</span><h3>Configuração</h3></div><Settings2 size={18}/></div>{nodeConfig()}</aside>
    </div>
    <div className="workflow-bottom-grid"><section className="card"><div className="card-head"><div><h3>Meus workflows</h3><p>{workflows.length} automações locais</p></div><button className="icon-button" onClick={() => void reload()}><RefreshCw size={15}/></button></div><div className="workflow-list">{workflows.map(workflow => <button className={`workflow-list-row ${selectedId === workflow.id ? 'selected' : ''}`} key={workflow.id} onClick={() => void openWorkflow(workflow)}><span className={`workflow-status-dot ${workflow.enabled ? 'on' : ''}`}/><span className="grow"><b>{workflow.name}</b><small>{workflow.trigger_type} · {workflow.run_count} execuções</small></span><span className={`status-chip ${workflow.enabled ? 'running' : 'paused'}`}>{workflow.enabled ? 'ativo' : 'rascunho'}</span></button>)}{!workflows.length && <div className="empty mini"><Workflow size={24}/><p>Ainda não existem automações guardadas.</p></div>}</div></section><section className="card"><div className="card-head"><div><h3>Últimas execuções</h3><p>{runs.length ? 'Do workflow selecionado' : 'Selecione um workflow para consultar'}</p></div></div><div className="workflow-runs">{runs.slice(0, 8).map(runItem => <div className="workflow-run-row" key={runItem.id}><span className={`workflow-run-dot ${runItem.status}`}/><span className="grow"><b>{runItem.status === 'completed' ? 'Concluída' : runItem.status === 'failed' ? 'Falhou' : 'Em execução'}</b><small>{runItem.trigger_type} · {runItem.started_at}</small></span><span className="workflow-run-status">{runItem.status}</span></div>)}{!runs.length && <div className="empty mini"><Play size={24}/><p>Nenhuma execução registada.</p></div>}</div></section></div>
  </div>;
}

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  addEdge, Background, Connection, Controls, Edge, Handle, MarkerType, MiniMap, Node, NodeProps,
  OnConnect, Position, ReactFlow, ReactFlowInstance,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  AlertTriangle, Bot, Check, ChevronRight, Clock3, Copy, GitBranch, MapPin, MessageCircle,
  MousePointer2, Play, Plus, RefreshCw, Save, Send, Settings2, Sparkles, Trash2, UserRound,
  Workflow, X, ZoomIn,
} from 'lucide-react';

type NodeType = AttozapWorkflowNode['type'];
type NodeDraft = AttozapWorkflowNode;
type FlowNode = Node<{ workflow: NodeDraft; index: number }, 'attozap'>;
type FlowEdge = Edge<{ condition?: AttozapWorkflowEdge['condition'] }>;
type Props = { accounts: any[] };

const palette: Array<{ type: NodeType; label: string; description: string; icon: any; tone: string; group: 'Gatilhos' | 'Lógica' | 'Ações' | 'IA' }> = [
  { type: 'trigger_message', label: 'Mensagem recebida', description: 'Inicia quando chega uma mensagem.', icon: MessageCircle, tone: 'violet', group: 'Gatilhos' },
  { type: 'trigger_schedule', label: 'Horário', description: 'Executa num horário definido.', icon: Clock3, tone: 'blue', group: 'Gatilhos' },
  { type: 'condition_text', label: 'Condição', description: 'Divide o fluxo conforme o texto.', icon: GitBranch, tone: 'amber', group: 'Lógica' },
  { type: 'wait', label: 'Aguardar', description: 'Pausa antes da próxima ação.', icon: Clock3, tone: 'slate', group: 'Lógica' },
  { type: 'send_text', label: 'Enviar texto', description: 'Envia uma mensagem pelo WebChat.', icon: Send, tone: 'green', group: 'Ações' },
  { type: 'send_location', label: 'Enviar localização', description: 'Envia coordenadas e endereço.', icon: MapPin, tone: 'cyan', group: 'Ações' },
  { type: 'send_contact', label: 'Enviar contacto', description: 'Envia um cartão vCard.', icon: UserRound, tone: 'pink', group: 'Ações' },
  { type: 'send_poll', label: 'Enviar enquete', description: 'Envia pergunta e opções.', icon: Check, tone: 'orange', group: 'Ações' },
  { type: 'ai_rewrite', label: 'IA · Reescrever', description: 'Usa um provedor local configurado.', icon: Bot, tone: 'purple', group: 'IA' },
];

const paletteGroups = ['Gatilhos', 'Lógica', 'Ações', 'IA'] as const;
function uid(prefix: string) { return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`; }
function itemFor(type: NodeType) { return palette.find(item => item.type === type); }
function nodeLabel(type: NodeType) { return itemFor(type)?.label ?? type; }
function nodeTone(type: NodeType) { return itemFor(type)?.tone ?? 'slate'; }
function asNumber(value: unknown, fallback = 0) { const numeric = Number(value); return Number.isFinite(numeric) ? numeric : fallback; }

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

function defaultNode(type: NodeType, index: number, position?: { x: number; y: number }): NodeDraft {
  const item = itemFor(type);
  return {
    id: uid('node'), type, label: item?.label ?? type,
    x: position?.x ?? 80 + (index % 3) * 260,
    y: position?.y ?? 80 + Math.floor(index / 3) * 170,
    config: defaultConfig(type),
  };
}

function AttozapCanvasNode({ data, selected }: NodeProps<FlowNode>) {
  const workflow = data.workflow;
  const item = itemFor(workflow.type);
  const Icon = item?.icon ?? Workflow;
  const isCondition = workflow.type === 'condition_text';
  const preview = workflow.type === 'send_text'
    ? String(workflow.config.text ?? '').slice(0, 48)
    : workflow.type === 'ai_rewrite' ? `IA: ${String(workflow.config.action ?? 'corrigir')}` : item?.description;
  return <div className={`attozap-flow-node ${selected ? 'selected' : ''} ${nodeTone(workflow.type)}`}>
    <Handle type="target" position={Position.Left} className="attozap-flow-handle input" />
    <div className="attozap-flow-node-topline"><span className={`workflow-node-icon ${nodeTone(workflow.type)}`}><Icon size={15} /></span><span className="attozap-flow-node-index">{data.index + 1}</span></div>
    <b>{workflow.label || nodeLabel(workflow.type)}</b>
    <small>{preview || 'Configure este nó'}</small>
    {isCondition ? <>
      <Handle type="source" id="true" position={Position.Right} className="attozap-flow-handle true" />
      <Handle type="source" id="false" position={Position.Bottom} className="attozap-flow-handle false" />
      <span className="attozap-flow-branch true">SIM</span><span className="attozap-flow-branch false">NÃO</span>
    </> : <Handle type="source" position={Position.Right} className="attozap-flow-handle output" />}
  </div>;
}

const nodeTypes = { attozap: AttozapCanvasNode };

function validationFor(nodes: NodeDraft[], edges: AttozapWorkflowEdge[], triggerType: AttozapWorkflow['trigger_type']) {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!nodes.length) errors.push('Adicione pelo menos um nó ao workflow.');
  const idSet = new Set(nodes.map(node => node.id));
  if (edges.some(edge => !idSet.has(edge.source) || !idSet.has(edge.target) || edge.source === edge.target)) errors.push('Existem ligações inválidas no canvas.');
  if (triggerType === 'message' && !nodes.some(node => node.type === 'trigger_message')) errors.push('Um workflow de mensagem precisa do nó “Mensagem recebida”.');
  if (triggerType === 'schedule' && !nodes.some(node => node.type === 'trigger_schedule')) errors.push('Um workflow por horário precisa do nó “Horário”.');
  if (nodes.length > 1) {
    const linked = new Set(edges.flatMap(edge => [edge.source, edge.target]));
    if (nodes.some(node => !linked.has(node.id))) warnings.push('Existem nós desligados que não serão executados.');
  }
  const graph = new Map<string, string[]>();
  edges.forEach(edge => graph.set(edge.source, [...(graph.get(edge.source) ?? []), edge.target]));
  const visiting = new Set<string>(); const visited = new Set<string>();
  const cycle = (id: string): boolean => {
    if (visiting.has(id)) return true;
    if (visited.has(id)) return false;
    visiting.add(id);
    const found = (graph.get(id) ?? []).some(cycle);
    visiting.delete(id); visited.add(id);
    return found;
  };
  if (nodes.some(node => cycle(node.id))) errors.push('O workflow contém um ciclo; o motor local bloqueia ciclos para evitar execuções infinitas.');
  nodes.filter(node => node.type === 'condition_text').forEach(node => {
    const conditions = edges.filter(edge => edge.source === node.id).map(edge => edge.condition);
    if (conditions.filter(value => value === 'true').length > 1 || conditions.filter(value => value === 'false').length > 1) warnings.push(`A condição “${node.label}” tem caminhos repetidos; o motor seguirá apenas o primeiro caminho compatível.`);
  });
  return { errors, warnings };
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
  const [selectedEdgeId, setSelectedEdgeId] = useState('');
  const [runs, setRuns] = useState<AttozapWorkflowRun[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [flow, setFlow] = useState<ReactFlowInstance<FlowNode, FlowEdge> | null>(null);

  const selectedNode = useMemo(() => nodes.find(node => node.id === selectedNodeId) ?? null, [nodes, selectedNodeId]);
  const selectedEdge = useMemo(() => edges.find(edge => edge.id === selectedEdgeId) ?? null, [edges, selectedEdgeId]);
  const currentWorkflow = useMemo(() => workflows.find(workflow => workflow.id === selectedId) ?? null, [workflows, selectedId]);
  const validation = useMemo(() => validationFor(nodes, edges, triggerType), [nodes, edges, triggerType]);
  const flowNodes = useMemo<FlowNode[]>(() => nodes.map((node, index) => ({ id: node.id, type: 'attozap', position: { x: node.x, y: node.y }, data: { workflow: node, index }, selected: selectedNodeId === node.id })), [nodes, selectedNodeId]);
  const flowEdges = useMemo<FlowEdge[]>(() => edges.map(edge => ({
    id: edge.id, source: edge.source, target: edge.target, sourceHandle: edge.condition,
    type: 'smoothstep', animated: selectedEdgeId === edge.id,
    label: edge.condition === 'true' ? 'SIM' : edge.condition === 'false' ? 'NÃO' : undefined,
    markerEnd: { type: MarkerType.ArrowClosed, color: edge.condition === 'false' ? '#ef6a77' : edge.condition === 'true' ? '#3cdb8d' : '#8f9aaa' },
    style: { stroke: edge.condition === 'false' ? '#ef6a77' : edge.condition === 'true' ? '#3cdb8d' : '#73819a', strokeWidth: selectedEdgeId === edge.id ? 2.6 : 1.7 },
    labelStyle: { fill: edge.condition === 'false' ? '#ff9da7' : '#75e8a8', fontWeight: 800, fontSize: 10 },
    data: { condition: edge.condition },
  })), [edges, selectedEdgeId]);

  useEffect(() => { if (!accountId && connected[0]?.id) setAccountId(connected[0].id); }, [accountId, connected]);
  const reload = useCallback(async () => {
    try {
      const items = await window.attozap.workflows.list(accountId || undefined);
      setWorkflows(items);
      if (selectedId && !items.some(item => item.id === selectedId)) setSelectedId('');
      setError('');
    } catch (cause: any) { setError(cause?.message ?? String(cause)); }
  }, [accountId, selectedId]);
  useEffect(() => { void reload(); }, [reload]);

  function clearEditor() {
    setSelectedId(''); setName('Novo workflow'); setDescription('Automação local do ATTOZAP.'); setTriggerType('message');
    const trigger = defaultNode('trigger_message', 0, { x: 80, y: 200 }); const message = defaultNode('send_text', 1, { x: 410, y: 200 });
    setNodes([trigger, message]); setEdges([{ id: uid('edge'), source: trigger.id, target: message.id }]); setSelectedNodeId(''); setSelectedEdgeId(''); setRuns([]);
  }
  useEffect(() => { if (!nodes.length && !selectedId) clearEditor(); }, [nodes.length, selectedId]);

  async function openWorkflow(workflow: AttozapWorkflow) {
    setSelectedId(workflow.id); setName(workflow.name); setDescription(workflow.description || ''); setTriggerType(workflow.trigger_type);
    setNodes(Array.isArray((workflow as any).nodes) ? (workflow as any).nodes : JSON.parse(workflow.nodes_json || '[]'));
    setEdges(Array.isArray((workflow as any).edges) ? (workflow as any).edges : JSON.parse(workflow.edges_json || '[]'));
    setSelectedNodeId(''); setSelectedEdgeId(''); setRuns(await window.attozap.workflows.runs(workflow.id));
    window.setTimeout(() => flow?.fitView({ padding: 0.28, duration: 300 }), 40);
  }

  function addNode(type: NodeType, position?: { x: number; y: number }) {
    const next = defaultNode(type, nodes.length, position);
    setNodes(current => [...current, next]); setSelectedNodeId(next.id); setSelectedEdgeId('');
    if (!position && nodes.length) setEdges(current => [...current, { id: uid('edge'), source: nodes[nodes.length - 1].id, target: next.id }]);
  }
  function updateNode(patch: Partial<NodeDraft>) { setNodes(current => current.map(node => node.id === selectedNodeId ? { ...node, ...patch } : node)); }
  function updateConfig(key: string, value: unknown) { setNodes(current => current.map(node => node.id === selectedNodeId ? { ...node, config: { ...node.config, [key]: value } } : node)); }
  function removeNode() { if (!selectedNodeId) return; setNodes(current => current.filter(node => node.id !== selectedNodeId)); setEdges(current => current.filter(edge => edge.source !== selectedNodeId && edge.target !== selectedNodeId)); setSelectedNodeId(''); }
  function duplicateNode() { if (!selectedNode) return; const next = { ...selectedNode, id: uid('node'), label: `${selectedNode.label} (cópia)`, x: selectedNode.x + 46, y: selectedNode.y + 46, config: { ...selectedNode.config } }; setNodes(current => [...current, next]); setSelectedNodeId(next.id); }
  function removeEdge() { if (!selectedEdgeId) return; setEdges(current => current.filter(edge => edge.id !== selectedEdgeId)); setSelectedEdgeId(''); }
  function normalizeEdges() {
    if (edges.some(edge => edge.condition) && !window.confirm('Reconstruir ligações lineares remove as ramificações SIM/NÃO. Continuar?')) return;
    setEdges(nodes.slice(0, -1).map((node, index) => ({ id: uid('edge'), source: node.id, target: nodes[index + 1].id })));
    setSelectedEdgeId(''); setNotice('Ligações lineares reconstruídas.');
  }
  const onNodeDragStop = useCallback((_event: any, moved: FlowNode) => setNodes(current => current.map(node => node.id === moved.id ? { ...node, x: Math.round(moved.position.x), y: Math.round(moved.position.y) } : node)), []);
  const onConnect: OnConnect = useCallback((connection: Connection) => {
    if (!connection.source || !connection.target || connection.source === connection.target) return;
    const source = nodes.find(node => node.id === connection.source);
    const condition = source?.type === 'condition_text' && (connection.sourceHandle === 'true' || connection.sourceHandle === 'false') ? connection.sourceHandle : undefined;
    if (edges.some(edge => edge.source === connection.source && edge.target === connection.target && edge.condition === condition)) return;
    setEdges(current => addEdge({ id: uid('edge'), source: connection.source!, target: connection.target!, ...(condition ? { condition } : {}) }, current));
    setNotice(condition ? `Ramo ${condition === 'true' ? 'SIM' : 'NÃO'} ligado.` : 'Nós ligados.');
  }, [edges, nodes]);
  function updateEdgeCondition(condition: AttozapWorkflowEdge['condition']) { if (!selectedEdgeId) return; setEdges(current => current.map(edge => edge.id === selectedEdgeId ? { ...edge, ...(condition ? { condition } : { condition: undefined }) } : edge)); }

  async function save() {
    if (!name.trim()) { setError('Dê um nome ao workflow.'); return; }
    if (validation.errors.length) { setError(validation.errors[0]); return; }
    setBusy(true); setError(''); setNotice('');
    try {
      const payload = { accountId: accountId || null, name: name.trim(), description: description.trim(), triggerType, nodes, edges };
      const saved = selectedId ? await window.attozap.workflows.update(selectedId, payload) : await window.attozap.workflows.create(payload);
      await reload(); if (saved) await openWorkflow(saved as any); setNotice('Workflow guardado localmente.');
    } catch (cause: any) { setError(cause?.message ?? String(cause)); } finally { setBusy(false); }
  }
  async function toggle() { if (!currentWorkflow) return; setBusy(true); setError(''); try { await window.attozap.workflows.toggle(currentWorkflow.id, !currentWorkflow.enabled); await reload(); setNotice(currentWorkflow.enabled ? 'Workflow desativado.' : 'Workflow ativado.'); } catch (cause: any) { setError(cause?.message ?? String(cause)); } finally { setBusy(false); } }
  async function run() { if (!selectedId) { setError('Guarde o workflow antes de executar.'); return; } if (validation.errors.length) { setError(validation.errors[0]); return; } setBusy(true); setError(''); try { await window.attozap.workflows.run(selectedId, { accountId: accountId || undefined, triggerType: 'manual' }); setRuns(await window.attozap.workflows.runs(selectedId)); setNotice('Execução concluída.'); await reload(); } catch (cause: any) { setError(cause?.message ?? String(cause)); setRuns(await window.attozap.workflows.runs(selectedId)); } finally { setBusy(false); } }
  async function remove() { if (!selectedId || !window.confirm('Excluir este workflow local?')) return; setBusy(true); try { await window.attozap.workflows.remove(selectedId); clearEditor(); await reload(); setNotice('Workflow excluído.'); } catch (cause: any) { setError(cause?.message ?? String(cause)); } finally { setBusy(false); } }
  function field(label: string, key: string, type: 'text' | 'number' | 'time' = 'text', placeholder = '') { const value = selectedNode?.config[key] ?? ''; return <div className="field" key={key}><label>{label}</label><input type={type} value={String(value)} placeholder={placeholder} onChange={event => updateConfig(key, type === 'number' ? asNumber(event.target.value) : event.target.value)} /></div>; }

  function inspector() {
    if (selectedEdge) {
      const source = nodes.find(node => node.id === selectedEdge.source);
      const isCondition = source?.type === 'condition_text';
      return <div className="workflow-inspector-form"><div className="workflow-inspector-context"><GitBranch size={17} /><span>Ligação selecionada</span></div><p className="workflow-inspector-copy">{source?.label ?? 'Nó'} <ChevronRight size={14} /> {nodes.find(node => node.id === selectedEdge.target)?.label ?? 'Nó'}</p>{isCondition ? <div className="field"><label>Executar quando</label><select value={selectedEdge.condition ?? ''} onChange={event => updateEdgeCondition(event.target.value as AttozapWorkflowEdge['condition'])}><option value="">Sempre</option><option value="true">A condição for verdadeira</option><option value="false">A condição for falsa</option></select></div> : <p className="workflow-inspector-copy muted">Ligações normais seguem sempre para o próximo nó.</p>}<button className="button danger ghost full" onClick={removeEdge}><Trash2 size={15} /> Remover ligação</button></div>;
    }
    if (!selectedNode) return <div className="workflow-inspector-empty"><MousePointer2 size={22} /><p>Selecione um nó ou uma ligação para configurar os seus detalhes.</p><small>Arraste do conector de saída para criar uma ligação.</small></div>;
    const config = selectedNode.config;
    return <div className="workflow-inspector-form"><div className="workflow-inspector-context"><span className={`workflow-node-icon ${nodeTone(selectedNode.type)}`}>{(() => { const Icon = itemFor(selectedNode.type)?.icon ?? Workflow; return <Icon size={15} />; })()}</span><span>{nodeLabel(selectedNode.type)}</span></div><div className="field"><label>Nome do nó</label><input value={selectedNode.label} onChange={event => updateNode({ label: event.target.value })} /></div>
      {['trigger_message', 'condition_text'].includes(selectedNode.type) && <><div className="field"><label>Correspondência</label><select value={String(config.matchType ?? 'contains')} onChange={event => updateConfig('matchType', event.target.value)}><option value="contains">Contém</option><option value="equals">É igual a</option><option value="startsWith">Começa com</option><option value="regex">Expressão regular</option><option value="all">Qualquer mensagem</option></select></div>{field('Texto de gatilho', 'triggerText', 'text', 'ex.: preço')}</>}
      {selectedNode.type === 'trigger_schedule' && <><div className="field"><label>Horário</label><input type="time" value={String(config.time ?? '09:00')} onChange={event => updateConfig('time', event.target.value)} /></div><div className="field"><label>Dias</label><input value={Array.isArray(config.days) ? config.days.join(', ') : '1, 2, 3, 4, 5'} onChange={event => updateConfig('days', event.target.value.split(',').map(value => Number(value.trim())).filter(value => Number.isInteger(value) && value >= 0 && value <= 6))} /><small>0 domingo · 6 sábado</small></div></>}
      {selectedNode.type === 'wait' && field('Segundos', 'seconds', 'number', '0 a 300')}
      {selectedNode.type === 'send_text' && <>{field('Destino', 'target', 'text', 'JID, LID ou {{remoteJid}}')}<div className="field"><label>Mensagem</label><textarea value={String(config.text ?? '')} onChange={event => updateConfig('text', event.target.value)} placeholder="Use {{pushName}}, {{text}} e {{lastAi}}" /></div></>}
      {selectedNode.type === 'send_location' && <>{field('Destino', 'target', 'text', 'JID, LID ou {{remoteJid}}')}<div className="form-grid two">{field('Latitude', 'latitude', 'number')}{field('Longitude', 'longitude', 'number')}</div>{field('Nome do local', 'name')}{field('Endereço', 'address')}</>}
      {selectedNode.type === 'send_contact' && <>{field('Destino', 'target', 'text', 'JID, LID ou {{remoteJid}}')}{field('Nome exibido', 'displayName')}{field('Telefone', 'phone')}{field('Organização', 'organization')}</>}
      {selectedNode.type === 'send_poll' && <>{field('Destino', 'target', 'text', 'JID, LID ou {{remoteJid}}')}{field('Pergunta', 'name')}<div className="field"><label>Opções</label><textarea value={Array.isArray(config.values) ? config.values.join('\n') : ''} onChange={event => updateConfig('values', event.target.value.split(/\r?\n/).map(value => value.trim()).filter(Boolean))} placeholder="Uma opção por linha" /></div>{field('Escolhas permitidas', 'selectableCount', 'number')}</>}
      {selectedNode.type === 'ai_rewrite' && <><div className="field"><label>Ação IA</label><select value={String(config.action ?? 'correct')} onChange={event => updateConfig('action', event.target.value)}><option value="correct">Corrigir texto</option><option value="shorten">Encurtar</option><option value="expand">Expandir</option><option value="context">Dar contexto</option></select></div>{field('Provedor', 'provider', 'text', 'ID do provedor configurado')}{field('Modelo opcional', 'model', 'text', 'Modelo padrão')}{field('Entrada', 'input', 'text', '{{text}}')}</>}
      <div className="workflow-inspector-actions"><button className="button ghost" onClick={duplicateNode}><Copy size={14} /> Duplicar</button><button className="button danger ghost" onClick={removeNode}><Trash2 size={14} /> Remover</button></div>
    </div>;
  }

  return <div className="page-stack workflow-page workflow-flow-page">
    <div className="page-head workflow-page-head"><div><span className="kicker">LOCAL AUTOMATIONS</span><h2>Visual Automations</h2><p>Construa fluxos visuais locais com nós, ramificações, WebChat, IA e horários. O motor continua no seu computador.</p></div><div className="workflow-head-actions"><select className="top-select" value={accountId} onChange={event => setAccountId(event.target.value)}><option value="">Todas as contas</option>{accounts.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}</select><button className="button ghost" onClick={clearEditor}><Plus size={15} /> Novo workflow</button></div></div>
    {error && <div className="notice error">{error}</div>}{notice && <div className="notice info">{notice}</div>}
    <div className="workflow-shell workflow-flow-shell">
      <aside className="workflow-library"><div className="workflow-panel-title"><div><span className="kicker">BIBLIOTECA</span><h3>Blocos do fluxo</h3></div><Workflow size={19} /></div>{paletteGroups.map(group => <div className="workflow-palette-group" key={group}><span>{group}</span>{palette.filter(item => item.group === group).map(item => { const Icon = item.icon; return <button className="workflow-palette-item" key={item.type} draggable onDragStart={event => event.dataTransfer.setData('application/attozap-node', item.type)} onClick={() => addNode(item.type)}><span className={`workflow-node-icon ${item.tone}`}><Icon size={16} /></span><span><b>{item.label}</b><small>{item.description}</small></span><Plus size={14} /></button>; })}</div>)}<div className="workflow-library-note"><Sparkles size={15} /><p><b>Arraste para o canvas</b> ou clique para adicionar. Ligue as saídas para definir a ordem de execução.</p></div></aside>
      <section className="workflow-main"><div className="workflow-toolbar"><div className="workflow-title-fields"><input className="workflow-name-input" value={name} onChange={event => setName(event.target.value)} placeholder="Nome do workflow" /><input className="workflow-description-input" value={description} onChange={event => setDescription(event.target.value)} placeholder="Descrição curta" /></div><div className="workflow-toolbar-actions"><button className="icon-button" title="Enquadrar workflow" onClick={() => flow?.fitView({ padding: 0.25, duration: 250 })}><ZoomIn size={15} /></button><button className="icon-button" title="Reconstruir ligações sequenciais" onClick={normalizeEdges}><GitBranch size={15} /></button><button className="button ghost" disabled={busy} onClick={() => void save()}><Save size={15} /> Guardar</button>{currentWorkflow && <><button className={`button ${currentWorkflow.enabled ? 'ghost' : 'primary'}`} disabled={busy} onClick={() => void toggle()}>{currentWorkflow.enabled ? <X size={15} /> : <Check size={15} />}{currentWorkflow.enabled ? 'Desativar' : 'Ativar'}</button><button className="button primary" disabled={busy} onClick={() => void run()}><Play size={15} /> Executar</button></>}</div></div>
        <div className="workflow-meta-row"><label className="workflow-trigger-select"><span>Gatilho</span><select value={triggerType} onChange={event => setTriggerType(event.target.value as AttozapWorkflow['trigger_type'])}><option value="message">Mensagem recebida</option><option value="schedule">Horário</option><option value="manual">Manual</option></select></label><span className="workflow-hint"><span className="workflow-live-dot" /> {currentWorkflow?.enabled ? 'Ativo e a monitorizar localmente' : 'Rascunho local não ativo'}</span><span className={`workflow-validation ${validation.errors.length ? 'error' : validation.warnings.length ? 'warn' : 'ok'}`}>{validation.errors.length ? <AlertTriangle size={14} /> : <Check size={14} />}{validation.errors.length ? `${validation.errors.length} erro(s)` : validation.warnings.length ? `${validation.warnings.length} aviso(s)` : 'Fluxo válido'}</span></div>
        {(validation.errors.length > 0 || validation.warnings.length > 0) && <div className="workflow-validation-list">{[...validation.errors, ...validation.warnings].map((message, index) => <span key={`${message}-${index}`} className={index < validation.errors.length ? 'error' : 'warn'}><AlertTriangle size={13} /> {message}</span>)}</div>}
        <div className="workflow-flow-canvas" onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); const type = event.dataTransfer.getData('application/attozap-node') as NodeType; if (!itemFor(type) || !flow) return; addNode(type, flow.screenToFlowPosition({ x: event.clientX, y: event.clientY })); }}>
          <ReactFlow<FlowNode, FlowEdge> nodes={flowNodes} edges={flowEdges} nodeTypes={nodeTypes} onInit={setFlow} onNodeClick={(_event, node) => { setSelectedNodeId(node.id); setSelectedEdgeId(''); }} onEdgeClick={(_event, edge) => { setSelectedEdgeId(edge.id); setSelectedNodeId(''); }} onNodeDragStop={onNodeDragStop} onConnect={onConnect} onNodesDelete={deleted => { const ids = new Set(deleted.map(node => node.id)); setNodes(current => current.filter(node => !ids.has(node.id))); setEdges(current => current.filter(edge => !ids.has(edge.source) && !ids.has(edge.target))); }} onEdgesDelete={deleted => { const ids = new Set(deleted.map(edge => edge.id)); setEdges(current => current.filter(edge => !ids.has(edge.id))); }} onPaneClick={() => { setSelectedNodeId(''); setSelectedEdgeId(''); }} fitView fitViewOptions={{ padding: 0.28 }} minZoom={0.28} maxZoom={1.7} deleteKeyCode={['Backspace', 'Delete']} defaultEdgeOptions={{ type: 'smoothstep' }}>
            <Background gap={20} size={1} color="rgba(154, 176, 197, .16)" /><Controls showInteractive={false} /><MiniMap pannable zoomable nodeColor={node => nodeTone((node.data as any).workflow.type) === 'green' ? '#36ce88' : '#7a8ea8'} maskColor="rgba(7, 12, 19, .68)" />
          </ReactFlow>
          {!nodes.length && <div className="workflow-canvas-empty"><Workflow size={34} /><h3>Comece pelo primeiro nó</h3><p>Arraste um gatilho da biblioteca para começar o seu workflow local.</p></div>}
        </div>
      </section>
      <aside className="workflow-inspector"><div className="workflow-panel-title"><div><span className="kicker">INSPECTOR</span><h3>Configuração</h3></div><Settings2 size={18} /></div>{inspector()}</aside>
    </div>
    <div className="workflow-bottom-grid"><section className="card"><div className="card-head"><div><h3>Meus workflows</h3><p>{workflows.length} automações locais</p></div><button className="icon-button" onClick={() => void reload()}><RefreshCw size={15} /></button></div><div className="workflow-list">{workflows.map(workflow => <button className={`workflow-list-row ${selectedId === workflow.id ? 'selected' : ''}`} key={workflow.id} onClick={() => void openWorkflow(workflow)}><span className={`workflow-status-dot ${workflow.enabled ? 'on' : ''}`} /><span className="grow"><b>{workflow.name}</b><small>{workflow.trigger_type} · {workflow.run_count} execuções</small></span><span className={`status-chip ${workflow.enabled ? 'running' : 'paused'}`}>{workflow.enabled ? 'ativo' : 'rascunho'}</span></button>)}{!workflows.length && <div className="empty mini"><Workflow size={24} /><p>Ainda não existem automações guardadas.</p></div>}</div></section><section className="card"><div className="card-head"><div><h3>Últimas execuções</h3><p>{runs.length ? 'Do workflow selecionado' : 'Selecione um workflow para consultar'}</p></div>{selectedId && <button className="button danger ghost" onClick={() => void remove()}><Trash2 size={14} /> Excluir</button>}</div><div className="workflow-runs">{runs.slice(0, 8).map(runItem => <div className="workflow-run-row" key={runItem.id}><span className={`workflow-run-dot ${runItem.status}`} /><span className="grow"><b>{runItem.status === 'completed' ? 'Concluída' : runItem.status === 'failed' ? 'Falhou' : 'Em execução'}</b><small>{runItem.trigger_type} · {runItem.started_at}</small></span><span className="workflow-run-status">{runItem.status}</span></div>)}{!runs.length && <div className="empty mini"><Play size={24} /><p>Nenhuma execução registada.</p></div>}</div></section></div>
  </div>;
}

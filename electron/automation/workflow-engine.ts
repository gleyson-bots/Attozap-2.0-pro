import { randomUUID } from 'node:crypto';
import type { AttozapDatabase } from '../database.js';
import type { LicenseService } from '../license-service.js';
import type { AccountManager } from '../messaging/account-manager.js';
import type { IncomingMessage, OutboundContent } from '../messaging/provider.js';
import type { ChatService } from '../messaging/chat-service.js';
import { rewriteAiText } from '../ai-service.js';
import type { AiProviderId } from '../ai-service.js';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

export type WorkflowNodeType =
  | 'trigger_message'
  | 'trigger_schedule'
  | 'condition_text'
  | 'wait'
  | 'send_text'
  | 'send_location'
  | 'send_contact'
  | 'send_poll'
  | 'ai_rewrite'
  | 'telegram_send'
  | 'http_request';

export type WorkflowNode = {
  id: string;
  type: WorkflowNodeType;
  label: string;
  x: number;
  y: number;
  config: Record<string, unknown>;
};

export type WorkflowEdge = {
  id: string;
  source: string;
  target: string;
  condition?: 'true' | 'false';
};

export type WorkflowInput = {
  accountId?: string | null;
  name: string;
  description?: string;
  enabled?: boolean;
  triggerType?: 'manual' | 'message' | 'schedule';
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
};

type WorkflowRow = {
  id: string;
  account_id: string | null;
  name: string;
  description: string;
  enabled: number;
  trigger_type: 'manual' | 'message' | 'schedule';
  nodes_json: string;
  edges_json: string;
  run_count: number;
  last_run_at: string | null;
  created_at: string;
  updated_at: string;
};

type WorkflowContext = {
  accountId: string;
  remoteJid: string;
  text: string;
  pushName: string;
  triggerType: string;
  lastAi: string;
  vars: Record<string, string>;
};

type RunInput = {
  triggerType?: 'manual' | 'message' | 'schedule';
  accountId?: string;
  remoteJid?: string;
  text?: string;
  pushName?: string;
};

function cleanText(value: unknown, max = 8_000) {
  return String(value ?? '').trim().slice(0, max);
}

function safeNodes(value: unknown): WorkflowNode[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 100).map((item, index) => {
    const raw = (item ?? {}) as Record<string, unknown>;
    const allowed: WorkflowNodeType[] = ['trigger_message', 'trigger_schedule', 'condition_text', 'wait', 'send_text', 'send_location', 'send_contact', 'send_poll', 'ai_rewrite', 'telegram_send', 'http_request'];
    const type = allowed.includes(raw.type as WorkflowNodeType) ? raw.type as WorkflowNodeType : 'send_text';
    return {
      id: cleanText(raw.id, 80) || `node-${index + 1}`,
      type,
      label: cleanText(raw.label, 120) || type,
      x: Math.max(0, Math.min(2_000, Number(raw.x) || 80 + (index % 3) * 260)),
      y: Math.max(0, Math.min(1_200, Number(raw.y) || 80 + Math.floor(index / 3) * 150)),
      config: raw.config && typeof raw.config === 'object' ? raw.config as Record<string, unknown> : {},
    };
  });
}

function safeEdges(value: unknown, nodeIds: Set<string>): WorkflowEdge[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 200).map((item, index) => {
    const raw = (item ?? {}) as Record<string, unknown>;
    const condition: WorkflowEdge['condition'] = raw.condition === 'true' ? 'true' : raw.condition === 'false' ? 'false' : undefined;
    return {
      id: cleanText(raw.id, 80) || `edge-${index + 1}`,
      source: cleanText(raw.source, 80),
      target: cleanText(raw.target, 80),
      ...(condition ? { condition } : {}),
    };
  }).filter(edge => nodeIds.has(edge.source) && nodeIds.has(edge.target) && edge.source !== edge.target);
}

function parseRow(row: WorkflowRow) {
  const nodes = safeNodes(JSON.parse(row.nodes_json || '[]'));
  const nodeIds = new Set(nodes.map(node => node.id));
  return {
    ...row,
    enabled: Boolean(row.enabled),
    nodes,
    edges: safeEdges(JSON.parse(row.edges_json || '[]'), nodeIds),
  };
}

function matchText(config: Record<string, unknown>, text: string) {
  const mode = cleanText(config.matchType || config.mode, 30) || 'contains';
  const source = text.trim();
  const trigger = cleanText(config.triggerText || config.value, 500);
  if (mode === 'all') return true;
  if (!trigger) return false;
  if (mode === 'equals') return source.toLocaleLowerCase() === trigger.toLocaleLowerCase();
  if (mode === 'startsWith') return source.toLocaleLowerCase().startsWith(trigger.toLocaleLowerCase());
  if (mode === 'regex') {
    try { return new RegExp(trigger, 'i').test(source); } catch { return false; }
  }
  return source.toLocaleLowerCase().includes(trigger.toLocaleLowerCase());
}

function renderTemplate(template: unknown, context: WorkflowContext) {
  const values: Record<string, string> = {
    text: context.text,
    pushName: context.pushName,
    remoteJid: context.remoteJid,
    accountId: context.accountId,
    lastAi: context.lastAi,
    ...context.vars,
  };
  return cleanText(template, 8_000).replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (_match, key: string) => values[key] ?? '');
}

function sleep(ms: number) { return new Promise(resolve => setTimeout(resolve, ms)); }

function resolveTarget(config: Record<string, unknown>, context: WorkflowContext) {
  const configured = renderTemplate(config.target ?? config.remoteJid, context);
  const target = configured || context.remoteJid;
  if (!target) throw new Error('Configure um destino no nó de envio ou execute o workflow a partir de uma conversa.');
  return target;
}

function isPrivateAddress(address: string) {
  const normalized = address.toLowerCase();
  if (normalized === '::1' || normalized === '::' || normalized.startsWith('fe80:') || normalized.startsWith('fc') || normalized.startsWith('fd')) return true;
  if (isIP(normalized) !== 4) return false;
  const [a, b] = normalized.split('.').map(Number);
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

async function publicHttpUrl(input: string) {
  let url: URL;
  try { url = new URL(input.trim()); } catch { throw new Error('O nó HTTP precisa de uma URL HTTP/HTTPS válida.'); }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('O nó HTTP aceita somente URLs HTTP ou HTTPS.');
  const host = url.hostname.toLowerCase();
  if (!host || host === 'localhost' || host.endsWith('.local') || isPrivateAddress(host)) throw new Error('O nó HTTP bloqueia endereços locais e privados.');
  const addresses = await lookup(host, { all: true, verbatim: true }).catch(() => []);
  if (!addresses.length || addresses.some(address => isPrivateAddress(address.address))) throw new Error('O destino HTTP não pôde ser validado como público.');
  return url;
}

function requestHeaders(value: unknown, context: WorkflowContext) {
  const headers: Record<string, string> = {};
  const blocked = new Set(['host', 'connection', 'content-length', 'transfer-encoding', 'upgrade']);
  const add = (key: string, raw: unknown) => {
    const name = cleanText(key, 120).toLowerCase();
    const content = renderTemplate(raw, context).slice(0, 2_000);
    if (!name || !content || blocked.has(name) || !/^[a-z0-9-]+$/i.test(name)) return;
    if (Object.keys(headers).length < 24) headers[name] = content;
  };
  if (value && typeof value === 'object' && !Array.isArray(value)) Object.entries(value as Record<string, unknown>).forEach(([key, raw]) => add(key, raw));
  else cleanText(value, 12_000).split(/\r?\n/).forEach(line => { const separator = line.indexOf(':'); if (separator > 0) add(line.slice(0, separator), line.slice(separator + 1).trim()); });
  return headers;
}

async function requestWithLimit(url: URL, init: RequestInit, timeoutMs = 12_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, redirect: 'error', signal: controller.signal });
    const body = (await response.text()).slice(0, 8_000);
    return { response, body };
  } finally { clearTimeout(timer); }
}

export class WorkflowEngine {
  private readonly processed = new Set<string>();
  private readonly running = new Set<string>();
  private readonly scheduleKeys = new Set<string>();

  constructor(
    private readonly db: AttozapDatabase,
    private readonly accounts: AccountManager,
    private readonly chat: ChatService,
    private readonly license: LicenseService,
  ) {
    accounts.on('message', payload => {
      void this.handleMessage(payload.accountId, payload.message);
    });
  }

  list(accountId?: string) {
    const rows = (accountId
      ? this.db.prepare(`SELECT * FROM workflows WHERE account_id=? OR account_id IS NULL ORDER BY updated_at DESC`).all(accountId)
      : this.db.prepare(`SELECT * FROM workflows ORDER BY updated_at DESC`).all()) as WorkflowRow[];
    return rows.map(parseRow);
  }

  get(id: string) {
    const row = this.db.prepare(`SELECT * FROM workflows WHERE id=?`).get(id) as WorkflowRow | undefined;
    return row ? parseRow(row) : undefined;
  }

  create(input: WorkflowInput) {
    const normalized = this.normalizeInput(input);
    const id = randomUUID();
    this.db.prepare(`
      INSERT INTO workflows (id, account_id, name, description, enabled, trigger_type, nodes_json, edges_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, normalized.accountId || null, normalized.name, normalized.description, normalized.enabled ? 1 : 0, normalized.triggerType, JSON.stringify(normalized.nodes), JSON.stringify(normalized.edges));
    this.audit('workflow.create', id, { accountId: normalized.accountId, triggerType: normalized.triggerType });
    return this.get(id);
  }

  update(id: string, input: Partial<WorkflowInput>) {
    const current = this.get(id);
    if (!current) throw new Error('Workflow não encontrado.');
    const normalized = this.normalizeInput({ ...current, ...input, nodes: input.nodes ?? current.nodes, edges: input.edges ?? current.edges });
    this.db.prepare(`
      UPDATE workflows SET account_id=?, name=?, description=?, enabled=?, trigger_type=?, nodes_json=?, edges_json=?, updated_at=CURRENT_TIMESTAMP WHERE id=?
    `).run(normalized.accountId || null, normalized.name, normalized.description, normalized.enabled ? 1 : 0, normalized.triggerType, JSON.stringify(normalized.nodes), JSON.stringify(normalized.edges), id);
    this.audit('workflow.update', id, { enabled: normalized.enabled });
    return this.get(id);
  }

  remove(id: string) {
    this.db.prepare(`DELETE FROM workflows WHERE id=?`).run(id);
    this.audit('workflow.remove', id);
    return true;
  }

  toggle(id: string, enabled: boolean) {
    const current = this.get(id);
    if (!current) throw new Error('Workflow não encontrado.');
    this.license.assertFeature('workflows');
    this.db.prepare(`UPDATE workflows SET enabled=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(enabled ? 1 : 0, id);
    this.audit(enabled ? 'workflow.enable' : 'workflow.disable', id);
    return this.get(id);
  }

  runs(workflowId?: string) {
    return workflowId
      ? this.db.prepare(`SELECT * FROM workflow_runs WHERE workflow_id=? ORDER BY started_at DESC LIMIT 100`).all(workflowId)
      : this.db.prepare(`SELECT * FROM workflow_runs ORDER BY started_at DESC LIMIT 100`).all();
  }

  async run(id: string, input: RunInput = {}) {
    this.license.assertFeature('workflows');
    const workflow = this.get(id);
    if (!workflow) throw new Error('Workflow não encontrado.');
    const accountId = input.accountId || workflow.account_id || this.accounts.list().find(account => account.status === 'connected')?.id;
    if (!accountId) throw new Error('Selecione uma conta WhatsApp para executar o workflow.');
    if (this.running.has(id)) throw new Error('Este workflow já está em execução.');

    const runId = randomUUID();
    const context: WorkflowContext = {
      accountId,
      remoteJid: cleanText(input.remoteJid, 200),
      text: cleanText(input.text),
      pushName: cleanText(input.pushName, 180),
      triggerType: input.triggerType || 'manual',
      lastAi: '',
      vars: {},
    };
    this.db.prepare(`INSERT INTO workflow_runs (id, workflow_id, account_id, trigger_type, status, context_json) VALUES (?, ?, ?, ?, 'running', ?)`).run(runId, id, accountId, context.triggerType, JSON.stringify(context));
    this.running.add(id);
    try {
      await this.execute(workflow.nodes, workflow.edges, context);
      this.db.prepare(`UPDATE workflow_runs SET status='completed', context_json=?, finished_at=CURRENT_TIMESTAMP WHERE id=?`).run(JSON.stringify(context), runId);
      this.db.prepare(`UPDATE workflows SET run_count=run_count+1,last_run_at=CURRENT_TIMESTAMP WHERE id=?`).run(id);
      this.audit('workflow.completed', id, { runId, triggerType: context.triggerType });
      return { runId, status: 'completed', context };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.db.prepare(`UPDATE workflow_runs SET status='failed', error=?, context_json=?, finished_at=CURRENT_TIMESTAMP WHERE id=?`).run(message, JSON.stringify(context), runId);
      this.audit('workflow.failed', id, { runId, message });
      throw new Error(message);
    } finally {
      this.running.delete(id);
    }
  }

  async runDueSchedules() {
    const now = new Date();
    const minute = `${now.toISOString().slice(0, 10)}-${now.getHours()}:${now.getMinutes()}`;
    const workflows = this.list().filter(workflow => workflow.enabled && workflow.trigger_type === 'schedule');
    for (const workflow of workflows) {
      const trigger = workflow.nodes.find(node => node.type === 'trigger_schedule');
      const time = cleanText(trigger?.config.time, 10);
      const days = Array.isArray(trigger?.config.days) ? trigger?.config.days.map(Number) : [0, 1, 2, 3, 4, 5, 6];
      const key = `${workflow.id}:${minute}`;
      if (!time || time !== `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}` || !days.includes(now.getDay()) || this.scheduleKeys.has(key)) continue;
      this.scheduleKeys.add(key);
      void this.run(workflow.id, { triggerType: 'schedule' }).catch(error => console.error('[workflow:schedule]', error));
    }
    if (this.scheduleKeys.size > 10_000) this.scheduleKeys.clear();
  }

  private async handleMessage(accountId: string, message: IncomingMessage) {
    if (!message || message.fromMe || !message.id || this.processed.has(message.id)) return;
    this.processed.add(message.id);
    if (this.processed.size > 5_000) this.processed.clear();
    const workflows = this.list(accountId).filter(workflow => workflow.enabled && workflow.trigger_type === 'message');
    for (const workflow of workflows) {
      const trigger = workflow.nodes.find(node => node.type === 'trigger_message');
      if (trigger && !matchText(trigger.config, message.text)) continue;
      void this.run(workflow.id, {
        triggerType: 'message', accountId, remoteJid: message.remoteJid, text: message.text, pushName: message.pushName,
      }).catch(error => console.error('[workflow:message]', workflow.id, error));
    }
  }

  private async execute(nodes: WorkflowNode[], edges: WorkflowEdge[], context: WorkflowContext) {
    if (!nodes.length) throw new Error('Adicione pelo menos um nó ao workflow.');
    const map = new Map(nodes.map(node => [node.id, node]));
    const incoming = new Set(edges.map(edge => edge.target));
    let current = nodes.find(node => node.type.startsWith('trigger_') && !incoming.has(node.id)) || nodes.find(node => !incoming.has(node.id));
    const visited = new Set<string>();
    let conditionResult: boolean | undefined;
    while (current) {
      if (visited.has(current.id)) throw new Error('O workflow contém um ciclo.');
      visited.add(current.id);
      switch (current.type) {
        case 'trigger_message':
        case 'trigger_schedule':
          break;
        case 'condition_text':
          conditionResult = matchText(current.config, context.text);
          break;
        case 'wait': {
          const seconds = Math.max(0, Math.min(300, Number(current.config.seconds ?? current.config.delaySeconds) || 0));
          if (seconds) await sleep(seconds * 1_000);
          break;
        }
        case 'send_text': {
          const text = renderTemplate(current.config.text, context);
          await this.chat.sendText(context.accountId, resolveTarget(current.config, context), text);
          break;
        }
        case 'send_location': {
          const latitude = Number(current.config.latitude);
          const longitude = Number(current.config.longitude);
          if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) throw new Error('O nó de localização precisa de latitude e longitude válidas.');
          const content: OutboundContent = { type: 'location', input: { latitude, longitude, name: renderTemplate(current.config.name, context), address: renderTemplate(current.config.address, context) } };
          await this.chat.sendContent(context.accountId, resolveTarget(current.config, context), content);
          break;
        }
        case 'send_contact': {
          const displayName = renderTemplate(current.config.displayName || current.config.name, context);
          const phone = renderTemplate(current.config.phone, context).replace(/[^\d+]/g, '');
          if (!displayName || !phone) throw new Error('O nó de contacto precisa de nome e telefone.');
          const content: OutboundContent = { type: 'contact', input: { displayName, phone, organization: renderTemplate(current.config.organization, context) } };
          await this.chat.sendContent(context.accountId, resolveTarget(current.config, context), content);
          break;
        }
        case 'send_poll': {
          const name = renderTemplate(current.config.name || current.config.question, context);
          const values = Array.isArray(current.config.values) ? current.config.values.map(value => renderTemplate(value, context)).filter(Boolean) : renderTemplate(current.config.options, context).split(/\r?\n/).map(value => value.trim()).filter(Boolean);
          if (!name || values.length < 2) throw new Error('O nó de enquete precisa de pergunta e pelo menos duas opções.');
          const content: OutboundContent = { type: 'poll', input: { name, values, selectableCount: Math.max(1, Math.min(values.length, Number(current.config.selectableCount) || 1)) } };
          await this.chat.sendContent(context.accountId, resolveTarget(current.config, context), content);
          break;
        }
        case 'ai_rewrite': {
          const text = renderTemplate(current.config.text || current.config.input || '{{text}}', context);
          const result = await rewriteAiText(this.db, {
            provider: (cleanText(current.config.provider, 80) || 'openai') as AiProviderId,
            model: cleanText(current.config.model, 180) || undefined,
            action: (cleanText(current.config.action, 20) || 'correct') as 'correct' | 'shorten' | 'expand' | 'context',
            text,
            context: renderTemplate(current.config.context, context),
          });
          context.lastAi = result.text;
          context.vars.lastAi = result.text;
          break;
        }
        case 'telegram_send': {
          const tokenVariable = cleanText(current.config.tokenEnv, 100) || 'ATTOZAP_TELEGRAM_BOT_TOKEN';
          const token = cleanText(process.env[tokenVariable] || current.config.botToken, 800);
          const chatId = renderTemplate(current.config.chatId, context).slice(0, 180);
          const text = renderTemplate(current.config.text || '{{text}}', context).slice(0, 4_096);
          if (!token || !/^\d{5,}:[A-Za-z0-9_-]{20,}$/.test(token)) throw new Error('Configure um token de bot Telegram válido no ambiente ou no nó local.');
          if (!chatId || !text) throw new Error('O nó Telegram precisa de chat ID e mensagem.');
          const endpoint = new URL(`https://api.telegram.org/bot${token}/sendMessage`);
          const payload = { chat_id: chatId, text, disable_web_page_preview: Boolean(current.config.disablePreview), ...(cleanText(current.config.parseMode, 20) ? { parse_mode: cleanText(current.config.parseMode, 20) } : {}) };
          const { response, body } = await requestWithLimit(endpoint, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify(payload) });
          if (!response.ok) throw new Error(`Telegram recusou a mensagem (HTTP ${response.status}): ${body.slice(0, 500)}`);
          try { context.vars.telegramMessageId = String((JSON.parse(body) as { result?: { message_id?: unknown } }).result?.message_id ?? ''); } catch { /* resposta válida sem JSON */ }
          break;
        }
        case 'http_request': {
          const url = await publicHttpUrl(renderTemplate(current.config.url, context));
          const method = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(cleanText(current.config.method, 10).toUpperCase()) ? cleanText(current.config.method, 10).toUpperCase() : 'GET';
          const body = renderTemplate(current.config.body, context).slice(0, 32_000);
          const headers = requestHeaders(current.config.headers, context);
          if (body && !headers['content-type']) headers['content-type'] = 'application/json';
          const { response, body: responseBody } = await requestWithLimit(url, { method, headers, ...(method === 'GET' || method === 'DELETE' || !body ? {} : { body }) });
          context.vars.httpStatus = String(response.status);
          context.vars.httpBody = responseBody;
          if (!response.ok && current.config.continueOnError !== true) throw new Error(`Pedido HTTP falhou com status ${response.status}.`);
          break;
        }
      }
      const candidates = edges.filter(edge => edge.source === current!.id && (edge.condition === undefined || edge.condition === (conditionResult ? 'true' : 'false')));
      const next = candidates[0];
      conditionResult = undefined;
      current = next ? map.get(next.target) : undefined;
    }
  }

  private normalizeInput(input: WorkflowInput): WorkflowInput & { nodes: WorkflowNode[]; edges: WorkflowEdge[]; name: string; description: string; triggerType: 'manual' | 'message' | 'schedule' } {
    const nodes = safeNodes(input.nodes);
    const edges = safeEdges(input.edges, new Set(nodes.map(node => node.id)));
    const trigger = input.triggerType || (nodes.find(node => node.type === 'trigger_message') ? 'message' : nodes.find(node => node.type === 'trigger_schedule') ? 'schedule' : 'manual');
    return {
      accountId: cleanText(input.accountId, 100) || null,
      name: cleanText(input.name, 140) || 'Workflow sem nome',
      description: cleanText(input.description, 1_000),
      enabled: Boolean(input.enabled),
      triggerType: trigger,
      nodes,
      edges,
    };
  }

  private audit(action: string, entityId: string, metadata?: unknown) {
    this.db.prepare(`INSERT INTO audit_log (actor, action, entity_type, entity_id, metadata_json) VALUES ('system', ?, 'workflow', ?, ?)`).run(action, entityId, metadata ? JSON.stringify(metadata) : null);
  }
}

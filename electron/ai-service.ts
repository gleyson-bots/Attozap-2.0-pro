import type { AttozapDatabase } from './database.js';
import { getSecureSetting } from './secure-settings.js';

export type AiProviderId = 'openai' | 'anthropic' | 'nvidia' | 'groq' | 'openrouter' | 'poolside' | 'xai';
export type AiRole = 'system' | 'user' | 'assistant';
export type AiMessage = { role: AiRole; content: string };

export type AiChatInput = {
  provider: AiProviderId;
  model?: string;
  messages: AiMessage[];
  system?: string;
  temperature?: number;
  maxTokens?: number;
};

type ProviderConfig = {
  id: AiProviderId;
  label: string;
  apiKeySetting: string;
  modelSetting: string;
  baseSetting?: string;
  defaultBase: string;
  defaultModel: string;
  protocol: 'openai' | 'anthropic';
};

const PROVIDERS: Record<AiProviderId, ProviderConfig> = {
  openai: { id: 'openai', label: 'OpenAI', apiKeySetting: 'ai_openai_key', modelSetting: 'ai_openai_model', defaultBase: 'https://api.openai.com/v1', defaultModel: 'gpt-4o-mini', protocol: 'openai' },
  anthropic: { id: 'anthropic', label: 'Anthropic', apiKeySetting: 'ai_anthropic_key', modelSetting: 'ai_anthropic_model', defaultBase: 'https://api.anthropic.com/v1', defaultModel: 'claude-3-5-haiku-latest', protocol: 'anthropic' },
  nvidia: { id: 'nvidia', label: 'NVIDIA NIM', apiKeySetting: 'ai_nvidia_key', modelSetting: 'ai_nvidia_model', defaultBase: 'https://integrate.api.nvidia.com/v1', defaultModel: 'meta/llama-3.1-8b-instruct', protocol: 'openai' },
  groq: { id: 'groq', label: 'Groq', apiKeySetting: 'ai_groq_key', modelSetting: 'ai_groq_model', defaultBase: 'https://api.groq.com/openai/v1', defaultModel: 'llama-3.3-70b-versatile', protocol: 'openai' },
  openrouter: { id: 'openrouter', label: 'OpenRouter', apiKeySetting: 'ai_openrouter_key', modelSetting: 'ai_openrouter_model', defaultBase: 'https://openrouter.ai/api/v1', defaultModel: 'openai/gpt-4o-mini', protocol: 'openai' },
  poolside: { id: 'poolside', label: 'Poolside', apiKeySetting: 'ai_poolside_key', modelSetting: 'ai_poolside_model', baseSetting: 'ai_poolside_base_url', defaultBase: '', defaultModel: 'model', protocol: 'openai' },
  xai: { id: 'xai', label: 'xAI / Grok', apiKeySetting: 'ai_xai_key', modelSetting: 'ai_xai_model', defaultBase: 'https://api.x.ai/v1', defaultModel: 'grok-4-fast-non-reasoning', protocol: 'openai' },
};

function setting(db: AttozapDatabase, key: string) {
  const row = db.prepare(`SELECT value FROM settings WHERE key=?`).get(key) as { value?: string } | undefined;
  return row?.value?.trim() || undefined;
}

function secret(db: AttozapDatabase, key: string) {
  return getSecureSetting(db, key)?.trim() || undefined;
}

function normalizeBase(value: string) { return value.replace(/\/+$/, ''); }

function providerConfig(db: AttozapDatabase, id: AiProviderId) {
  const config = PROVIDERS[id];
  if (!config) throw new Error(`Provedor IA não suportado: ${id}`);
  const configuredBase = config.baseSetting ? setting(db, config.baseSetting) : undefined;
  const base = normalizeBase(configuredBase || config.defaultBase);
  if (!base) throw new Error(`Configure a URL do deployment do ${config.label} em Configurações.`);
  return {
    ...config,
    base: config.id === 'poolside' && !/\/openai\/v1$/i.test(base) ? `${base}/openai/v1` : base,
    key: secret(db, config.apiKeySetting),
    model: setting(db, config.modelSetting) || config.defaultModel,
  };
}

function safeMessages(input: AiChatInput) {
  if (!Array.isArray(input.messages) || !input.messages.length) throw new Error('Envie pelo menos uma mensagem para a IA.');
  const messages = input.messages.slice(-32).map(message => ({
    role: message.role,
    content: String(message.content ?? '').trim().slice(0, 12_000),
  })).filter(message => ['system', 'user', 'assistant'].includes(message.role) && message.content);
  if (!messages.length) throw new Error('As mensagens enviadas para a IA estão vazias.');
  const total = messages.reduce((sum, message) => sum + message.content.length, 0);
  if (total > 80_000) throw new Error('O histórico da conversa é grande demais. Reduza o número de mensagens.');
  return messages;
}

function clampNumber(value: unknown, fallback: number, min: number, max: number) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
}

async function requestJson(url: string, init: RequestInit, timeoutMs = 45_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const body = await response.json().catch(() => ({})) as any;
    if (!response.ok) throw new Error(body?.error?.message || body?.error?.type || `HTTP ${response.status}`);
    return body;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw new Error('O provedor IA excedeu o tempo limite de 45 segundos.');
    throw error;
  } finally { clearTimeout(timer); }
}

export function listAiProviders(db: AttozapDatabase) {
  return Object.values(PROVIDERS).map(config => {
    const current = providerConfig(db, config.id);
    return { id: config.id, label: config.label, model: current.model, configured: Boolean(current.key), protocol: config.protocol };
  });
}

export async function chatWithAi(db: AttozapDatabase, input: AiChatInput) {
  const config = providerConfig(db, input.provider);
  if (!config.key) throw new Error(`Configure a API key do ${config.label} em Configurações.`);
  const messages = safeMessages(input);
  const system = String(input.system ?? 'Você é um assistente útil dentro do ATTOZAP. Responda de forma clara, objetiva e segura.').trim().slice(0, 8_000);
  const model = String(input.model ?? config.model).trim().slice(0, 180) || config.model;
  const temperature = clampNumber(input.temperature, 0.6, 0, 2);
  const maxTokens = Math.round(clampNumber(input.maxTokens, 800, 64, 4_096));

  if (config.protocol === 'anthropic') {
    const anthropicMessages = messages.filter(message => message.role !== 'system');
    const body = await requestJson(`${config.base}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': config.key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model, system, messages: anthropicMessages, temperature, max_tokens: maxTokens }),
    });
    const text = Array.isArray(body?.content) ? body.content.filter((part: any) => part?.type === 'text').map((part: any) => part.text).join('') : '';
    if (!text.trim()) throw new Error('A Anthropic não retornou texto.');
    return { provider: config.id, model, text: text.trim() };
  }

  const body = await requestJson(`${config.base}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.key}` },
    body: JSON.stringify({ model, messages: [{ role: 'system', content: system }, ...messages.filter(message => message.role !== 'system')], temperature, max_tokens: maxTokens }),
  });
  const text = String(body?.choices?.[0]?.message?.content ?? '').trim();
  if (!text) throw new Error(`O ${config.label} não retornou texto.`);
  return { provider: config.id, model, text };
}

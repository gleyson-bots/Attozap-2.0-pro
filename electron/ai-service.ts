import type { AttozapDatabase } from './database.js';
import { getSecureSetting } from './secure-settings.js';

export type AiProviderId = 'openai' | 'anthropic' | 'nvidia' | 'groq' | 'openrouter' | 'poolside' | 'xai' | 'pollinations' | 'huggingface';
export type AiRole = 'system' | 'user' | 'assistant';
export type AiMessage = { role: AiRole; content: string };
export type AiTextAction = 'correct' | 'shorten' | 'expand' | 'context';

export type AiChatInput = {
  provider: AiProviderId;
  model?: string;
  messages: AiMessage[];
  system?: string;
  temperature?: number;
  maxTokens?: number;
};

export type AiRewriteInput = {
  provider: AiProviderId;
  model?: string;
  action: AiTextAction;
  text: string;
  context?: string;
};

export type AiImageInput = {
  provider: AiProviderId;
  model?: string;
  prompt: string;
  negativePrompt?: string;
  width?: number;
  height?: number;
  aspectRatio?: string;
  quality?: 'auto' | 'low' | 'medium' | 'high';
  outputFormat?: 'png' | 'jpeg' | 'webp';
  seed?: number;
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
  image?: {
    keySetting: string;
    modelSetting: string;
    baseSetting?: string;
    defaultBase: string;
    defaultModel: string;
    protocol: 'openai-images' | 'openrouter-images' | 'pollinations' | 'huggingface';
  };
};

const PROVIDERS: Record<AiProviderId, ProviderConfig> = {
  openai: {
    id: 'openai', label: 'OpenAI', apiKeySetting: 'ai_openai_key', modelSetting: 'ai_openai_model', defaultBase: 'https://api.openai.com/v1', defaultModel: 'gpt-4o-mini', protocol: 'openai',
    image: { keySetting: 'ai_openai_key', modelSetting: 'ai_openai_image_model', defaultBase: 'https://api.openai.com/v1', defaultModel: 'gpt-image-1', protocol: 'openai-images' },
  },
  anthropic: { id: 'anthropic', label: 'Anthropic', apiKeySetting: 'ai_anthropic_key', modelSetting: 'ai_anthropic_model', defaultBase: 'https://api.anthropic.com/v1', defaultModel: 'claude-3-5-haiku-latest', protocol: 'anthropic' },
  nvidia: { id: 'nvidia', label: 'NVIDIA NIM', apiKeySetting: 'ai_nvidia_key', modelSetting: 'ai_nvidia_model', defaultBase: 'https://integrate.api.nvidia.com/v1', defaultModel: 'meta/llama-3.1-8b-instruct', protocol: 'openai' },
  groq: { id: 'groq', label: 'Groq', apiKeySetting: 'ai_groq_key', modelSetting: 'ai_groq_model', defaultBase: 'https://api.groq.com/openai/v1', defaultModel: 'llama-3.3-70b-versatile', protocol: 'openai' },
  openrouter: {
    id: 'openrouter', label: 'OpenRouter', apiKeySetting: 'ai_openrouter_key', modelSetting: 'ai_openrouter_model', defaultBase: 'https://openrouter.ai/api/v1', defaultModel: 'openai/gpt-4o-mini', protocol: 'openai',
    image: { keySetting: 'ai_openrouter_key', modelSetting: 'ai_openrouter_image_model', defaultBase: 'https://openrouter.ai/api/v1', defaultModel: 'openai/gpt-image-1', protocol: 'openrouter-images' },
  },
  poolside: { id: 'poolside', label: 'Poolside', apiKeySetting: 'ai_poolside_key', modelSetting: 'ai_poolside_model', baseSetting: 'ai_poolside_base_url', defaultBase: '', defaultModel: 'model', protocol: 'openai' },
  xai: { id: 'xai', label: 'xAI / Grok', apiKeySetting: 'ai_xai_key', modelSetting: 'ai_xai_model', defaultBase: 'https://api.x.ai/v1', defaultModel: 'grok-4-fast-non-reasoning', protocol: 'openai' },
  pollinations: {
    id: 'pollinations', label: 'Pollinations AI', apiKeySetting: 'ai_pollinations_key', modelSetting: 'ai_pollinations_model', defaultBase: 'https://text.pollinations.ai', defaultModel: 'openai', protocol: 'openai',
    image: { keySetting: 'ai_pollinations_key', modelSetting: 'ai_pollinations_image_model', defaultBase: 'https://image.pollinations.ai', defaultModel: 'flux', protocol: 'pollinations' },
  },
  huggingface: {
    id: 'huggingface', label: 'Hugging Face Inference', apiKeySetting: 'ai_huggingface_key', modelSetting: 'ai_huggingface_model', defaultBase: 'https://router.huggingface.co/hf-inference', defaultModel: 'meta-llama/Llama-3.1-8B-Instruct', protocol: 'openai',
    image: { keySetting: 'ai_huggingface_key', modelSetting: 'ai_huggingface_image_model', defaultBase: 'https://router.huggingface.co/hf-inference/models', defaultModel: 'black-forest-labs/FLUX.1-dev', protocol: 'huggingface' },
  },
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

function imageConfig(db: AttozapDatabase, id: AiProviderId) {
  const config = PROVIDERS[id];
  if (!config?.image) throw new Error(`${config?.label ?? id} não oferece geração de imagens configurada.`);
  const image = config.image;
  const configuredBase = image.baseSetting ? setting(db, image.baseSetting) : undefined;
  const base = normalizeBase(configuredBase || image.defaultBase);
  if (!base) throw new Error(`Configure a URL de imagens do ${config.label} em Configurações.`);
  return { config, image, base, key: secret(db, image.keySetting), model: setting(db, image.modelSetting) || image.defaultModel };
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

function safePrompt(value: unknown, max = 12_000) {
  return String(value ?? '').trim().slice(0, max);
}

async function requestJson(url: string, init: RequestInit, timeoutMs = 45_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const body = await response.json().catch(() => ({})) as any;
    if (!response.ok) throw new Error(body?.error?.message || body?.error?.type || body?.message || `HTTP ${response.status}`);
    return body;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw new Error('O provedor IA excedeu o tempo limite de 45 segundos.');
    throw error;
  } finally { clearTimeout(timer); }
}

async function requestBinary(url: string, init: RequestInit, timeoutMs = 90_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const contentType = response.headers.get('content-type') || '';
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      let message = body;
      try { message = String((JSON.parse(body) as any)?.error?.message || (JSON.parse(body) as any)?.error || body); } catch { /* resposta não JSON */ }
      throw new Error(message || `HTTP ${response.status}`);
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    if (!bytes.length || bytes.length > 25 * 1024 * 1024) throw new Error('O provedor devolveu uma imagem vazia ou demasiado grande.');
    return { bytes, contentType: contentType.split(';')[0].trim() || 'image/png' };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw new Error('A geração da imagem excedeu o tempo limite de 90 segundos.');
    throw error;
  } finally { clearTimeout(timer); }
}

function imageResultFromBytes(bytes: Buffer, mediaType: string) {
  const safeType = /^image\/(png|jpeg|webp|gif)$/i.test(mediaType) ? mediaType.toLowerCase() : 'image/png';
  return { dataUrl: `data:${safeType};base64,${bytes.toString('base64')}`, mediaType: safeType };
}

function imageResultFromBase64(value: unknown, mediaType: unknown) {
  const base64 = String(value ?? '').replace(/^data:[^;]+;base64,/, '').trim();
  if (!base64 || !/^[A-Za-z0-9+/=]+$/.test(base64)) throw new Error('O provedor devolveu uma imagem inválida.');
  const bytes = Buffer.from(base64, 'base64');
  if (!bytes.length || bytes.length > 25 * 1024 * 1024) throw new Error('A imagem devolvida pelo provedor excede o limite de 25 MiB.');
  return imageResultFromBytes(bytes, String(mediaType || 'image/png'));
}

export function listAiProviders(db: AttozapDatabase) {
  return Object.values(PROVIDERS).map(config => {
    const configuredBase = config.baseSetting ? setting(db, config.baseSetting) : undefined;
    const base = configuredBase || config.defaultBase;
    const key = secret(db, config.apiKeySetting);
    const model = setting(db, config.modelSetting) || config.defaultModel;
    const image = config.image;
    const imageKey = image ? secret(db, image.keySetting) : undefined;
    const imageModel = image ? setting(db, image.modelSetting) || image.defaultModel : undefined;
    return {
      id: config.id,
      label: config.label,
      model,
      configured: Boolean(key && base),
      protocol: config.protocol,
      imageSupported: Boolean(image),
      imageModel,
      imageConfigured: Boolean(image && (image.protocol === 'pollinations' ? (image.baseSetting ? setting(db, image.baseSetting) : image.defaultBase) : imageKey && (image.baseSetting ? setting(db, image.baseSetting) : image.defaultBase))),
    };
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

const REWRITE_INSTRUCTIONS: Record<AiTextAction, string> = {
  correct: 'Corrija ortografia, acentuação, gramática e pontuação. Preserve o idioma, a intenção, o tom e as quebras de linha. Não acrescente explicações; devolva apenas o texto corrigido.',
  shorten: 'Encurte a mensagem mantendo a intenção, os dados importantes e um tom natural. Não acrescente explicações; devolva apenas a versão curta.',
  expand: 'Aumente e desenvolva a mensagem com contexto útil, clareza e tom natural. Não invente dados específicos que não estejam no texto. Devolva apenas a versão expandida.',
  context: 'Reescreva a mensagem para dar mais contexto e tornar o pedido claro para quem recebe, sem mudar a intenção nem inventar factos. Devolva apenas o texto final.',
};

export async function rewriteAiText(db: AttozapDatabase, input: AiRewriteInput) {
  const text = safePrompt(input.text, 8_000);
  if (!text) throw new Error('Escreva algum texto antes de pedir ajuda à IA.');
  const action = input.action;
  if (!REWRITE_INSTRUCTIONS[action]) throw new Error('Ação de edição IA inválida.');
  const context = safePrompt(input.context, 2_000);
  const result = await chatWithAi(db, {
    provider: input.provider,
    model: input.model,
    system: `Você é um editor de mensagens do ATTOZAP. ${REWRITE_INSTRUCTIONS[action]}${context ? ` Contexto adicional: ${context}` : ''}`,
    messages: [{ role: 'user', content: text }],
    temperature: 0.25,
    maxTokens: 1_600,
  });
  return { ...result, action };
}

export async function generateAiImage(db: AttozapDatabase, input: AiImageInput) {
  const prompt = safePrompt(input.prompt);
  if (!prompt) throw new Error('Descreva a imagem que deseja gerar.');
  const { config, image, base, key, model: configuredModel } = imageConfig(db, input.provider);
  if (!key && image.protocol !== 'pollinations') throw new Error(`Configure a API key de imagens do ${config.label} em Configurações.`);
  const model = safePrompt(input.model || configuredModel, 180) || configuredModel;
  const width = Math.round(clampNumber(input.width, 1024, 256, 2048));
  const height = Math.round(clampNumber(input.height, 1024, 256, 2048));
  const seed = Number.isFinite(Number(input.seed)) ? Math.round(Number(input.seed)) : undefined;
  const outputFormat = input.outputFormat || 'png';
  const aspectRatio = safePrompt(input.aspectRatio, 20) || '1:1';

  if (image.protocol === 'pollinations') {
    const url = new URL(`${base}/prompt/${encodeURIComponent(prompt)}`);
    url.searchParams.set('model', model);
    url.searchParams.set('width', String(width));
    url.searchParams.set('height', String(height));
    url.searchParams.set('safe', 'true');
    if (seed !== undefined) url.searchParams.set('seed', String(seed));
    if (key) url.searchParams.set('key', key);
    return { provider: config.id, model, url: url.toString(), mediaType: 'image/png', width, height };
  }

  if (image.protocol === 'huggingface') {
    const response = await requestBinary(`${base}/${model.split('/').map(encodeURIComponent).join('/')}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ inputs: prompt, parameters: { width, height, negative_prompt: safePrompt(input.negativePrompt, 4_000) || undefined, seed } }),
    });
    return { provider: config.id, model, ...imageResultFromBytes(response.bytes, response.contentType), width, height };
  }

  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` };
  if (image.protocol === 'openrouter-images') {
    const body = await requestJson(`${base}/images`, {
      method: 'POST', headers,
      body: JSON.stringify({ model, prompt, n: 1, aspect_ratio: aspectRatio, size: `${width}x${height}`, quality: input.quality || 'auto', output_format: outputFormat }),
    });
    const item = body?.data?.[0] ?? body?.images?.[0];
    if (item?.url) return { provider: config.id, model, url: String(item.url), mediaType: String(item.media_type || `image/${outputFormat}`), width, height };
    return { provider: config.id, model, ...imageResultFromBase64(item?.b64_json ?? item?.base64 ?? item?.data, item?.media_type || `image/${outputFormat}`), width, height };
  }

  const openAiSize = width / height > 1.25 ? '1536x1024' : height / width > 1.25 ? '1024x1536' : '1024x1024';
  const body = await requestJson(`${base}/images/generations`, {
    method: 'POST', headers,
    body: JSON.stringify({ model, prompt, n: 1, size: openAiSize, quality: input.quality === 'auto' ? undefined : input.quality, output_format: outputFormat }),
  });
  const item = body?.data?.[0];
  if (item?.url) return { provider: config.id, model, url: String(item.url), mediaType: `image/${outputFormat}`, width, height };
  return { provider: config.id, model, ...imageResultFromBase64(item?.b64_json ?? item?.base64, `image/${outputFormat}`), width, height };
}

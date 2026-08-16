import type { AttozapDatabase } from '../database.js';

export type WarmupAiProvider = 'xai' | 'poolside';

function setting(db: AttozapDatabase, key: string) {
  const row = db.prepare(`SELECT value FROM settings WHERE key=?`).get(key) as { value?: string } | undefined;
  return row?.value?.trim() || undefined;
}

function normalizeBase(value: string) { return value.replace(/\/+$/, ''); }

export async function generateWarmupText(db: AttozapDatabase, input: {
  provider: WarmupAiProvider;
  model?: string;
  prompt?: string;
  target: string;
  recentMessages?: string[];
}) {
  const provider = input.provider;
  const key = provider === 'xai' ? setting(db, 'ai_xai_key') : setting(db, 'ai_poolside_key');
  if (!key) throw new Error(provider === 'xai' ? 'Configure a chave da xAI/Grok em Configurações' : 'Configure a chave da Poolside em Configurações');

  const configuredBase = provider === 'xai' ? 'https://api.x.ai/v1' : setting(db, 'ai_poolside_base_url');
  if (!configuredBase) throw new Error('Configure a URL do deployment Poolside em Configurações');
  let base = normalizeBase(configuredBase);
  if (provider === 'poolside' && !/\/openai\/v1$/i.test(base)) base += '/openai/v1';

  const model = input.model?.trim()
    || (provider === 'xai' ? setting(db, 'ai_xai_model') : setting(db, 'ai_poolside_model'))
    || (provider === 'xai' ? 'grok-4-fast-non-reasoning' : 'model');
  const custom = input.prompt?.trim() || 'Conversa casual curta e natural entre contas próprias de teste. Sem marketing, links, promoções, solicitações financeiras ou conteúdo enganoso.';
  const history = (input.recentMessages ?? []).slice(-5).join('\n');
  const system = [
    'Você escreve UMA mensagem curta em português do Brasil para um ambiente privado de teste do próprio usuário.',
    'A mensagem deve parecer uma conversa humana cotidiana, respeitosa e não promocional.',
    'Não gere spam, propaganda, engenharia social, pedidos de senha/código, links, ofertas ou instruções para burlar plataformas.',
    'Responda somente com o texto da mensagem, no máximo 220 caracteres.',
    custom,
  ].join(' ');
  const user = `Destino de teste: ${input.target}. ${history ? `Mensagens recentes:\n${history}\n` : ''}Gere a próxima mensagem.`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model, messages: [{ role: 'system', content: system }, { role: 'user', content: user }], temperature: 0.75, max_tokens: 100 }),
      signal: controller.signal,
    });
    const body = await response.json().catch(() => ({})) as any;
    if (!response.ok) throw new Error(`${provider === 'xai' ? 'xAI' : 'Poolside'}: ${body?.error?.message ?? `HTTP ${response.status}`}`);
    const text = String(body?.choices?.[0]?.message?.content ?? '').trim().replace(/^['"]|['"]$/g, '');
    if (!text) throw new Error('A IA não retornou texto');
    return text.slice(0, 500);
  } finally { clearTimeout(timeout); }
}

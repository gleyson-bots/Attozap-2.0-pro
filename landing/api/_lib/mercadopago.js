import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

const API = 'https://api.mercadopago.com';

function accessToken() {
  const token = String(process.env.MERCADOPAGO_ACCESS_TOKEN || '').trim();
  if (!token) throw Object.assign(new Error('Mercado Pago ainda não configurado no portal'), { statusCode: 503 });
  return token;
}

export function mercadoPagoConfigured() {
  return Boolean(String(process.env.MERCADOPAGO_ACCESS_TOKEN || '').trim());
}

export async function mpRequest(path, { method = 'GET', body, idempotencyKey } = {}) {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken()}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(idempotencyKey ? { 'X-Idempotency-Key': idempotencyKey } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data?.message || data?.error || data?.cause?.[0]?.description || `Mercado Pago retornou HTTP ${response.status}`;
    throw Object.assign(new Error(message), { statusCode: response.status >= 500 ? 502 : 400, providerStatus: response.status, providerData: data });
  }
  return data;
}

export async function createMercadoPagoSubscription({ user, plan, baseUrl }) {
  if (!plan?.price_cents || Number(plan.price_cents) <= 0) throw Object.assign(new Error('Este plano não possui valor recorrente válido'), { statusCode: 400 });
  const externalReference = `attozap:${user.id}:${plan.id}`;
  const payload = {
    reason: `ATTOZAP ${plan.name}`,
    external_reference: externalReference,
    payer_email: user.email,
    auto_recurring: {
      frequency: 1,
      frequency_type: 'months',
      transaction_amount: Number((Number(plan.price_cents) / 100).toFixed(2)),
      currency_id: 'BRL',
    },
    back_url: `${baseUrl}/portal?checkout=success&provider=mercadopago`,
    status: 'pending',
  };
  const result = await mpRequest('/preapproval', { method: 'POST', body: payload });
  if (!result?.id || !result?.init_point) throw Object.assign(new Error('Mercado Pago não retornou URL de assinatura'), { statusCode: 502 });
  return result;
}

export async function createMercadoPagoPixPayment({ user, plan, payerDocument, baseUrl }) {
  if (!plan?.price_cents || Number(plan.price_cents) <= 0) throw Object.assign(new Error('Este plano não possui valor válido para PIX'), { statusCode: 400 });
  const cpf = String(payerDocument || '').replace(/\D/g, '');
  if (!/^\d{11}$/.test(cpf)) throw Object.assign(new Error('Informe um CPF válido com 11 dígitos para gerar o PIX'), { statusCode: 400 });

  const externalReference = `attozap-pix:${user.id}:${plan.id}`;
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
  const payload = {
    transaction_amount: Number((Number(plan.price_cents) / 100).toFixed(2)),
    description: `ATTOZAP ${plan.name} - 30 dias`,
    payment_method_id: 'pix',
    external_reference: externalReference,
    notification_url: `${baseUrl}/api/mercadopago-webhook?source_news=webhooks`,
    date_of_expiration: expiresAt,
    payer: {
      email: user.email,
      identification: { type: 'CPF', number: cpf },
    },
    metadata: { attozap_user_id: user.id, attozap_plan_id: plan.id, product: 'attozap_license_30d' },
  };
  const result = await mpRequest('/v1/payments', { method: 'POST', body: payload, idempotencyKey: randomUUID() });
  const transaction = result?.point_of_interaction?.transaction_data || {};
  if (!result?.id || !transaction.qr_code) throw Object.assign(new Error('Mercado Pago não retornou os dados do PIX'), { statusCode: 502 });
  return { ...result, pixExpiresAt: expiresAt };
}

export async function getMercadoPagoSubscription(id) {
  return mpRequest(`/preapproval/${encodeURIComponent(String(id))}`);
}

export async function getMercadoPagoAuthorizedPayment(id) {
  return mpRequest(`/authorized_payments/${encodeURIComponent(String(id))}`);
}

export async function getMercadoPagoPayment(id) {
  return mpRequest(`/v1/payments/${encodeURIComponent(String(id))}`);
}

export async function cancelMercadoPagoSubscription(id) {
  return mpRequest(`/preapproval/${encodeURIComponent(String(id))}`, { method: 'PUT', body: { status: 'cancelled' } });
}

export function parseMercadoPagoReference(reference) {
  const raw = String(reference || '');
  let match = /^attozap:([^:]+):([^:]+)$/.exec(raw);
  if (match) return { kind: 'subscription', userId: match[1], planId: match[2] };
  match = /^attozap-pix:([^:]+):([^:]+)$/.exec(raw);
  if (match) return { kind: 'pix', userId: match[1], planId: match[2] };
  return null;
}

export function verifyMercadoPagoWebhook(req, dataId) {
  const secret = String(process.env.MERCADOPAGO_WEBHOOK_SECRET || '').trim();
  if (!secret) throw Object.assign(new Error('MERCADOPAGO_WEBHOOK_SECRET não configurado'), { statusCode: 503 });
  const signature = String(req.headers?.['x-signature'] || '');
  const requestId = String(req.headers?.['x-request-id'] || '');
  const parts = Object.fromEntries(signature.split(',').map(part => part.trim().split('=').map(value => value.trim())).filter(([key,value]) => key && value));
  const ts = parts.ts;
  const provided = parts.v1;
  if (!ts || !provided) return false;
  const manifestParts = [];
  if (dataId) manifestParts.push(`id:${String(dataId).toLowerCase()};`);
  if (requestId) manifestParts.push(`request-id:${requestId};`);
  manifestParts.push(`ts:${ts};`);
  const expected = createHmac('sha256', secret).update(manifestParts.join('')).digest('hex');
  try {
    const a = Buffer.from(expected, 'hex');
    const b = Buffer.from(provided, 'hex');
    return a.length === b.length && timingSafeEqual(a, b);
  } catch { return false; }
}

import { createHmac, timingSafeEqual } from 'node:crypto';

const API = 'https://api.mercadopago.com';

function accessToken() {
  const token = String(process.env.MERCADOPAGO_ACCESS_TOKEN || '').trim();
  if (!token) throw Object.assign(new Error('Mercado Pago ainda não configurado no portal'), { statusCode: 503 });
  return token;
}

export function mercadoPagoConfigured() {
  return Boolean(String(process.env.MERCADOPAGO_ACCESS_TOKEN || '').trim());
}

export async function mpRequest(path, { method = 'GET', body } = {}) {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken()}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data?.message || data?.error || data?.cause?.[0]?.description || `Mercado Pago retornou HTTP ${response.status}`;
    throw Object.assign(new Error(message), { statusCode: response.status >= 500 ? 502 : 400, providerStatus: response.status });
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
  const match = /^attozap:([^:]+):([^:]+)$/.exec(String(reference || ''));
  return match ? { userId: match[1], planId: match[2] } : null;
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

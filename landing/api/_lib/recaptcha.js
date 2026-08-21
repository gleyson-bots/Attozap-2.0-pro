function secretKey() {
  return String(process.env.RECAPTCHA_SECRET_KEY || '').trim();
}

export function recaptchaConfigured() {
  return Boolean(secretKey());
}

export async function verifyRecaptcha(req, token) {
  const secret = secretKey();
  if (!secret) return { configured: false, success: true };

  const responseToken = String(token || '').trim();
  if (!responseToken) {
    throw Object.assign(new Error('Confirme o reCAPTCHA para continuar'), { statusCode: 400 });
  }

  const params = new URLSearchParams({
    secret,
    response: responseToken,
  });
  const forwarded = String(req.headers?.['x-forwarded-for'] || '').split(',')[0].trim();
  if (forwarded) params.set('remoteip', forwarded);

  const response = await fetch('https://www.google.com/recaptcha/api/siteverify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw Object.assign(new Error('Não foi possível validar o reCAPTCHA agora'), { statusCode: 502 });
  }
  if (!result.success) {
    throw Object.assign(new Error('reCAPTCHA inválido ou expirado. Marque novamente a caixa.'), {
      statusCode: 400,
      recaptchaCodes: result['error-codes'] || [],
    });
  }

  const allowed = String(process.env.RECAPTCHA_ALLOWED_HOSTNAMES || '')
    .split(',')
    .map(value => value.trim().toLowerCase())
    .filter(Boolean);
  const hostname = String(result.hostname || '').toLowerCase();
  if (allowed.length && hostname && !allowed.includes(hostname)) {
    throw Object.assign(new Error('reCAPTCHA recusado para este domínio'), { statusCode: 403 });
  }

  return { configured: true, success: true, hostname };
}

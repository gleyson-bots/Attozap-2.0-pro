export function initReferralCapture() {
  const code = String(new URLSearchParams(location.search).get('ref') || '').trim().toUpperCase();
  if (!code || window.__attozapReferralFetchPatched) return;
  window.__attozapReferralFetchPatched = true;
  const nativeFetch = window.fetch.bind(window);
  window.fetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input?.url || '';
    const method = String(init?.method || (typeof input !== 'string' ? input?.method : '') || 'GET').toUpperCase();
    if (!/\/api\/auth(?:\?|$)/.test(url) || method !== 'POST' || !init?.body) return nativeFetch(input, init);
    let payload;
    try { payload = JSON.parse(String(init.body)); } catch { return nativeFetch(input, init); }
    if (String(payload.action || '') !== 'register') return nativeFetch(input, init);
    payload.referralCode = code;
    return nativeFetch(input, { ...init, body: JSON.stringify(payload) });
  };
}

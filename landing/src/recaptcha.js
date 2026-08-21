const siteKey = String(import.meta.env.VITE_RECAPTCHA_SITE_KEY || '').trim();

let widgetId = null;
let widgetHost = null;
let loadingPromise = null;

function recaptchaApi() {
  return window.grecaptcha;
}

function resetWidget() {
  try {
    if (widgetId !== null && recaptchaApi()) recaptchaApi().reset(widgetId);
  } catch {}
}

function currentToken() {
  try {
    if (widgetId === null || !recaptchaApi()) return '';
    return String(recaptchaApi().getResponse(widgetId) || '');
  } catch { return ''; }
}

function loadGoogleScript() {
  if (!siteKey) return Promise.resolve(false);
  if (recaptchaApi()?.render) return Promise.resolve(true);
  if (loadingPromise) return loadingPromise;

  loadingPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-attozap-recaptcha]');
    if (existing) {
      const started = Date.now();
      const timer = setInterval(() => {
        if (recaptchaApi()?.render) { clearInterval(timer); resolve(true); }
        else if (Date.now() - started > 12000) { clearInterval(timer); reject(new Error('Falha ao carregar o reCAPTCHA')); }
      }, 100);
      return;
    }
    window.__attozapRecaptchaReady = () => resolve(true);
    const script = document.createElement('script');
    script.src = 'https://www.google.com/recaptcha/api.js?onload=__attozapRecaptchaReady&render=explicit&hl=pt-BR';
    script.async = true;
    script.defer = true;
    script.dataset.attozapRecaptcha = 'true';
    script.onerror = () => reject(new Error('Falha ao carregar o reCAPTCHA'));
    document.head.appendChild(script);
  });
  return loadingPromise;
}

async function renderWidget() {
  if (!siteKey) return;
  const form = document.querySelector('.auth-form');
  if (!form) return;

  let shell = form.querySelector('[data-recaptcha-shell]');
  if (!shell) {
    shell = document.createElement('div');
    shell.className = 'recaptcha-shell';
    shell.dataset.recaptchaShell = 'true';
    shell.innerHTML = '<div class="recaptcha-loading">Carregando verificação de segurança…</div><div class="recaptcha-widget"></div>';
    const submit = form.querySelector('button[type="submit"],button.portal-button');
    if (submit) form.insertBefore(shell, submit);
    else form.appendChild(shell);
  }

  if (widgetHost === shell && widgetId !== null) return;
  try {
    await loadGoogleScript();
    if (!document.contains(shell)) return;
    const target = shell.querySelector('.recaptcha-widget');
    const loading = shell.querySelector('.recaptcha-loading');
    if (!target || target.childNodes.length) return;
    widgetId = recaptchaApi().render(target, {
      sitekey: siteKey,
      theme: 'dark',
      size: 'normal',
      callback: () => shell.classList.add('verified'),
      'expired-callback': () => shell.classList.remove('verified'),
      'error-callback': () => shell.classList.remove('verified'),
    });
    widgetHost = shell;
    if (loading) loading.remove();
  } catch (error) {
    shell.innerHTML = '<div class="recaptcha-error">Não foi possível carregar o reCAPTCHA. Atualize a página.</div>';
    console.error('[recaptcha]', error);
  }
}

function patchAuthFetch() {
  if (!siteKey || window.__attozapRecaptchaFetchPatched) return;
  window.__attozapRecaptchaFetchPatched = true;
  const nativeFetch = window.fetch.bind(window);

  window.fetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input?.url || '';
    const method = String(init?.method || (typeof input !== 'string' ? input?.method : '') || 'GET').toUpperCase();
    if (!/\/api\/auth(?:\?|$)/.test(url) || method !== 'POST' || !init?.body) {
      return nativeFetch(input, init);
    }

    let payload;
    try { payload = JSON.parse(String(init.body)); } catch { return nativeFetch(input, init); }
    if (!['login','register'].includes(String(payload.action || ''))) return nativeFetch(input, init);

    const token = currentToken();
    if (!token) throw new Error('Marque a caixa “Não sou um robô” para continuar.');
    payload.recaptchaToken = token;

    const response = await nativeFetch(input, { ...init, body: JSON.stringify(payload) });
    if (!response.ok) resetWidget();
    return response;
  };
}

export function initRecaptcha() {
  if (!siteKey) return;
  patchAuthFetch();
  const observer = new MutationObserver(() => { void renderWidget(); });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  void renderWidget();
}

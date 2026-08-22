import './styles.css';

const rawPath = window.location.pathname || '/';
let pathname = rawPath.replace(/\.html$/i, '').replace(/\/+$/, '') || '/';

if (pathname.startsWith('/admin/operacoes/')) pathname = '/admin/operacoes';
else if (pathname.startsWith('/portal/')) pathname = '/portal';
else if (pathname.startsWith('/admin/')) pathname = '/admin';

const portalPaths = new Set(['/login', '/cadastro', '/portal', '/admin']);
const recoveryPaths = new Set(['/forgot-password', '/reset-password']);
const publicInfoPaths = new Set(['/atualizacoes','/termos','/privacidade','/condicoes','/licenca','/lgpd']);
const isPortal = portalPaths.has(pathname);

if ((isPortal || recoveryPaths.has(pathname) || pathname === '/membros' || pathname === '/admin/operacoes' || publicInfoPaths.has(pathname)) && rawPath !== pathname) {
  history.replaceState(history.state, '', `${pathname}${location.search}${location.hash}`);
}

if (recoveryPaths.has(pathname)) {
  document.documentElement.dataset.theme = 'dark';
  document.documentElement.style.colorScheme = 'dark';
  await import('./portal.css');
  await import('./portal-theme.css');
  await import('./recovery.css');
  await import('./recovery.jsx');
  if (pathname === '/forgot-password') {
    await import('./recaptcha.css');
    const { initRecaptcha } = await import('./recaptcha.js');
    initRecaptcha();
  }
} else if (pathname === '/membros') {
  document.documentElement.dataset.theme = 'dark';
  document.documentElement.style.colorScheme = 'dark';
  await import('./members.css');
  await import('./members.jsx');
} else if (pathname === '/admin/operacoes') {
  document.documentElement.dataset.theme = 'dark';
  document.documentElement.style.colorScheme = 'dark';
  await import('./admin-ops.css');
  await import('./admin-ops.jsx');
} else if (publicInfoPaths.has(pathname)) {
  document.documentElement.dataset.theme = 'dark';
  document.documentElement.style.colorScheme = 'dark';
  await import('./public-info.css');
  await import('./public-info.jsx');
} else if (isPortal) {
  document.documentElement.dataset.theme = 'dark';
  document.documentElement.style.colorScheme = 'dark';

  await import('./portal.jsx');
  await import('./portal-theme.css');
  await import('./portal-enhance.css');
  await import('./portal-links.css');
  const [{ enhancePortalRoute }, { initPortalLinks }] = await Promise.all([
    import('./portal-enhance.js'),
    import('./portal-links.js'),
  ]);
  enhancePortalRoute();
  initPortalLinks();

  if (pathname === '/login' || pathname === '/cadastro') {
    await import('./recaptcha.css');
    const { initRecaptcha } = await import('./recaptcha.js');
    initRecaptcha();
    if (pathname === '/cadastro') {
      const { initReferralCapture } = await import('./referral-capture.js');
      initReferralCapture();
    }
  }

  if (pathname === '/portal' || pathname === '/admin') {
    await import('./portal-payments.css');
    const [{ initNotifications }, { initPixCheckout }] = await Promise.all([
      import('./notifications.js'),
      import('./pix.js'),
    ]);
    initNotifications();
    if (pathname === '/portal') initPixCheckout();
  }
} else {
  await import('./landing-extras.css');
  await import('./main.jsx');

  const enhanceLanding = () => {
    const actions = document.querySelector('.nav-actions');
    if (actions && !actions.querySelector('[data-client-portal]')) {
      const link = document.createElement('a');
      link.href = '/login';
      link.dataset.clientPortal = 'true';
      link.className = 'button ghost compact client-portal-link';
      link.textContent = 'Portal do cliente';
      actions.insertBefore(link, actions.firstChild);
    }

    document.querySelectorAll('.price-card').forEach(card => {
      const name = String(card.querySelector('h3')?.textContent || '').trim().toLowerCase();
      const cta = card.querySelector('.plan-cta');
      if (!cta || cta.dataset.portalCheckout === 'true') return;
      const slug = name === 'plus' ? 'plus' : name === 'pro' ? 'pro' : name === 'ultra' ? 'ultra' : '';
      if (!slug) return;
      cta.href = `/cadastro?next=${encodeURIComponent(`/portal?plan=${slug}`)}`;
      cta.removeAttribute('target');
      cta.removeAttribute('rel');
      cta.dataset.portalCheckout = 'true';
      const textNode = [...cta.childNodes].find(node => node.nodeType === Node.TEXT_NODE);
      if (textNode) textNode.textContent = ` Contratar ${name.charAt(0).toUpperCase()}${name.slice(1)}`;
    });

    const footer = document.querySelector('footer');
    if (footer && !footer.querySelector('[data-public-links]')) {
      const links = document.createElement('nav');
      links.dataset.publicLinks = 'true';
      links.className = 'public-legal-links';
      links.innerHTML = '<a href="/atualizacoes">Atualizações</a><a href="/termos">Termos</a><a href="/privacidade">Privacidade</a><a href="/condicoes">Condições</a><a href="/licenca">Licença</a><a href="/lgpd">LGPD</a>';
      footer.appendChild(links);
    }
  };

  requestAnimationFrame(enhanceLanding);
  setTimeout(enhanceLanding, 250);
  setTimeout(enhanceLanding, 900);
}

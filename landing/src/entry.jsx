import './styles.css';

const rawPath = window.location.pathname || '/';
let pathname = rawPath.replace(/\.html$/i, '').replace(/\/+$/, '') || '/';

if (pathname.startsWith('/portal/')) pathname = '/portal';
if (pathname.startsWith('/admin/')) pathname = '/admin';

const portalPaths = new Set(['/login', '/cadastro', '/portal', '/admin']);
const isPortal = portalPaths.has(pathname);

if (isPortal && rawPath !== pathname) {
  history.replaceState(history.state, '', `${pathname}${location.search}${location.hash}`);
}

if (isPortal) {
  document.documentElement.dataset.theme = 'dark';
  document.documentElement.style.colorScheme = 'dark';

  await import('./portal.jsx');
  await import('./portal-theme.css');
  await import('./portal-enhance.css');
  const { enhancePortalRoute } = await import('./portal-enhance.js');
  enhancePortalRoute();

  if (pathname === '/login' || pathname === '/cadastro') {
    await import('./recaptcha.css');
    const { initRecaptcha } = await import('./recaptcha.js');
    initRecaptcha();
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
  };

  requestAnimationFrame(enhanceLanding);
  setTimeout(enhanceLanding, 250);
  setTimeout(enhanceLanding, 900);
}

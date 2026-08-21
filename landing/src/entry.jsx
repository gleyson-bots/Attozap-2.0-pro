const portalPaths = ['/login', '/cadastro', '/portal', '/admin'];
const pathname = window.location.pathname.replace(/\/+$/, '') || '/';

if (portalPaths.includes(pathname)) {
  await import('./portal.jsx');
} else {
  await import('./main.jsx');
  // A landing antiga continua intacta. Acrescentamos o acesso ao portal depois que o React monta.
  const addPortalLink = () => {
    const actions = document.querySelector('.nav-actions');
    if (!actions || actions.querySelector('[data-client-portal]')) return;
    const link = document.createElement('a');
    link.href = '/login';
    link.dataset.clientPortal = 'true';
    link.className = 'button ghost compact client-portal-link';
    link.textContent = 'Portal do cliente';
    actions.insertBefore(link, actions.firstChild);
  };
  requestAnimationFrame(addPortalLink);
  setTimeout(addPortalLink, 250);
}

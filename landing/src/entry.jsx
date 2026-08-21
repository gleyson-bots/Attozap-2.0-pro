import './styles.css';

const portalPaths = ['/login', '/cadastro', '/portal', '/admin'];
const pathname = (window.location.pathname.replace(/\.html$/i, '').replace(/\/+$/, '') || '/');

if (portalPaths.includes(pathname)) {
  // O portal deve nascer no mesmo dark theme da landing. Definir antes do
  // React/CSS dinâmico evita o flash claro e impede variáveis do :root light.
  document.documentElement.dataset.theme = 'dark';
  document.documentElement.style.colorScheme = 'dark';

  // portal.jsx ainda contém o CSS estrutural legado. Carregamos primeiro a
  // estrutura e SOMENTE depois o tema ATTOZAP para que o tema final sempre
  // vença a cascata (header, cards, accent, superfícies e responsividade).
  await import('./portal.jsx');
  await import('./portal-theme.css');
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

function makeLink(href, text, className='admin-switch') {
  const link = document.createElement('a');
  link.href = href;
  link.className = className;
  link.textContent = text;
  return link;
}

function enhanceAuth() {
  const form = document.querySelector('.auth-form');
  if (!form || form.querySelector('[data-forgot-password]')) return;
  const link = makeLink('/forgot-password','Esqueci minha senha','auth-forgot-link');
  link.dataset.forgotPassword = 'true';
  const button = form.querySelector('button[type="submit"],button.portal-button');
  if (button) form.insertBefore(link, button);
  else form.appendChild(link);
}

function enhancePortal() {
  const sidebar = document.querySelector('.portal-sidebar');
  if (!sidebar) return;
  if (location.pathname.startsWith('/portal') && !sidebar.querySelector('[data-members-link]')) {
    const anchor = makeLink('/membros','Indique e Ganhe');
    anchor.dataset.membersLink = 'true';
    const logout = sidebar.querySelector('.logout');
    sidebar.insertBefore(anchor, logout || null);
  }
  if (location.pathname.startsWith('/admin') && !sidebar.querySelector('[data-ops-link]')) {
    const anchor = makeLink('/admin/operacoes','Operações avançadas');
    anchor.dataset.opsLink = 'true';
    const logout = sidebar.querySelector('.logout');
    sidebar.insertBefore(anchor, logout || null);
  }
}

export function initPortalLinks() {
  const run = () => { enhanceAuth(); enhancePortal(); };
  const observer = new MutationObserver(run);
  observer.observe(document.documentElement,{childList:true,subtree:true});
  run();
}

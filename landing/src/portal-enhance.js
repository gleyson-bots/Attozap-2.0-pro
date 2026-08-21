export function enhancePortalRoute() {
  if (location.pathname !== '/portal') return;
  const params = new URLSearchParams(location.search);
  const plan = String(params.get('plan') || '').toLowerCase();
  if (!['plus','pro','ultra'].includes(plan)) return;

  let attempts = 0;
  const openPlan = () => {
    attempts += 1;
    const planButton = [...document.querySelectorAll('.portal-sidebar nav button')]
      .find(button => button.textContent?.trim().toLowerCase().includes('planos'));
    if (!planButton) {
      if (attempts < 30) setTimeout(openPlan, 100);
      return;
    }

    planButton.click();
    setTimeout(() => {
      const card = [...document.querySelectorAll('.portal-plan')]
        .find(item => item.querySelector('h3')?.textContent?.trim().toLowerCase() === plan);
      if (card) {
        card.scrollIntoView({ behavior: 'smooth', block: 'center' });
        card.classList.add('portal-plan-focus');
        setTimeout(() => card.classList.remove('portal-plan-focus'), 2200);
      }
      history.replaceState(history.state, '', '/portal');
    }, 120);
  };

  openPlan();
}

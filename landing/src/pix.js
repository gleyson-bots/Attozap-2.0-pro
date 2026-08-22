let pollTimer = null;

async function request(body) {
  const response = await fetch('/api/customer', {
    method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Erro ${response.status}`);
  return data;
}

function closeModal() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
  document.querySelector('[data-pix-modal]')?.remove();
}

function copyText(value, button) {
  navigator.clipboard?.writeText(value).then(() => {
    if (!button) return;
    const original = button.textContent;
    button.textContent = 'Copiado!';
    setTimeout(() => { button.textContent = original; }, 1400);
  }).catch(() => {});
}

function maskCpf(value) {
  const digits = String(value || '').replace(/\D/g, '').slice(0, 11);
  return digits.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2');
}

function paymentStatusLabel(status) {
  const labels = { pending: 'Aguardando pagamento', approved: 'Pagamento aprovado', rejected: 'Pagamento recusado', cancelled: 'Pagamento cancelado', canceled: 'Pagamento cancelado', refunded: 'Pagamento estornado' };
  return labels[String(status || '').toLowerCase()] || String(status || 'Aguardando pagamento');
}

function renderPixResult(shell, pix) {
  const body = shell.querySelector('.pix-modal-body');
  if (!body) return;
  body.innerHTML = `
    <div class="pix-success-head"><span class="pix-mark">PIX</span><div><small>PAGAMENTO INSTANTÂNEO</small><h3>${pix.planName}</h3></div></div>
    <p class="pix-help">Escaneie o QR Code ou copie o código PIX. A licença será liberada automaticamente após a confirmação do Mercado Pago.</p>
    ${pix.qrCodeBase64 ? `<div class="pix-qr"><img alt="QR Code PIX" src="data:image/png;base64,${pix.qrCodeBase64}"/></div>` : ''}
    <label class="pix-code-label"><span>PIX Copia e Cola</span><textarea readonly>${pix.qrCode || ''}</textarea></label>
    <div class="pix-actions">
      <button type="button" class="portal-button primary pix-copy">Copiar código PIX</button>
      ${pix.ticketUrl ? `<a class="portal-button subtle" target="_blank" rel="noreferrer" href="${pix.ticketUrl}">Abrir no Mercado Pago</a>` : ''}
    </div>
    <div class="pix-status" data-pix-status><i></i><span>${paymentStatusLabel(pix.status)}</span></div>
    <small class="pix-expiry">Este QR Code expira em aproximadamente 30 minutos. A licença PIX tem validade de 30 dias após a aprovação.</small>
  `;
  body.querySelector('.pix-copy')?.addEventListener('click', event => copyText(pix.qrCode || '', event.currentTarget));

  pollTimer = setInterval(async () => {
    try {
      const result = await request({ action: 'pixStatus', paymentId: pix.id });
      const status = String(result.payment?.status || '').toLowerCase();
      const statusNode = body.querySelector('[data-pix-status]');
      if (statusNode) {
        statusNode.dataset.status = status;
        statusNode.querySelector('span').textContent = paymentStatusLabel(status);
      }
      if (status === 'approved') {
        clearInterval(pollTimer); pollTimer = null;
        if (statusNode) statusNode.innerHTML = '<i></i><span>Pagamento aprovado — licença liberada!</span>';
        setTimeout(() => { location.href = '/portal'; }, 1800);
      }
      if (['rejected','cancelled','canceled','refunded'].includes(status)) {
        clearInterval(pollTimer); pollTimer = null;
      }
    } catch {}
  }, 5000);
}

function openPix(planSlug, planName) {
  closeModal();
  const shell = document.createElement('div');
  shell.className = 'pix-modal-backdrop';
  shell.dataset.pixModal = 'true';
  shell.innerHTML = `
    <section class="pix-modal" role="dialog" aria-modal="true" aria-label="Pagamento via PIX">
      <button type="button" class="pix-close" aria-label="Fechar">×</button>
      <div class="pix-modal-body">
        <div class="pix-success-head"><span class="pix-mark">PIX</span><div><small>MERCADO PAGO</small><h3>Pagar ${planName} com PIX</h3></div></div>
        <p class="pix-help">O PIX é um pagamento avulso que libera <strong>30 dias de licença</strong>. Para gerar a cobrança, informe o CPF do pagador.</p>
        <label class="pix-cpf"><span>CPF</span><input inputmode="numeric" autocomplete="off" placeholder="000.000.000-00" maxlength="14"/></label>
        <div class="pix-error" hidden></div>
        <button type="button" class="portal-button primary wide pix-generate">Gerar QR Code PIX</button>
        <small class="pix-security">Pagamento processado pelo Mercado Pago. A licença só é liberada após confirmação oficial do webhook.</small>
      </div>
    </section>`;
  document.body.appendChild(shell);
  shell.querySelector('.pix-close')?.addEventListener('click', closeModal);
  shell.addEventListener('click', event => { if (event.target === shell) closeModal(); });
  const input = shell.querySelector('.pix-cpf input');
  input?.addEventListener('input', () => { input.value = maskCpf(input.value); });
  input?.focus();
  shell.querySelector('.pix-generate')?.addEventListener('click', async event => {
    const button = event.currentTarget;
    const error = shell.querySelector('.pix-error');
    const cpf = String(input?.value || '').replace(/\D/g, '');
    if (cpf.length !== 11) { error.hidden = false; error.textContent = 'Informe um CPF válido com 11 dígitos.'; return; }
    button.disabled = true; button.textContent = 'Gerando PIX…'; error.hidden = true;
    try {
      const result = await request({ action: 'createPix', planId: planSlug, payerDocument: cpf });
      renderPixResult(shell, result.pix);
    } catch (err) {
      error.hidden = false; error.textContent = err.message; button.disabled = false; button.textContent = 'Gerar QR Code PIX';
    }
  });
}

function enhancePlans() {
  document.querySelectorAll('.portal-plan[data-plan-slug]').forEach(card => {
    const actions = card.querySelector('.payment-actions');
    if (!actions || actions.querySelector('[data-pix-button]')) return;
    const mpButton = actions.querySelector('.portal-button.mp');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'portal-button pix wide';
    button.dataset.pixButton = 'true';
    button.disabled = Boolean(mpButton?.disabled);
    button.innerHTML = '<span class="pix-mini">PIX</span> Pagar com PIX · 30 dias';
    button.addEventListener('click', () => openPix(card.dataset.planSlug || '', card.querySelector('h3')?.textContent?.trim() || 'ATTOZAP'));
    actions.insertBefore(button, actions.firstChild);
  });
}

export function initPixCheckout() {
  if (!location.pathname.startsWith('/portal')) return;
  const observer = new MutationObserver(enhancePlans);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  enhancePlans();
}

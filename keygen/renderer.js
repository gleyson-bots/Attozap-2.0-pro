const FEATURES = [
  ['webchat','WebChat'],['sender','Contact Sender'],['groups','Group Sender'],['campaigns','Campanhas'],
  ['delivery','Delivery Center'],['warmup','Aquecimento'],['ai_chat','Chat IA'],['scheduler','Agendamentos'],['contacts','Contatos'],
  ['filter','Number Filter'],['autoreply','Auto Reply'],['templates','Templates'],['poll_report','Poll Report'],['extractors','Extratores'],
  ['proxy','Proxy por conta']
];

const PLANS = {
  plus: {
    label: 'Plus',
    limits: { maxSeats: 1, maxInstances: 1, dailyOutbound: 250, campaignRecipients: 1000, campaignStartsDaily: 2, warmupProfiles: 1, warmupDaily: 40, aiDaily: 50 },
    features: ['webchat','sender','campaigns','delivery','warmup','contacts','templates'],
  },
  pro: {
    label: 'Pro',
    limits: { maxSeats: 3, maxInstances: 3, dailyOutbound: 1500, campaignRecipients: 10000, campaignStartsDaily: 10, warmupProfiles: 3, warmupDaily: 150, aiDaily: 300 },
    features: ['webchat','sender','groups','campaigns','delivery','warmup','ai_chat','scheduler','contacts','filter','autoreply','templates','poll_report'],
  },
  ultra: {
    label: 'Ultra',
    limits: { maxSeats: 10, maxInstances: 10, dailyOutbound: 5000, campaignRecipients: 50000, campaignStartsDaily: 30, warmupProfiles: 10, warmupDaily: 500, aiDaily: 1000 },
    features: ['*'],
  },
  enterprise: {
    label: 'Enterprise',
    limits: { maxSeats: null, maxInstances: null, dailyOutbound: null, campaignRecipients: null, campaignStartsDaily: null, warmupProfiles: null, warmupDaily: null, aiDaily: null },
    features: ['*'],
  },
};

const $ = id => document.getElementById(id);
let lastLicense = null;
let lastRenewal = null;

for (const [value, label] of FEATURES) {
  const el = document.createElement('label');
  el.className = 'feature';
  el.innerHTML = `<input type="checkbox" value="${value}"><span><b>${label}</b><small>${value}</small></span>`;
  $('features').appendChild(el);
}

function fmt(value) {
  return value == null ? 'Ilimitado' : new Intl.NumberFormat('pt-BR').format(value);
}

function renderPlan() {
  const plan = PLANS[$('plan').value] || PLANS.pro;
  $('planLimits').textContent = `Contas: ${fmt(plan.limits.maxInstances)} · Saídas/dia: ${fmt(plan.limits.dailyOutbound)} · Campanha: ${fmt(plan.limits.campaignRecipients)} destinatários · Aquecimento: ${fmt(plan.limits.warmupProfiles)} perfil / ${fmt(plan.limits.warmupDaily)} por dia · IA: ${fmt(plan.limits.aiDaily)}/dia`;
  const all = plan.features.includes('*');
  for (const input of document.querySelectorAll('#features input')) {
    input.checked = all || plan.features.includes(input.value);
  }
}

$('plan').addEventListener('change', renderPlan);
renderPlan();

$('selectKey').addEventListener('click', async () => {
  const path = await window.keygen.selectPrivateKey();
  if (path) $('privateKeyPath').value = path;
});

$('generateKeys').addEventListener('click', async () => {
  try {
    const result = await window.keygen.generateKeys();
    if (!result) return;
    $('privateKeyPath').value = result.privatePath;
    setStatus(`Par criado. Pública: ${result.publicPath}`, 'ok');
  } catch (error) { setStatus(error.message || String(error), 'error'); }
});

$('issue').addEventListener('click', async () => {
  setStatus('Assinando licença...', 'busy');
  $('issue').disabled = true;
  try {
    const selectedPlan = $('plan').value;
    const plan = PLANS[selectedPlan];
    const features = [...document.querySelectorAll('#features input:checked')].map(el => el.value);
    const result = await window.keygen.issueLicense({
      privateKeyPath: $('privateKeyPath').value,
      customerId: $('customerId').value,
      customerName: $('customerName').value,
      plan: selectedPlan,
      limits: plan.limits,
      expiresAt: $('expiresAt').value || null,
      fingerprint: $('fingerprint').value,
      billingMode: $('billingMode').value,
      features,
    });
    lastLicense = result;
    $('renewalLicenseId').value = result.payload.licenseId;
    $('licenseId').textContent = result.payload.licenseId;
    $('summary').textContent = `${result.payload.customerName} · ${plan.label} · ${fmt(result.payload.limits.maxInstances)} conta(s) · ${fmt(result.payload.limits.dailyOutbound)} saídas/dia`;
    $('encoded').value = result.encoded;
    $('result').classList.remove('hidden');
    setStatus('Licença gerada e assinada com sucesso.', 'ok');
  } catch (error) {
    setStatus(error.message || String(error), 'error');
  } finally { $('issue').disabled = false; }
});

$('copy').addEventListener('click', async () => {
  if (!lastLicense) return;
  await window.keygen.copy(lastLicense.encoded);
  setStatus('Licença copiada.', 'ok');
});

$('save').addEventListener('click', async () => {
  if (!lastLicense) return;
  const safe = String(lastLicense.payload.customerId).replace(/[^a-z0-9_-]/gi, '-');
  const path = await window.keygen.saveLicense(lastLicense.encoded, `${safe}-${lastLicense.payload.licenseId}.license.txt`);
  if (path) setStatus(`Licença salva em ${path}`, 'ok');
});

$('issueRenewal').addEventListener('click', async () => {
  setStatus('Assinando renovação mensal...', 'busy');
  $('issueRenewal').disabled = true;
  try {
    const result = await window.keygen.issueRenewal({
      privateKeyPath: $('privateKeyPath').value,
      licenseId: $('renewalLicenseId').value,
      customerId: $('customerId').value,
      plan: $('plan').value,
      days: $('renewalDays').value,
      fingerprint: $('fingerprint').value,
    });
    lastRenewal = result;
    $('renewalId').textContent = result.payload.renewalId;
    $('renewalSummary').textContent = `${result.payload.licenseId} · ${result.payload.days} dia(s) · ${result.payload.plan}`;
    $('renewalEncoded').value = result.encoded;
    $('renewalResult').classList.remove('hidden');
    setStatus('Chave de renovação gerada e assinada com sucesso.', 'ok');
  } catch (error) {
    setStatus(error.message || String(error), 'error');
  } finally { $('issueRenewal').disabled = false; }
});

$('copyRenewal').addEventListener('click', async () => {
  if (!lastRenewal) return;
  await window.keygen.copy(lastRenewal.encoded);
  setStatus('Chave de renovação copiada.', 'ok');
});

$('saveRenewal').addEventListener('click', async () => {
  if (!lastRenewal) return;
  const safe = String(lastRenewal.payload.customerId).replace(/[^a-z0-9_-]/gi, '-');
  const path = await window.keygen.saveLicense(lastRenewal.encoded, `${safe}-${lastRenewal.payload.renewalId}.renewal.txt`);
  if (path) setStatus(`Renovação salva em ${path}`, 'ok');
});

function setStatus(text, type = '') {
  const el = $('status');
  el.textContent = text;
  el.className = `status ${type}`;
}

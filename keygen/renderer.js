const FEATURES = [
  ['sender','Contact Sender'],['group_sender','Group Sender'],['scheduler','Agendamentos'],['contacts','Contatos'],
  ['groups','Group Tools'],['bulk_groups','Bulk Groups'],['filter','Number Filter'],['grabber','Contact Grabber'],
  ['autoreply','Auto Reply'],['templates','Templates'],['poll_report','Poll Report'],['extractors','Extratores'],['proxy','Proxy por conta']
];

const $ = id => document.getElementById(id);
let lastLicense = null;

for (const [value, label] of FEATURES) {
  const el = document.createElement('label');
  el.className = 'feature';
  el.innerHTML = `<input type="checkbox" value="${value}" checked><span><b>${label}</b><small>${value}</small></span>`;
  $('features').appendChild(el);
}

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
    const features = [...document.querySelectorAll('#features input:checked')].map(el => el.value);
    const result = await window.keygen.issueLicense({
      privateKeyPath: $('privateKeyPath').value,
      customerId: $('customerId').value,
      customerName: $('customerName').value,
      plan: $('plan').value,
      expiresAt: $('expiresAt').value || null,
      maxSeats: Number($('maxSeats').value),
      maxInstances: Number($('maxInstances').value),
      fingerprint: $('fingerprint').value,
      features,
    });
    lastLicense = result;
    $('licenseId').textContent = result.payload.licenseId;
    $('summary').textContent = `${result.payload.customerName} · ${result.payload.plan} · ${result.payload.maxInstances} conta(s)`;
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

function setStatus(text, type = '') {
  const el = $('status');
  el.textContent = text;
  el.className = `status ${type}`;
}

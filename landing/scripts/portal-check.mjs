import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const failures = [];
const assert = (condition, message) => { if (!condition) failures.push(message); };
const read = path => readFileSync(resolve(root, path), 'utf8');

const requiredFiles = [
  'index.html','login.html','cadastro.html','portal.html','admin.html','forgot-password.html','reset-password.html',
  'login/index.html','cadastro/index.html','portal/index.html','admin/index.html','forgot-password/index.html','reset-password/index.html',
  'membros/index.html','admin/operacoes/index.html','atualizacoes/index.html','termos/index.html','privacidade/index.html','condicoes/index.html','licenca/index.html','lgpd/index.html',
  'src/entry.jsx','src/portal.jsx','src/portal.css','src/portal-theme.css','src/portal-enhance.js','src/portal-enhance.css','src/portal-links.js','src/portal-links.css',
  'src/recaptcha.js','src/recaptcha.css','src/recovery.jsx','src/recovery.css','src/members.jsx','src/members.css','src/admin-ops.jsx','src/admin-ops.css','src/public-info.jsx','src/public-info.css','src/referral-capture.js',
  'src/pix.js','src/notifications.js','src/portal-payments.css',
  'api/auth.js','api/customer.js','api/admin.js','api/admin-ops.js','api/password-reset.js','api/community.js','api/public-releases.js','api/stripe-webhook.js','api/mercadopago-webhook.js','api/notifications.js','api/health.js',
  'api/_lib/auth.js','api/_lib/db.js','api/_lib/email.js','api/_lib/http.js','api/_lib/license.js','api/_lib/mercadopago.js','api/_lib/recaptcha.js','api/_lib/notifications.js','api/_lib/platform.js','api/_lib/referrals.js',
  '../api/auth.js','../api/customer.js','../api/admin.js','../api/admin-ops.js','../api/password-reset.js','../api/community.js','../api/public-releases.js','../api/stripe-webhook.js','../api/mercadopago-webhook.js','../api/notifications.js','../api/health.js',
  'vercel.json','../vercel.json','vite.config.js',
];
for (const file of requiredFiles) assert(existsSync(resolve(root,file)), `Arquivo obrigatório ausente: ${file}`);

const entry = read('src/entry.jsx');
for (const token of ["'/forgot-password'","'/reset-password'","'/membros'","'/admin/operacoes'","'/atualizacoes'","initReferralCapture","initRecaptcha","initNotifications","initPixCheckout"]) assert(entry.includes(token), `Bootstrap ausente: ${token}`);
assert(entry.indexOf("await import('./portal.jsx')") < entry.indexOf("await import('./portal-theme.css')"), 'portal-theme.css deve carregar depois do CSS estrutural.');

const recovery = read('api/password-reset.js');
assert(recovery.includes("createHash('sha256')"), 'Reset de senha precisa armazenar hash do token.');
assert(recovery.includes('30 * 60 * 1000'), 'Token de reset deve expirar em 30 minutos.');
assert(recovery.includes('bcrypt.hash'), 'Nova senha precisa usar bcrypt.');
assert(recovery.includes('verifyRecaptcha'), 'Solicitação de reset precisa validar reCAPTCHA quando configurado.');
assert(recovery.includes('used_at'), 'Token de reset precisa ser de uso único.');

const platform = read('api/_lib/platform.js');
for (const table of ['password_reset_tokens','referral_codes','referrals','referral_rewards','app_settings']) assert(platform.includes(`CREATE TABLE IF NOT EXISTS ${table}`), `Schema complementar sem ${table}.`);
const referrals = read('api/_lib/referrals.js');
for (const fn of ['ensureReferralCode','applyReferralCode','qualifyReferralForUser','memberReferralView']) assert(referrals.includes(`function ${fn}`) || referrals.includes(`async function ${fn}`) || referrals.includes(`export async function ${fn}`), `Engine de indicação sem ${fn}.`);
assert(read('api/auth.js').includes('applyReferralCode'), 'Cadastro precisa capturar código de indicação.');
assert(read('api/stripe-webhook.js').includes('invoice.paid') && read('api/stripe-webhook.js').includes('qualifyReferralForUser'), 'Stripe precisa qualificar indicação apenas após fatura paga.');
const mpWebhook = read('api/mercadopago-webhook.js');
assert(mpWebhook.includes('qualifyReferralForUser'), 'Mercado Pago/PIX precisa qualificar indicação após pagamento.');
assert(mpWebhook.includes("method === 'pix'") && mpWebhook.includes("currency === 'BRL'") && mpWebhook.includes('amountCents === Number(plan.price_cents'), 'PIX precisa validar meio, moeda e valor.');

const email = read('api/_lib/email.js');
for (const fn of ['sendWelcome','sendPasswordReset','sendPasswordChanged','sendReferralReward','sendLicenseIssued','sendReleaseNotice','sendPlanActivated']) assert(email.includes(`function ${fn}`) || email.includes(`export async function ${fn}`), `Resend sem ${fn}.`);
assert(email.includes('portal@orbitalcode.shop'), 'Remetente padrão do Resend deve usar orbitalcode.shop.');

const recaptchaFront = read('src/recaptcha.js');
assert(recaptchaFront.includes('VITE_RECAPTCHA_SITE_KEY') && recaptchaFront.includes("theme: 'dark'"), 'reCAPTCHA v2 visual incompleto.');
assert(recaptchaFront.includes('__attozapGetRecaptchaToken'), 'reCAPTCHA precisa expor token ao fluxo de recuperação.');
const recaptchaServer = read('api/_lib/recaptcha.js');
assert(recaptchaServer.includes('https://www.google.com/recaptcha/api/siteverify') && recaptchaServer.includes('RECAPTCHA_SECRET_KEY'), 'reCAPTCHA server-side incompleto.');

const db = read('api/_lib/db.js');
for (const table of ['payments','notifications','stripe_events','mercadopago_events','external_customers','external_licenses']) assert(db.includes(`CREATE TABLE IF NOT EXISTS ${table}`), `Schema principal sem ${table}.`);
const customer = read('api/customer.js');
assert(customer.includes("action === 'createPix'") && customer.includes("action === 'pixStatus'"), 'API cliente sem fluxo PIX.');
assert(read('src/pix.js').includes("action: 'createPix'") && read('src/pix.js').includes('qrCodeBase64'), 'Frontend PIX incompleto.');
assert(read('src/notifications.js').includes('/api/notifications'), 'Central de notificações ausente.');

const portal = read('src/portal.jsx');
assert(portal.includes("onBuy(plan,'mercadopago')"), 'Portal precisa oferecer Mercado Pago.');
assert(portal.includes("['admin','support'].includes(session.user.role)"), 'Control Center precisa aceitar suporte.');
assert(portal.includes("action:'issueExternalLicense'") && portal.includes("action:'createStaff'"), 'Admin principal precisa gerir licenças externas e equipe.');
const adminOps = read('api/admin-ops.js');
assert(adminOps.includes('setReferralReward') && adminOps.includes('updateReward') && adminOps.includes('broadcastNotification'), 'Operações avançadas incompletas.');
assert(read('src/admin-ops.jsx').includes('Saúde dos serviços'), 'UI de operações avançadas ausente.');
assert(read('src/members.jsx').includes('INDIQUE E GANHE'), 'Área de membros ausente.');
assert(read('src/public-info.jsx').includes('Política de Privacidade') && read('src/public-info.jsx').includes('Atualizações do ATTOZAP'), 'Páginas públicas institucionais incompletas.');

const theme = read('src/portal-theme.css');
assert(!/\.portal-app\s*>\s*\*\s*\{[^}]*position\s*:\s*relative/i.test(theme), 'Tema não pode sobrescrever position de todos os filhos de .portal-app.');
assert(/\.portal-sidebar\s*\{[^}]*position\s*:\s*fixed/i.test(theme), 'Sidebar precisa continuar fixed.');
assert(/\.auth-page\s*>\s*\.auth-ambient\s*\{[^}]*position\s*:\s*absolute/i.test(theme), 'Glows do login precisam continuar absolutos.');

const rootVercel = JSON.parse(read('../vercel.json'));
const landingVercel = JSON.parse(read('vercel.json'));
assert(rootVercel.outputDirectory === 'landing/dist' && landingVercel.outputDirectory === 'dist', 'OutputDirectory da Vercel divergente.');
for (const route of ['/login','/cadastro','/forgot-password','/reset-password','/membros','/atualizacoes','/termos','/privacidade','/condicoes','/licenca','/lgpd','/portal','/admin/operacoes','/admin']) {
  assert(rootVercel.rewrites?.some(item=>item.source===route), `Vercel raiz sem rota ${route}.`);
  assert(landingVercel.rewrites?.some(item=>item.source===route), `Vercel landing sem rota ${route}.`);
}

const serverFiles = [
  'api/auth.js','api/customer.js','api/admin.js','api/admin-ops.js','api/password-reset.js','api/community.js','api/public-releases.js','api/stripe-webhook.js','api/mercadopago-webhook.js','api/notifications.js','api/health.js',
  'api/_lib/auth.js','api/_lib/db.js','api/_lib/email.js','api/_lib/http.js','api/_lib/license.js','api/_lib/mercadopago.js','api/_lib/recaptcha.js','api/_lib/notifications.js','api/_lib/platform.js','api/_lib/referrals.js',
  '../api/auth.js','../api/customer.js','../api/admin.js','../api/admin-ops.js','../api/password-reset.js','../api/community.js','../api/public-releases.js','../api/stripe-webhook.js','../api/mercadopago-webhook.js','../api/notifications.js','../api/health.js',
];
for (const file of serverFiles) {
  const result = spawnSync(process.execPath,['--check',resolve(root,file)],{encoding:'utf8'});
  if (result.status !== 0) failures.push(`Sintaxe inválida em ${file}: ${result.stderr || result.stdout}`);
}

if (failures.length) {
  console.error('\nATTOZAP portal integrity check falhou:\n');
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(1);
}
console.log('ATTOZAP portal integrity check: OK');

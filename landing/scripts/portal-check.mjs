import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const failures = [];
const assert = (condition, message) => { if (!condition) failures.push(message); };
const read = path => readFileSync(resolve(root, path), 'utf8');

const requiredFiles = [
  'index.html', 'login.html', 'cadastro.html', 'portal.html', 'admin.html',
  'login/index.html', 'cadastro/index.html', 'portal/index.html', 'admin/index.html',
  'src/entry.jsx', 'src/portal.jsx', 'src/portal.css', 'src/portal-theme.css', 'src/portal-enhance.js', 'src/portal-enhance.css', 'src/recaptcha.js', 'src/recaptcha.css',
  'api/auth.js', 'api/customer.js', 'api/admin.js', 'api/stripe-webhook.js', 'api/mercadopago-webhook.js', 'api/health.js',
  'api/_lib/auth.js', 'api/_lib/db.js', 'api/_lib/email.js', 'api/_lib/http.js', 'api/_lib/license.js', 'api/_lib/mercadopago.js', 'api/_lib/recaptcha.js',
  '../api/auth.js', '../api/customer.js', '../api/admin.js', '../api/stripe-webhook.js', '../api/mercadopago-webhook.js', '../api/health.js',
  'vercel.json', '../vercel.json',
];

for (const file of requiredFiles) assert(existsSync(resolve(root, file)), `Arquivo obrigatório ausente: ${file}`);

const entry = read('src/entry.jsx');
assert(entry.includes("pathname.startsWith('/portal/')"), 'Bootstrap não normaliza rotas profundas de /portal.');
assert(entry.includes("pathname.startsWith('/admin/')"), 'Bootstrap não normaliza rotas profundas de /admin.');
assert(entry.includes("replace(/\\.html$/i"), 'Bootstrap não normaliza páginas físicas .html.');
assert(entry.indexOf("await import('./portal.jsx')") < entry.indexOf("await import('./portal-theme.css')"), 'portal-theme.css deve carregar depois do CSS estrutural.');
assert(entry.includes("await import('./portal-enhance.js')"), 'Bootstrap precisa aplicar a navegação comercial pós-cadastro.');
assert(entry.includes("await import('./recaptcha.js')"), 'Rotas de autenticação precisam carregar o reCAPTCHA.');

const portal = read('src/portal.jsx');
assert(portal.includes("onBuy(plan,'mercadopago')"), 'Portal precisa oferecer Mercado Pago nos planos.');
assert(portal.includes("['admin','support'].includes(session.user.role)"), 'Control Center precisa aceitar admin e suporte.');
assert(portal.includes("action:'issueExternalLicense'"), 'Admin precisa emitir licença para cliente externo.');
assert(portal.includes("action:'createStaff'"), 'Admin precisa criar contas de admin/suporte.');

const recaptchaFront = read('src/recaptcha.js');
assert(recaptchaFront.includes('VITE_RECAPTCHA_SITE_KEY'), 'Frontend precisa usar VITE_RECAPTCHA_SITE_KEY.');
assert(recaptchaFront.includes("theme: 'dark'"), 'reCAPTCHA visual deve usar tema escuro.');
assert(recaptchaFront.includes('recaptchaToken'), 'Frontend precisa anexar token ao /api/auth.');
assert(recaptchaFront.includes('Não sou um robô'), 'Frontend deve orientar o checkbox do reCAPTCHA.');

const enhance = read('src/portal-enhance.js');
assert(enhance.includes("['plus','pro','ultra']"), 'Fluxo de plano selecionado precisa reconhecer Plus, Pro e Ultra.');

const theme = read('src/portal-theme.css');
assert(!/\.portal-app\s*>\s*\*\s*\{[^}]*position\s*:\s*relative/i.test(theme), 'Tema não pode sobrescrever position de todos os filhos de .portal-app.');
assert(/\.portal-sidebar\s*\{[^}]*position\s*:\s*fixed/i.test(theme), 'Tema deve preservar sidebar fixed.');
assert(/\.auth-page\s*>\s*\.auth-ambient\s*\{[^}]*position\s*:\s*absolute/i.test(theme), 'Glows do login devem continuar absolutos.');

const db = read('api/_lib/db.js');
assert(db.includes('CREATE TABLE IF NOT EXISTS stripe_events'), 'Schema precisa da tabela de idempotência do Stripe.');
assert(db.includes('CREATE TABLE IF NOT EXISTS mercadopago_events'), 'Schema precisa da tabela de idempotência do Mercado Pago.');
assert(db.includes('CREATE TABLE IF NOT EXISTS external_customers'), 'Schema precisa de clientes externos.');
assert(db.includes('CREATE TABLE IF NOT EXISTS external_licenses'), 'Schema precisa de licenças externas.');
assert(db.indexOf("await ensureLegacyColumns(conn)") > db.indexOf("await conn.batch"), 'Migração de colunas legadas precisa ocorrer após criação das tabelas.');

const stripeWebhook = read('api/stripe-webhook.js');
assert(stripeWebhook.includes('INSERT OR IGNORE INTO stripe_events'), 'Webhook Stripe precisa registrar event.id antes de processar.');
const mpWebhook = read('api/mercadopago-webhook.js');
assert(mpWebhook.includes('verifyMercadoPagoWebhook'), 'Webhook Mercado Pago precisa validar x-signature.');
assert(mpWebhook.includes('INSERT OR IGNORE INTO mercadopago_events'), 'Webhook Mercado Pago precisa ser idempotente.');
const mp = read('api/_lib/mercadopago.js');
assert(mp.includes("'/preapproval'"), 'Mercado Pago precisa usar API de Assinaturas /preapproval.');
assert(mp.includes("createHmac('sha256'"), 'Webhook Mercado Pago precisa validar HMAC SHA-256.');

const auth = read('api/_lib/auth.js');
assert(auth.includes("new Set(['admin', 'support'])"), 'RBAC precisa reconhecer suporte.');
assert(auth.includes('requireStaff'), 'Backend precisa de guarda de staff.');
const authRoute = read('api/auth.js');
assert(authRoute.includes('verifyRecaptcha(req, input.recaptchaToken)'), 'Login e cadastro precisam validar reCAPTCHA server-side.');
const recaptchaServer = read('api/_lib/recaptcha.js');
assert(recaptchaServer.includes('https://www.google.com/recaptcha/api/siteverify'), 'Backend precisa validar token no Google siteverify.');
assert(recaptchaServer.includes('RECAPTCHA_SECRET_KEY'), 'Backend precisa usar RECAPTCHA_SECRET_KEY.');

const admin = read('api/admin.js');
assert(admin.includes("new Set(['customer','support','admin'])"), 'Admin precisa permitir customer/support/admin.');
assert(admin.includes('assertAdmin(staff)'), 'Ações sensíveis precisam exigir administrador.');
const license = read('api/_lib/license.js');
assert(license.includes("status=CASE WHEN ?=1 THEN 'active' ELSE status END"), 'Reassinatura não pode reativar revogadas implicitamente.');
assert(license.includes('issueExternalLicense'), 'Licenciamento externo precisa estar implementado.');
const health = read('api/health.js');
assert(health.includes("SELECT 1 AS healthy"), 'Health endpoint deve testar conexão real com o Turso.');
assert(health.includes('mercadoPago:'), 'Health endpoint precisa reportar Mercado Pago.');
assert(health.includes('recaptcha:'), 'Health endpoint precisa reportar reCAPTCHA.');

const rootVercel = JSON.parse(read('../vercel.json'));
const landingVercel = JSON.parse(read('vercel.json'));
assert(rootVercel.outputDirectory === 'landing/dist', 'Vercel da raiz deve apontar para landing/dist.');
assert(landingVercel.outputDirectory === 'dist', 'Vercel de landing deve apontar para dist.');
for (const route of ['/login','/cadastro','/portal','/admin']) {
  assert(rootVercel.rewrites?.some(item => item.source === route), `Vercel da raiz sem rota ${route}.`);
  assert(landingVercel.rewrites?.some(item => item.source === route), `Vercel de landing sem rota ${route}.`);
}

const serverFiles = [
  'api/auth.js','api/customer.js','api/admin.js','api/stripe-webhook.js','api/mercadopago-webhook.js','api/health.js',
  'api/_lib/auth.js','api/_lib/db.js','api/_lib/email.js','api/_lib/http.js','api/_lib/license.js','api/_lib/mercadopago.js','api/_lib/recaptcha.js',
  '../api/auth.js','../api/customer.js','../api/admin.js','../api/stripe-webhook.js','../api/mercadopago-webhook.js','../api/health.js',
];
for (const file of serverFiles) {
  const result = spawnSync(process.execPath, ['--check', resolve(root, file)], { encoding: 'utf8' });
  if (result.status !== 0) failures.push(`Sintaxe inválida em ${file}: ${result.stderr || result.stdout}`);
}

if (failures.length) {
  console.error('\nATTOZAP portal integrity check falhou:\n');
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(1);
}

console.log('ATTOZAP portal integrity check: OK');

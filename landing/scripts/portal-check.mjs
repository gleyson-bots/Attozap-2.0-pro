import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const repoRoot = resolve(root, '..');
const failures = [];
const assert = (condition, message) => { if (!condition) failures.push(message); };
const read = path => readFileSync(resolve(root, path), 'utf8');

const requiredFiles = [
  'index.html', 'login.html', 'cadastro.html', 'portal.html', 'admin.html',
  'login/index.html', 'cadastro/index.html', 'portal/index.html', 'admin/index.html',
  'src/entry.jsx', 'src/portal.jsx', 'src/portal.css', 'src/portal-theme.css',
  'api/auth.js', 'api/customer.js', 'api/admin.js', 'api/stripe-webhook.js',
  'api/_lib/auth.js', 'api/_lib/db.js', 'api/_lib/email.js', 'api/_lib/http.js', 'api/_lib/license.js',
  '../api/auth.js', '../api/customer.js', '../api/admin.js', '../api/stripe-webhook.js',
  '../vercel.json',
];

for (const file of requiredFiles) {
  assert(existsSync(resolve(root, file)), `Arquivo obrigatório ausente: ${file}`);
}

const entry = read('src/entry.jsx');
assert(entry.includes("pathname.startsWith('/portal/')"), 'Bootstrap não normaliza rotas profundas de /portal.');
assert(entry.includes("pathname.startsWith('/admin/')"), 'Bootstrap não normaliza rotas profundas de /admin.');
assert(entry.includes("replace(/\\.html$/i"), 'Bootstrap não normaliza páginas físicas .html.');
assert(entry.indexOf("await import('./portal.jsx')") < entry.indexOf("await import('./portal-theme.css')"), 'portal-theme.css deve carregar depois do CSS estrutural.');

const theme = read('src/portal-theme.css');
assert(!/\.portal-app\s*>\s*\*\s*\{[^}]*position\s*:\s*relative/i.test(theme), 'Tema não pode sobrescrever position de todos os filhos de .portal-app.');
assert(/\.portal-sidebar\s*\{[^}]*position\s*:\s*fixed/i.test(theme), 'Tema deve preservar sidebar fixed.');
assert(/\.auth-page\s*>\s*\.auth-ambient\s*\{[^}]*position\s*:\s*absolute/i.test(theme), 'Glows do login devem continuar absolutos.');

const db = read('api/_lib/db.js');
assert(db.includes('CREATE TABLE IF NOT EXISTS stripe_events'), 'Schema precisa da tabela de idempotência do Stripe.');
const webhook = read('api/stripe-webhook.js');
assert(webhook.includes('INSERT OR IGNORE INTO stripe_events'), 'Webhook precisa registrar event.id antes de processar.');
const license = read('api/_lib/license.js');
assert(license.includes("status=CASE WHEN ?=1 THEN 'active' ELSE status END"), 'Reassinatura de licença não pode reativar revogadas implicitamente.');

const vercel = JSON.parse(read('../vercel.json'));
assert(vercel.outputDirectory === 'landing/dist', 'Vercel outputDirectory deve apontar para landing/dist.');
assert(Array.isArray(vercel.rewrites) && vercel.rewrites.some(item => item.source === '/login'), 'Vercel precisa de rota /login.');

const serverFiles = [
  'api/auth.js','api/customer.js','api/admin.js','api/stripe-webhook.js',
  'api/_lib/auth.js','api/_lib/db.js','api/_lib/email.js','api/_lib/http.js','api/_lib/license.js',
  '../api/auth.js','../api/customer.js','../api/admin.js','../api/stripe-webhook.js',
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

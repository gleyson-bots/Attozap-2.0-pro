import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const read = file => readFileSync(resolve(root, file), 'utf8');
const assertions = [];

function expect(file, expression, description) {
  const contents = read(file);
  if (!expression.test(contents)) throw new Error(`LICENSE CONTRACT FAILED: ${description} (${file})`);
  assertions.push(description);
}

expect('electron/license.ts', /initialSubscriptionDays\?: number/, 'o payload suporta período inicial de assinatura');
expect('electron/license.ts', /!subscription && license\.payload\.expiresAt/, 'assinaturas não expiram pela data da licença principal');
expect('electron/license-service.ts', /private initialSubscriptionFor\(/, 'o aplicativo calcula o período inicial localmente');
expect('electron/license-service.ts', /INSERT INTO license_subscriptions/, 'a ativação inicial cria uma assinatura local');
expect('electron/license-service.ts', /ON CONFLICT\(license_id\) DO NOTHING/, 'reativar uma licença não reinicia uma mensalidade expirada');
expect('keygen/main.cjs', /app\.getPath\('userData'\)/, 'o Keygen usa armazenamento administrativo persistente');
expect('keygen/main.cjs', /ipcMain\.handle\('history:list'/, 'o Keygen expõe a consulta do histórico');
expect('keygen/main.cjs', /recordLicense\(payload\)/, 'a emissão de licença é registada');
expect('keygen/main.cjs', /recordRenewal\(payload\)/, 'a emissão de renovação é registada');
expect('keygen/main.cjs', /privateKeyPath/, 'o Keygen continua a exigir uma chave privada para assinar');
expect('keygen/renderer.js', /refreshHistory/, 'a interface permite recuperar os dados guardados');
expect('keygen/index.html', /initialSubscriptionDays/, 'a interface configura o período inicial da assinatura');

console.log(`LICENSE SUBSCRIPTION CONTRACT OK: ${assertions.length} verificações.`);

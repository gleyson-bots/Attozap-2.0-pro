import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const engine = readFileSync(resolve(root, 'electron/automation/workflow-engine.ts'), 'utf8');
const editor = readFileSync(resolve(root, 'src/pages/VisualAutomationPage.tsx'), 'utf8');

const allowedBlock = engine.match(/const allowed: WorkflowNodeType\[\] = \[([^\]]+)\]/s)?.[1] ?? '';
const runtimeTypes = [...allowedBlock.matchAll(/'([^']+)'/g)].map(match => match[1]);
if (!runtimeTypes.length) throw new Error('Não foi possível ler os tipos de nó permitidos pelo runtime.');

const missing = runtimeTypes.filter(type => !editor.includes(`type: '${type}'`));
if (missing.length) throw new Error(`A paleta visual não expõe tipos aceites pelo runtime: ${missing.join(', ')}`);
if (!editor.includes("sourceHandle === 'true'") || !editor.includes("sourceHandle === 'false'")) throw new Error('O canvas não preserva os ramos condicionais SIM/NÃO do runtime.');
if (!editor.includes('screenToFlowPosition') || !editor.includes('onNodeDragStop')) throw new Error('O canvas não persiste posições de nós do workflow.');
if (!editor.includes('validationFor') || !editor.includes('O workflow contém um ciclo')) throw new Error('A validação visual de ciclos não está ativa.');
if (!engine.includes('publicHttpUrl') || !engine.includes('O nó HTTP bloqueia endereços locais e privados')) throw new Error('O nó HTTP não possui validação de destinos públicos.');
if (!engine.includes("case 'telegram_send'") || !engine.includes('ATTOZAP_TELEGRAM_BOT_TOKEN')) throw new Error('O nó Telegram não possui execução protegida.');

console.log(`WORKFLOW EDITOR CONTRACT OK: ${runtimeTypes.length} tipos de nó, ramos condicionais e posições persistidas.`);

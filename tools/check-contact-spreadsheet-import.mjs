import assert from 'node:assert/strict';
import { deflateRawSync } from 'node:zlib';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseContactFile } from '../dist-electron/tools/contact-file-import.js';

function localHeader(name, data) {
  const compressed = deflateRawSync(data);
  const header = Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(0, 6);
  header.writeUInt16LE(8, 8);
  header.writeUInt32LE(compressed.length, 18);
  header.writeUInt32LE(data.length, 22);
  header.writeUInt16LE(Buffer.byteLength(name), 26);
  return { compressed, bytes: Buffer.concat([header, Buffer.from(name), compressed]) };
}

function centralHeader(name, compressedSize, uncompressedSize, offset) {
  const header = Buffer.alloc(46);
  header.writeUInt32LE(0x02014b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(20, 6);
  header.writeUInt16LE(0, 8);
  header.writeUInt16LE(8, 10);
  header.writeUInt32LE(compressedSize, 20);
  header.writeUInt32LE(uncompressedSize, 24);
  header.writeUInt16LE(Buffer.byteLength(name), 28);
  header.writeUInt32LE(offset, 42);
  return Buffer.concat([header, Buffer.from(name)]);
}

function xlsxFixture() {
  const shared = '<?xml version="1.0"?><sst><si><t>telefone</t></si><si><t>nome</t></si><si><t>cidade</t></si><si><t>5511987654321</t></si><si><t>Maria</t></si><si><t>São Paulo</t></si><si><t>telefone inválido</t></si><si><t>Ignorado</t></si></sst>';
  const sheet = '<?xml version="1.0"?><worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c></row><row r="2"><c r="A2" t="s"><v>3</v></c><c r="B2" t="s"><v>4</v></c><c r="C2" t="s"><v>5</v></c></row><row r="3"><c r="A3" t="s"><v>3</v></c><c r="B3" t="s"><v>4</v></c></row><row r="4"><c r="A4" t="s"><v>6</v></c><c r="B4" t="s"><v>7</v></c></row></sheetData></worksheet>';
  const files = [
    ['xl/sharedStrings.xml', Buffer.from(shared)],
    ['xl/worksheets/sheet1.xml', Buffer.from(sheet)],
  ];
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  for (const [name, data] of files) {
    const local = localHeader(name, data);
    localParts.push(local.bytes);
    centralParts.push(centralHeader(name, local.compressed.length, data.length, offset));
    offset += local.bytes.length;
  }
  const central = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(central.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...localParts, central, end]);
}

const directory = await mkdtemp(join(tmpdir(), 'attozap-xlsx-'));
try {
  const [contactsPage, extractorIpc] = await Promise.all([
    readFile(new URL('../src/pages/ContactsPage.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../electron/extractor-ipc.ts', import.meta.url), 'utf8'),
  ]);
  assert.match(extractorIpc, /extensions:\s*\[[^\]]*['"]xlsx['"]/i);
  assert.match(contactsPage, /Planilha \/ arquivo/);
  assert.match(contactsPage, /números repetidos ou inválidos não serão importados/i);
  const file = join(directory, 'clientes.xlsx');
  await writeFile(file, xlsxFixture());
  const preview = await parseContactFile(file);
  assert.equal(preview.delimiter, 'XLSX');
  assert.equal(preview.hasHeader, true);
  assert.deepEqual(preview.headers, ['telefone', 'nome', 'cidade']);
  assert.equal(preview.contacts.length, 1);
  assert.equal(preview.contacts[0].phone, '5511987654321');
  assert.equal(preview.contacts[0].name, 'Maria');
  assert.equal(preview.contacts[0].variables.cidade, 'São Paulo');
  assert.equal(preview.skipped, 2);
  console.log('CONTACT SPREADSHEET IMPORT CONTRACT OK: XLSX validado com prévia, deduplicação e linha inválida.');
} finally {
  await rm(directory, { recursive: true, force: true });
}

import { readFile, stat } from 'node:fs/promises';
import { inflateRawSync } from 'node:zlib';

export type ParsedContactFile = {
  fileName: string;
  delimiter: string;
  hasHeader: boolean;
  headers: string[];
  contacts: Array<{ phone: string; name?: string; variables: Record<string, string> }>;
  skipped: number;
};

const PHONE_HEADERS = ['phone','number','mobile','telefone','telefone1','celular','whatsapp','whatsappnumber','numero','número'];
const NAME_HEADERS = ['name','nome','contact','contato','fullname','full_name','pushname'];

function normalizeHeader(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function digits(value: string) { return value.replace(/\D/g, ''); }

function parseLine(line: string, delimiter: string) {
  const cells: string[] = [];
  let value = '';
  let quoted = false;
  for (let index = 0; index < line.length; index++) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') { value += '"'; index++; }
      else quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      cells.push(value.trim()); value = '';
    } else value += char;
  }
  cells.push(value.trim());
  return cells;
}

function detectDelimiter(sample: string[]) {
  const candidates = [';', '\t', ',', '|'];
  let best = ';';
  let bestScore = -1;
  for (const delimiter of candidates) {
    const counts = sample.map(line => parseLine(line, delimiter).length).filter(count => count > 1);
    if (!counts.length) continue;
    const common = new Map<number, number>();
    for (const count of counts) common.set(count, (common.get(count) ?? 0) + 1);
    const score = Math.max(...common.values()) * 100 + Math.max(...counts);
    if (score > bestScore) { best = delimiter; bestScore = score; }
  }
  return best;
}

function findColumn(headers: string[], aliases: string[]) {
  const normalizedAliases = new Set(aliases.map(normalizeHeader));
  return headers.findIndex(header => normalizedAliases.has(normalizeHeader(header)));
}

function decodeXml(value: string) {
  return value
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
    .replace(/&#x([0-9a-f]+);/gi, (_match, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_match, decimal) => String.fromCodePoint(Number.parseInt(decimal, 10)));
}

function xmlText(value: string) {
  return decodeXml(value.replace(/<[^>]+>/g, '')).replace(/\r?\n/g, ' ').trim();
}

function findZipEnd(buffer: Buffer) {
  const minimum = Math.max(0, buffer.length - 65_557);
  for (let index = buffer.length - 22; index >= minimum; index--) {
    if (buffer.readUInt32LE(index) === 0x06054b50) return index;
  }
  throw new Error('Planilha XLSX inválida ou corrompida');
}

function unzipXlsx(buffer: Buffer) {
  if (buffer.length < 22 || buffer.readUInt32LE(0) !== 0x04034b50) throw new Error('Use uma planilha XLSX válida');
  const end = findZipEnd(buffer);
  const totalEntries = buffer.readUInt16LE(end + 10);
  const directorySize = buffer.readUInt32LE(end + 12);
  const directoryOffset = buffer.readUInt32LE(end + 16);
  if (totalEntries > 150 || directorySize > 512_000 || directoryOffset + directorySize > buffer.length) throw new Error('Planilha XLSX excede os limites permitidos');

  const files = new Map<string, { compression: number; compressedSize: number; uncompressedSize: number; localOffset: number }>();
  let position = directoryOffset;
  for (let entry = 0; entry < totalEntries; entry++) {
    if (position + 46 > buffer.length || buffer.readUInt32LE(position) !== 0x02014b50) throw new Error('Estrutura XLSX inválida');
    const compression = buffer.readUInt16LE(position + 10);
    const compressedSize = buffer.readUInt32LE(position + 20);
    const uncompressedSize = buffer.readUInt32LE(position + 24);
    const nameLength = buffer.readUInt16LE(position + 28);
    const extraLength = buffer.readUInt16LE(position + 30);
    const commentLength = buffer.readUInt16LE(position + 32);
    const localOffset = buffer.readUInt32LE(position + 42);
    const nameEnd = position + 46 + nameLength;
    if (nameEnd > buffer.length) throw new Error('Estrutura XLSX inválida');
    const name = buffer.subarray(position + 46, nameEnd).toString('utf8');
    if (!name.includes('..') && (name === 'xl/sharedStrings.xml' || /^xl\/worksheets\/sheet\d+\.xml$/i.test(name))) {
      files.set(name, { compression, compressedSize, uncompressedSize, localOffset });
    }
    position = nameEnd + extraLength + commentLength;
  }

  const readEntry = (name: string, maxOutputLength: number) => {
    const entry = files.get(name);
    if (!entry) return null;
    if (entry.uncompressedSize > maxOutputLength || entry.localOffset + 30 > buffer.length || buffer.readUInt32LE(entry.localOffset) !== 0x04034b50) throw new Error('Planilha XLSX excede os limites permitidos');
    const localNameLength = buffer.readUInt16LE(entry.localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(entry.localOffset + 28);
    const dataStart = entry.localOffset + 30 + localNameLength + localExtraLength;
    const dataEnd = dataStart + entry.compressedSize;
    if (dataEnd > buffer.length) throw new Error('Estrutura XLSX inválida');
    const compressed = buffer.subarray(dataStart, dataEnd);
    const result = entry.compression === 0 ? compressed : entry.compression === 8 ? inflateRawSync(compressed, { maxOutputLength }) : null;
    if (!result || result.length > maxOutputLength) throw new Error('Planilha XLSX usa uma compactação não suportada');
    return result.toString('utf8');
  };

  const sheetName = [...files.keys()].filter(name => /^xl\/worksheets\/sheet\d+\.xml$/i.test(name)).sort((left, right) => left.localeCompare(right, undefined, { numeric: true }))[0];
  if (!sheetName) throw new Error('A planilha não contém uma aba legível');
  return { sharedStrings: readEntry('xl/sharedStrings.xml', 3 * 1024 * 1024) ?? '', sheet: readEntry(sheetName, 6 * 1024 * 1024) ?? '' };
}

function spreadsheetRows(sharedStringsXml: string, sheetXml: string) {
  const sharedStrings: string[] = [];
  for (const match of sharedStringsXml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/gi)) {
    sharedStrings.push([...match[1].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/gi)].map(part => xmlText(part[1])).join('').slice(0, 1024));
  }
  const rows: string[][] = [];
  for (const rowMatch of sheetXml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/gi)) {
    if (rows.length >= 50_001) break;
    const row: string[] = [];
    let fallbackColumn = 0;
    for (const cellMatch of rowMatch[1].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/gi)) {
      const reference = /\br="([A-Z]+)\d+"/i.exec(cellMatch[1])?.[1];
      const column = reference ? [...reference.toUpperCase()].reduce((total, char) => total * 26 + char.charCodeAt(0) - 64, 0) - 1 : fallbackColumn;
      if (column < 0 || column >= 50) continue;
      fallbackColumn = column + 1;
      const kind = /\bt="([^"]+)"/i.exec(cellMatch[1])?.[1];
      const raw = /<v\b[^>]*>([\s\S]*?)<\/v>/i.exec(cellMatch[2])?.[1] ?? '';
      const inline = [...cellMatch[2].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/gi)].map(part => xmlText(part[1])).join('');
      const sharedIndex = Number.parseInt(xmlText(raw), 10);
      const value = kind === 's' && Number.isInteger(sharedIndex) ? (sharedStrings[sharedIndex] ?? '') : kind === 'inlineStr' ? inline : xmlText(raw || inline);
      row[column] = value.slice(0, 1024);
    }
    if (row.some(Boolean)) rows.push(row);
  }
  return rows;
}

function previewFromRows(rows: string[][], fileName: string, delimiter: string): ParsedContactFile {
  if (!rows.length) throw new Error('Arquivo vazio');
  const first = rows[0];
  const phoneHeader = findColumn(first, PHONE_HEADERS);
  const nameHeader = findColumn(first, NAME_HEADERS);
  const hasHeader = phoneHeader >= 0 || nameHeader >= 0;
  const headers = hasHeader ? first.map((value, index) => value || `campo_${index + 1}`) : first.map((_, index) => index === 0 ? 'phone' : index === 1 ? 'name' : `campo_${index + 1}`);
  const phoneIndex = hasHeader && phoneHeader >= 0 ? phoneHeader : 0;
  const nameIndex = hasHeader && nameHeader >= 0 ? nameHeader : 1;
  const contacts: ParsedContactFile['contacts'] = [];
  let skipped = 0;

  for (const cells of hasHeader ? rows.slice(1) : rows) {
    const phone = digits(cells[phoneIndex] ?? '');
    if (phone.length < 6 || phone.length > 15) { skipped++; continue; }
    const name = (cells[nameIndex] ?? '').trim() || undefined;
    const variables: Record<string, string> = {};
    for (let index = 0; index < headers.length; index++) {
      if (index === phoneIndex || index === nameIndex) continue;
      const key = headers[index]?.trim();
      const value = cells[index]?.trim();
      if (key && value) variables[key] = value;
    }
    contacts.push({ phone, name, variables });
  }

  const contactsByPhone = new Map<string, ParsedContactFile['contacts'][number]>();
  for (const contact of contacts) {
    const existing = contactsByPhone.get(contact.phone);
    if (!existing) {
      contactsByPhone.set(contact.phone, contact);
      continue;
    }
    if (!existing.name && contact.name) existing.name = contact.name;
    existing.variables = { ...existing.variables, ...contact.variables };
  }
  const deduped = [...contactsByPhone.values()];
  return { fileName, delimiter, hasHeader, headers, contacts: deduped, skipped: skipped + (contacts.length - deduped.length) };
}

export async function parseContactFile(path: string): Promise<ParsedContactFile> {
  const info = await stat(path);
  if (!info.isFile()) throw new Error('Selecione um arquivo');
  if (info.size > 5 * 1024 * 1024) throw new Error('O arquivo deve ter no máximo 5 MB');
  const extension = path.split('.').pop()?.toLowerCase();
  const fileName = path.split(/[\\/]/).pop() ?? path;
  if (extension === 'xlsx') {
    const { sharedStrings, sheet } = unzipXlsx(await readFile(path));
    return previewFromRows(spreadsheetRows(sharedStrings, sheet), fileName, 'XLSX');
  }
  if (!['csv','txt','tsv'].includes(extension ?? '')) throw new Error('Use arquivo CSV, TXT, TSV ou XLSX');
  const raw = (await readFile(path, 'utf8')).replace(/^\uFEFF/, '');
  const lines = raw.split(/\r?\n/).map(line => line.trimEnd()).filter(line => line.trim()).slice(0, 50_001);
  const delimiter = extension === 'tsv' ? '\t' : detectDelimiter(lines.slice(0, 20));
  return previewFromRows(lines.map(line => parseLine(line, delimiter)), fileName, delimiter === '\t' ? 'TAB' : delimiter);
}

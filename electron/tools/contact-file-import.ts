import { readFile, stat } from 'node:fs/promises';

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

export async function parseContactFile(path: string): Promise<ParsedContactFile> {
  const info = await stat(path);
  if (!info.isFile()) throw new Error('Selecione um arquivo');
  if (info.size > 5 * 1024 * 1024) throw new Error('O arquivo deve ter no máximo 5 MB');
  const extension = path.split('.').pop()?.toLowerCase();
  if (!['csv','txt','tsv'].includes(extension ?? '')) throw new Error('Use arquivo CSV, TXT ou TSV');

  const raw = (await readFile(path, 'utf8')).replace(/^\uFEFF/, '');
  const lines = raw.split(/\r?\n/).map(line => line.trimEnd()).filter(line => line.trim()).slice(0, 50_001);
  if (!lines.length) throw new Error('Arquivo vazio');
  const delimiter = extension === 'tsv' ? '\t' : detectDelimiter(lines.slice(0, 20));
  const first = parseLine(lines[0], delimiter);
  const phoneHeader = findColumn(first, PHONE_HEADERS);
  const nameHeader = findColumn(first, NAME_HEADERS);
  const hasHeader = phoneHeader >= 0 || nameHeader >= 0;
  const headers = hasHeader ? first.map((value, index) => value || `campo_${index + 1}`) : first.map((_, index) => index === 0 ? 'phone' : index === 1 ? 'name' : `campo_${index + 1}`);
  const phoneIndex = hasHeader && phoneHeader >= 0 ? phoneHeader : 0;
  const nameIndex = hasHeader && nameHeader >= 0 ? nameHeader : 1;
  const dataLines = hasHeader ? lines.slice(1) : lines;
  const contacts: ParsedContactFile['contacts'] = [];
  let skipped = 0;

  for (const line of dataLines) {
    const cells = parseLine(line, delimiter);
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

  const deduped = [...new Map(contacts.map(contact => [contact.phone, contact])).values()];
  return {
    fileName: path.split(/[\\/]/).pop() ?? path,
    delimiter: delimiter === '\t' ? 'TAB' : delimiter,
    hasHeader,
    headers,
    contacts: deduped,
    skipped: skipped + (contacts.length - deduped.length),
  };
}

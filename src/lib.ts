export type Recipient = { target: string; name?: string; variables?: Record<string, string> };

export function parseNumbers(text: string) {
  return [...new Set(text.split(/[\s,;|]+/).map(value => value.replace(/\D/g, '')).filter(Boolean))];
}

export function normalizeTarget(value: string) {
  const clean = value.trim();
  if (!clean) return '';
  if (clean.includes('@')) return clean;
  return clean.replace(/\D/g, '');
}

export function parseIdentityTargets(text: string) {
  return [...new Set(text.split(/[\r\n,;|]+/).map(normalizeTarget).filter(Boolean))];
}

export function parseRecipients(text: string): Recipient[] {
  const result: Recipient[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const columns = line.includes('\t') ? line.split('\t') : line.split(/[;,]/);
    const target = normalizeTarget(columns.shift() ?? '');
    if (!target) continue;
    const name = columns.shift()?.trim() || undefined;
    const variables: Record<string, string> = {};
    if (!target.includes('@')) variables.phone = target;
    else if (target.endsWith('@s.whatsapp.net')) variables.phone = target.split('@')[0]?.split(':')[0] ?? '';
    for (const column of columns) {
      const separator = column.indexOf('=');
      if (separator > 0) variables[column.slice(0, separator).trim()] = column.slice(separator + 1).trim();
    }
    result.push({ target, name, variables });
  }
  return result;
}

export function parseGroupTargets(text: string) {
  return [...new Set(text.split(/\r?\n/).map(value => value.trim()).filter(value => value.endsWith('@g.us')))];
}

export function toLocalDateTime(value?: string) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('pt-BR');
}

export function campaignPercent(campaign: any) {
  const total = Number(campaign?.total ?? 0);
  if (!total) return 0;
  return Math.min(100, Math.round(((Number(campaign.sent ?? 0) + Number(campaign.failed ?? 0) + Number(campaign.skipped ?? 0)) / total) * 100));
}

export function csvEscape(value: unknown) {
  const text = String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export async function downloadCsv(name: string, rows: unknown[][]) {
  const csv = rows.map(row => row.map(csvEscape).join(',')).join('\r\n');
  const result = await window.attozap.files.saveText({
    suggestedName: name,
    content: '\ufeff' + csv,
    filters: [{ name: 'Arquivo CSV', extensions: ['csv'] }],
  });
  return result;
}

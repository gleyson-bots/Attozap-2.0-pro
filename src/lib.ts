export type Recipient = { target: string; name?: string; variables?: Record<string, string> };

export function parseNumbers(text: string) {
  return [...new Set(text.split(/[\s,;|]+/).map(value => value.replace(/\D/g, '')).filter(Boolean))];
}

export function parseRecipients(text: string): Recipient[] {
  const result: Recipient[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const columns = line.includes('\t') ? line.split('\t') : line.split(/[;,]/);
    const target = (columns.shift() ?? '').replace(/\D/g, '');
    if (!target) continue;
    const name = columns.shift()?.trim() || undefined;
    const variables: Record<string, string> = {};
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

export function downloadCsv(name: string, rows: unknown[][]) {
  const csv = rows.map(row => row.map(csvEscape).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

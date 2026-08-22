export type PublicWebExtractResult = {
  url: string;
  finalUrl?: string;
  title?: string;
  emails: string[];
  phones: string[];
  socialLinks: string[];
  scannedPages: string[];
  error?: string;
};

const EMAIL_RE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const PHONE_RE = /(?:\+?\d{1,3}[\s().-]*)?(?:\(?\d{2,3}\)?[\s.-]*)?\d{4,5}[\s.-]*\d{4}\b/g;
const HREF_RE = /href\s*=\s*["']([^"'#]+)["']/gi;
const TITLE_RE = /<title[^>]*>([\s\S]*?)<\/title>/i;
const SOCIAL_HOSTS = ['instagram.com','facebook.com','linkedin.com','x.com','twitter.com','tiktok.com','youtube.com','wa.me'];

function unique(values: string[]) { return [...new Set(values.map(value => value.trim()).filter(Boolean))]; }
function cleanText(value: string) { return value.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim(); }
function digits(value: string) { return value.replace(/\D/g, ''); }

function isPrivateIpv4(host: string) {
  const match = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!match) return false;
  const [a,b] = match.slice(1).map(Number);
  return a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a === 0;
}

function safePublicUrl(input: string) {
  const value = input.trim();
  const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
  if (!['http:','https:'].includes(url.protocol)) throw new Error('Somente URLs HTTP/HTTPS são aceitas');
  const host = url.hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.local') || host === '::1' || isPrivateIpv4(host)) throw new Error('Endereço local/privado não é permitido no extrator');
  return url;
}

function extractFromHtml(html: string, base: URL) {
  const emails = unique(html.match(EMAIL_RE) ?? []).filter(email => !/\.(png|jpg|jpeg|gif|webp)$/i.test(email));
  const phones = unique((html.match(PHONE_RE) ?? []).map(value => value.trim())).filter(value => {
    const count = digits(value).length;
    return count >= 10 && count <= 15;
  });
  const socialLinks: string[] = [];
  const candidateLinks: URL[] = [];
  for (const match of html.matchAll(HREF_RE)) {
    try {
      const link = new URL(match[1], base);
      if (!['http:','https:'].includes(link.protocol)) continue;
      if (SOCIAL_HOSTS.some(host => link.hostname === host || link.hostname.endsWith(`.${host}`))) socialLinks.push(link.href);
      const label = `${link.pathname} ${match[1]}`.toLowerCase();
      if (link.origin === base.origin && /(contact|contato|about|sobre|atendimento|fale|support|suporte)/.test(label)) candidateLinks.push(link);
    } catch { /* invalid href */ }
  }
  const title = cleanText(html.match(TITLE_RE)?.[1] ?? '');
  return { emails, phones, socialLinks: unique(socialLinks), candidateLinks: unique(candidateLinks.map(link => link.href)).map(value => new URL(value)), title };
}

async function fetchHtml(url: URL, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'user-agent': 'ATTOZAP-WASender-PublicExtractor/2.0' },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const type = response.headers.get('content-type') ?? '';
    if (!/text\/html|application\/xhtml\+xml/i.test(type)) throw new Error(`Conteúdo não HTML (${type || 'desconhecido'})`);
    const length = Number(response.headers.get('content-length') ?? 0);
    if (length > 2_000_000) throw new Error('Página maior que 2 MB');
    const text = await response.text();
    if (text.length > 2_000_000) throw new Error('Página maior que 2 MB');
    return { html: text, finalUrl: new URL(response.url) };
  } finally { clearTimeout(timer); }
}

export async function extractPublicWebContacts(inputs: string[]): Promise<PublicWebExtractResult[]> {
  const urls = unique(inputs).slice(0, 50);
  const results: PublicWebExtractResult[] = [];

  for (const input of urls) {
    const result: PublicWebExtractResult = { url: input, emails: [], phones: [], socialLinks: [], scannedPages: [] };
    try {
      const root = safePublicUrl(input);
      const first = await fetchHtml(root);
      result.finalUrl = first.finalUrl.href;
      result.scannedPages.push(first.finalUrl.href);
      const initial = extractFromHtml(first.html, first.finalUrl);
      result.title = initial.title;
      result.emails.push(...initial.emails);
      result.phones.push(...initial.phones);
      result.socialLinks.push(...initial.socialLinks);

      for (const link of initial.candidateLinks.slice(0, 5)) {
        if (result.scannedPages.includes(link.href)) continue;
        try {
          const page = await fetchHtml(link, 6000);
          result.scannedPages.push(page.finalUrl.href);
          const extracted = extractFromHtml(page.html, page.finalUrl);
          result.emails.push(...extracted.emails);
          result.phones.push(...extracted.phones);
          result.socialLinks.push(...extracted.socialLinks);
        } catch { /* auxiliary page failure does not fail the root */ }
      }

      result.emails = unique(result.emails);
      result.phones = unique(result.phones);
      result.socialLinks = unique(result.socialLinks);
    } catch (error) {
      result.error = error instanceof Error ? error.message : String(error);
    }
    results.push(result);
  }
  return results;
}

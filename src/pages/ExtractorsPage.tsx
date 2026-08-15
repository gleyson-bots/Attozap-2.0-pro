import { useMemo, useState } from 'react';
import { Download, ExternalLink, Globe2, Mail, Phone, Search, Share2 } from 'lucide-react';
import { downloadCsv } from '../lib';

export function ExtractorsPage() {
  const [rawUrls, setRawUrls] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const urls = useMemo(() => [...new Set(rawUrls.split(/\r?\n/).map(value => value.trim()).filter(Boolean))].slice(0, 50), [rawUrls]);

  async function run() {
    if (!urls.length) return;
    setBusy(true); setError('');
    try { setResults(await window.attozap.extractors.webContacts(urls)); }
    catch (e: any) { setError(e?.message ?? String(e)); }
    finally { setBusy(false); }
  }

  function exportCsv() {
    downloadCsv('website-contacts.csv', [
      ['url','title','email','phone','social_link','scanned_pages','error'],
      ...results.flatMap(row => {
        const emails = row.emails?.length ? row.emails : [''];
        const phones = row.phones?.length ? row.phones : [''];
        const socials = row.socialLinks?.length ? row.socialLinks : [''];
        const max = Math.max(emails.length, phones.length, socials.length);
        return Array.from({ length: max }, (_, index) => [row.finalUrl ?? row.url, row.title ?? '', emails[index] ?? '', phones[index] ?? '', socials[index] ?? '', (row.scannedPages ?? []).join(' | '), row.error ?? '']);
      }),
    ]);
  }

  const totals = useMemo(() => ({
    emails: results.reduce((sum, row) => sum + (row.emails?.length ?? 0), 0),
    phones: results.reduce((sum, row) => sum + (row.phones?.length ?? 0), 0),
    social: results.reduce((sum, row) => sum + (row.socialLinks?.length ?? 0), 0),
  }), [results]);

  return <div className="page-stack">
    <div className="page-head">
      <div><span className="kicker">PUBLIC EXTRACTORS</span><h2>Website Email / Mobile & Social</h2><p>Analisa páginas públicas informadas por você e organiza contatos e links sociais encontrados.</p></div>
      {results.length > 0 && <button className="button ghost" onClick={exportCsv}><Download size={16}/> Exportar CSV</button>}
    </div>

    {error && <div className="notice error">{error}</div>}

    <section className="card">
      <div className="card-head"><div><h3>URLs para analisar</h3><p>{urls.length}/50 endereços</p></div><Globe2 size={18}/></div>
      <div className="field"><label>Uma URL por linha</label><textarea className="tall-area" value={rawUrls} onChange={e => setRawUrls(e.target.value)} placeholder={'https://empresa.com.br\nhttps://outraempresa.com'}/><small>O extrator lê somente HTTP/HTTPS público, limita tamanho/timeout e pode seguir até cinco links de contato/sobre do mesmo domínio.</small></div>
      <button className="button primary" disabled={!urls.length || busy} onClick={() => void run()}><Search size={16}/>{busy ? 'Analisando...' : `Analisar ${urls.length} site(s)`}</button>
    </section>

    <section className="metric-grid">
      <article className="metric-card"><div className="metric-icon"><Globe2 size={18}/></div><span>Sites</span><b>{results.length}</b><small>Analisados</small></article>
      <article className="metric-card"><div className="metric-icon"><Mail size={18}/></div><span>E-mails</span><b>{totals.emails}</b><small>Encontrados</small></article>
      <article className="metric-card"><div className="metric-icon"><Phone size={18}/></div><span>Telefones</span><b>{totals.phones}</b><small>Encontrados</small></article>
      <article className="metric-card"><div className="metric-icon"><Share2 size={18}/></div><span>Links sociais</span><b>{totals.social}</b><small>Encontrados</small></article>
    </section>

    <div className="extractor-results">
      {results.map(row => <section className="card" key={row.url}>
        <div className="card-head"><div><h3>{row.title || row.url}</h3><p>{row.finalUrl || row.url}</p></div>{row.error ? <span className="status-chip failed">falhou</span> : <span className="status-chip connected">ok</span>}</div>
        {row.error ? <div className="notice error">{row.error}</div> : <div className="tools-grid">
          <div><div className="builder-title"><Mail size={15}/><b>E-mails</b></div><div className="member-list">{(row.emails ?? []).map((value: string) => <span key={value}>{value}</span>)}{!row.emails?.length && <small>Nenhum e-mail localizado.</small>}</div></div>
          <div><div className="builder-title"><Phone size={15}/><b>Telefones</b></div><div className="member-list">{(row.phones ?? []).map((value: string) => <span key={value}>{value}</span>)}{!row.phones?.length && <small>Nenhum telefone localizado.</small>}</div></div>
        </div>}
        {!row.error && <div><div className="builder-title"><Share2 size={15}/><b>Redes sociais</b></div><div className="group-list">{(row.socialLinks ?? []).map((value: string) => <a key={value} href={value} target="_blank" rel="noreferrer"><span className="group-avatar"><ExternalLink size={14}/></span><span><b>{new URL(value).hostname}</b><small>{value}</small></span></a>)}{!row.socialLinks?.length && <small>Nenhum link social localizado.</small>}</div></div>}
      </section>)}
      {!results.length && <div className="card empty"><Globe2 size={28}/><p>Informe sites públicos para iniciar a extração.</p></div>}
    </div>

    <div className="notice info">Este módulo não contorna login, CAPTCHA, bloqueios ou paywalls. Ele apenas lê páginas públicas fornecidas pelo usuário. O Google Maps Extractor dedicado continua separado porque exige um adaptador próprio.</div>
  </div>;
}

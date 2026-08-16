import { useEffect, useMemo, useState } from 'react';
import { Download, ExternalLink, Globe2, KeyRound, Mail, MapPin, Phone, Search, Share2, Star, Users } from 'lucide-react';
import { downloadCsv } from '../lib';

type Tab = 'maps' | 'web';

export function ExtractorsPage() {
  const [tab, setTab] = useState<Tab>('maps');
  return <div className="page-stack">
    <div className="page-head"><div><span className="kicker">EXTRATORES</span><h2>Busca de empresas & contatos públicos</h2><p>Google Places API para negócios locais e extrator web para sites informados por você.</p></div></div>
    <div className="member-mode"><button className={tab === 'maps' ? 'active' : ''} onClick={() => setTab('maps')}><MapPin size={14}/> Google Maps</button><button className={tab === 'web' ? 'active' : ''} onClick={() => setTab('web')}><Globe2 size={14}/> Sites / Social</button></div>
    {tab === 'maps' ? <GoogleMapsExtractor/> : <PublicWebExtractor/>}
  </div>;
}

function GoogleMapsExtractor() {
  const [apiKey, setApiKey] = useState('');
  const [query, setQuery] = useState('imobiliárias');
  const [location, setLocation] = useState('São Paulo, SP');
  const [maxResults, setMaxResults] = useState(20);
  const [minRating, setMinRating] = useState(0);
  const [results, setResults] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => { void window.attozap.settings.get('google_places_api_key').then((value: string) => setApiKey(value ?? '')); }, []);

  async function saveKey() {
    await window.attozap.settings.set('google_places_api_key', apiKey.trim());
    setMessage('Chave da Google Places API salva localmente.');
  }

  async function run() {
    if (!query.trim()) { setMessage('Informe o que deseja buscar.'); return; }
    setBusy(true); setMessage('');
    try {
      const output = await window.attozap.extractors.googlePlaces({ query, location, maxResults, minRating: minRating || undefined, languageCode: 'pt-BR', regionCode: 'BR' });
      setResults(output);
      setMessage(`${output.length} empresa(s) encontrada(s).`);
    } catch (e: any) { setMessage(e?.message ?? String(e)); }
    finally { setBusy(false); }
  }

  async function importPhones() {
    const contacts = results.filter(item => item.internationalPhone || item.phone).map(item => ({
      phone: String(item.internationalPhone || item.phone).replace(/\D/g, ''),
      name: item.name,
      variables: { address: item.address, website: item.website, google_maps: item.googleMapsUrl, rating: String(item.rating ?? '') },
    })).filter(item => item.phone);
    if (!contacts.length) { setMessage('Nenhum telefone disponível para importar.'); return; }
    await window.attozap.contacts.import(contacts);
    setMessage(`${contacts.length} contato(s) importado(s) para Contatos & listas.`);
  }

  function exportCsv() {
    void downloadCsv('google-maps-empresas.csv', [
      ['nome','endereco','telefone','telefone_internacional','website','avaliacao','qtd_avaliacoes','tipo','status','latitude','longitude','google_maps','place_id'],
      ...results.map(item => [item.name,item.address,item.phone,item.internationalPhone,item.website,item.rating ?? '',item.ratingCount ?? '',item.primaryType ?? '',item.businessStatus ?? '',item.latitude ?? '',item.longitude ?? '',item.googleMapsUrl,item.placeId]),
    ]);
  }

  return <>
    <section className="card maps-search-card">
      <div className="card-head"><div><h3>Google Maps / Places</h3><p>Busca oficial por categoria, empresa ou serviço + localização.</p></div><MapPin size={19}/></div>
      <div className="form-grid two"><div className="field"><label>O que buscar</label><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Ex.: imobiliárias, dentistas, oficinas"/></div><div className="field"><label>Localização</label><input value={location} onChange={e => setLocation(e.target.value)} placeholder="Ex.: Campinas, SP"/></div></div>
      <div className="form-grid three"><div className="field"><label>Máximo de resultados</label><input type="number" min="1" max="60" value={maxResults} onChange={e => setMaxResults(Math.max(1,Math.min(60,Number(e.target.value))))}/></div><div className="field"><label>Avaliação mínima</label><input type="number" min="0" max="5" step="0.5" value={minRating} onChange={e => setMinRating(Number(e.target.value))}/></div><div className="field"><label>API</label><div className="api-status"><span className={apiKey ? 'online-dot' : 'offline-dot'}/><b>{apiKey ? 'Chave configurada' : 'Configure a chave abaixo'}</b></div></div></div>
      <details className="advanced"><summary><KeyRound size={14}/> Configurar Google Places API (New)</summary><div className="api-key-row"><input type="password" value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="AIza..."/><button className="button ghost" onClick={() => void saveKey()}>Salvar chave</button></div><small>A chave fica somente no SQLite local deste aplicativo. Ative Places API (New) no projeto Google Cloud.</small></details>
      <div className="head-actions"><button className="button primary big" disabled={busy || !query.trim()} onClick={() => void run()}><Search size={17}/>{busy ? 'Buscando...' : 'Buscar empresas'}</button>{results.length > 0 && <><button className="button ghost" onClick={exportCsv}><Download size={16}/> Exportar Excel CSV</button><button className="button ghost" onClick={() => void importPhones()}><Users size={16}/> Importar telefones</button></>}</div>
      {message && <div className={message.toLowerCase().includes('erro') || message.includes('API:') ? 'notice error' : 'notice info'}>{message}</div>}
    </section>

    <section className="metric-grid">
      <article className="metric-card"><div className="metric-icon"><MapPin size={18}/></div><span>Empresas</span><b>{results.length}</b><small>Resultados atuais</small></article>
      <article className="metric-card"><div className="metric-icon"><Phone size={18}/></div><span>Com telefone</span><b>{results.filter(item => item.phone || item.internationalPhone).length}</b><small>Disponíveis</small></article>
      <article className="metric-card"><div className="metric-icon"><Globe2 size={18}/></div><span>Com site</span><b>{results.filter(item => item.website).length}</b><small>Disponíveis</small></article>
      <article className="metric-card"><div className="metric-icon"><Star size={18}/></div><span>Avaliação média</span><b>{results.length ? (results.reduce((sum,item)=>sum+Number(item.rating||0),0)/results.filter(item=>item.rating).length || 0).toFixed(1) : '—'}</b><small>Google Places</small></article>
    </section>

    <section className="card maps-results"><div className="card-head"><div><h3>Resultados</h3><p>Nome, telefone, endereço, site e link oficial do Maps.</p></div></div><div className="maps-table"><div className="maps-table-head"><span>Empresa</span><span>Contato</span><span>Avaliação</span><span>Ações</span></div>{results.map(item => <div className="maps-row" key={item.placeId}><div><b>{item.name}</b><small>{item.address}</small></div><div><span>{item.phone || item.internationalPhone || 'Sem telefone'}</span><small>{item.website || 'Sem site'}</small></div><div><b>{item.rating ? `★ ${item.rating}` : '—'}</b><small>{item.ratingCount ? `${item.ratingCount} avaliações` : ''}</small></div><div className="head-actions">{item.googleMapsUrl && <a className="button tiny" href={item.googleMapsUrl} target="_blank" rel="noreferrer"><ExternalLink size={13}/> Maps</a>}{item.website && <a className="button tiny" href={item.website} target="_blank" rel="noreferrer"><Globe2 size={13}/> Site</a>}</div></div>)}{!results.length && <div className="empty mini"><MapPin size={27}/><p>Faça uma busca para listar empresas.</p></div>}</div></section>
    <div className="notice info">A busca usa Google Places API (New), com limite de até 60 resultados por consulta. Campos como telefone, site e avaliação podem afetar a cobrança da API conforme o FieldMask configurado.</div>
  </>;
}

function PublicWebExtractor() {
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
    void downloadCsv('website-contacts.csv', [
      ['url','titulo','email','telefone','rede_social','paginas_analisadas','erro'],
      ...results.flatMap(row => {
        const emails = row.emails?.length ? row.emails : [''];
        const phones = row.phones?.length ? row.phones : [''];
        const socials = row.socialLinks?.length ? row.socialLinks : [''];
        const max = Math.max(emails.length, phones.length, socials.length);
        return Array.from({ length: max }, (_, index) => [row.finalUrl ?? row.url, row.title ?? '', emails[index] ?? '', phones[index] ?? '', socials[index] ?? '', (row.scannedPages ?? []).join(' | '), row.error ?? '']);
      }),
    ]);
  }

  const totals = useMemo(() => ({ emails: results.reduce((sum, row) => sum + (row.emails?.length ?? 0), 0), phones: results.reduce((sum, row) => sum + (row.phones?.length ?? 0), 0), social: results.reduce((sum, row) => sum + (row.socialLinks?.length ?? 0), 0) }), [results]);

  return <>
    {error && <div className="notice error">{error}</div>}
    <section className="card"><div className="card-head"><div><h3>URLs para analisar</h3><p>{urls.length}/50 endereços</p></div><Globe2 size={18}/></div><div className="field"><label>Uma URL por linha</label><textarea className="tall-area" value={rawUrls} onChange={e => setRawUrls(e.target.value)} placeholder={'https://empresa.com.br\nhttps://outraempresa.com'}/><small>O extrator lê somente HTTP/HTTPS público e pode seguir páginas de contato/sobre do mesmo domínio.</small></div><div className="head-actions"><button className="button primary" disabled={!urls.length || busy} onClick={() => void run()}><Search size={16}/>{busy ? 'Analisando...' : `Analisar ${urls.length} site(s)`}</button>{results.length > 0 && <button className="button ghost" onClick={exportCsv}><Download size={16}/> Exportar CSV</button>}</div></section>
    <section className="metric-grid"><article className="metric-card"><div className="metric-icon"><Globe2 size={18}/></div><span>Sites</span><b>{results.length}</b><small>Analisados</small></article><article className="metric-card"><div className="metric-icon"><Mail size={18}/></div><span>E-mails</span><b>{totals.emails}</b><small>Encontrados</small></article><article className="metric-card"><div className="metric-icon"><Phone size={18}/></div><span>Telefones</span><b>{totals.phones}</b><small>Encontrados</small></article><article className="metric-card"><div className="metric-icon"><Share2 size={18}/></div><span>Links sociais</span><b>{totals.social}</b><small>Encontrados</small></article></section>
    <div className="extractor-results">{results.map(row => <section className="card" key={row.url}><div className="card-head"><div><h3>{row.title || row.url}</h3><p>{row.finalUrl || row.url}</p></div>{row.error ? <span className="status-chip failed">falhou</span> : <span className="status-chip connected">ok</span>}</div>{row.error ? <div className="notice error">{row.error}</div> : <div className="tools-grid"><div><div className="builder-title"><Mail size={15}/><b>E-mails</b></div><div className="member-list">{(row.emails ?? []).map((value: string) => <span key={value}>{value}</span>)}</div></div><div><div className="builder-title"><Phone size={15}/><b>Telefones</b></div><div className="member-list">{(row.phones ?? []).map((value: string) => <span key={value}>{value}</span>)}</div></div></div>}{!row.error && <div><div className="builder-title"><Share2 size={15}/><b>Redes sociais</b></div><div className="group-list">{(row.socialLinks ?? []).map((value: string) => <a key={value} href={value} target="_blank" rel="noreferrer"><span className="group-avatar"><ExternalLink size={14}/></span><span><b>{new URL(value).hostname}</b><small>{value}</small></span></a>)}</div></div>}</section>)}{!results.length && <div className="card empty"><Globe2 size={28}/><p>Informe sites públicos para iniciar a extração.</p></div>}</div>
    <div className="notice info">Este módulo não contorna login, CAPTCHA, bloqueios ou paywalls. Ele apenas lê páginas públicas fornecidas pelo usuário.</div>
  </>;
}

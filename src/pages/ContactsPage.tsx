import { useEffect, useMemo, useState } from 'react';
import { Ban, CheckCircle2, ClipboardPaste, Download, FileUp, Heart, RefreshCw, Search, Users, XCircle } from 'lucide-react';
import { downloadCsv, parseRecipients } from '../lib';

export function ContactsPage({ accounts = [] }: { accounts?: any[] }) {
  const [contacts, setContacts] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [raw, setRaw] = useState('');
  const [showImport, setShowImport] = useState(false);
  const [preview, setPreview] = useState<any | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [accountId, setAccountId] = useState('');
  const connectedAccounts = accounts.filter(account => account.status === 'connected');

  useEffect(() => {
    if (accountId && accounts.some(account => account.id === accountId)) return;
    setAccountId((connectedAccounts[0] ?? accounts[0])?.id ?? '');
  }, [accounts, accountId, connectedAccounts]);

  async function reload(query = search) { setContacts(await window.attozap.contacts.list(query)); }
  useEffect(() => { void reload(''); }, []);
  useEffect(() => {
    const off = window.attozap.messages.onContact(() => {
      void window.attozap.contacts.list(search).then(setContacts).catch(() => undefined);
    });
    return () => off?.();
  }, [search]);

  const manualContacts = useMemo(() => parseRecipients(raw)
    .filter(recipient => !recipient.target.includes('@'))
    .map(recipient => ({ phone: recipient.target, name: recipient.name, variables: recipient.variables })), [raw]);

  async function syncWhatsApp() {
    if (!accountId) { setError('Conecte uma conta do WhatsApp antes de sincronizar.'); return; }
    setSyncing(true); setError(''); setNotice('');
    try {
      const result = await window.attozap.chats.syncContacts(accountId);
      setNotice(`${result.imported} contato(s) sincronizado(s), ${result.skipped} sem telefone PN e ${result.updated} atualizado(s).`);
      await reload('');
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setSyncing(false);
    }
  }

  async function importManual() {
    if (!manualContacts.length) return;
    const result = await window.attozap.contacts.import(manualContacts);
    setNotice(`${result.imported} contatos importados.`);
    setRaw(''); setShowImport(false); await reload('');
  }

  async function pickFile() {
    setError(''); setNotice('');
    try {
      const result = await window.attozap.importers.pickContacts();
      if (result) setPreview(result);
    } catch (e: any) { setError(e?.message ?? String(e)); }
  }

  async function importFile() {
    if (!preview?.contacts?.length) return;
    const result = await window.attozap.contacts.import(preview.contacts);
    setNotice(`${result.imported} contatos importados de ${preview.fileName}. ${preview.skipped} linha(s) ignorada(s)/duplicada(s).`);
    setPreview(null); await reload('');
  }

  async function toggle(phone: string, key: 'block'|'friendly', value: boolean) {
    await window.attozap.contacts[key](phone, value); await reload();
  }

  function exportGoogleContacts() {
    downloadCsv('google-contacts.csv', [
      ['Name','Given Name','Phone 1 - Type','Phone 1 - Value'],
      ...contacts.map(contact => [contact.name || contact.phone, contact.name || '', 'Mobile', `+${contact.phone}`]),
    ]);
  }

  return <div className="page-stack">
    <div className="page-head"><div><span className="kicker">WHATSAPP / AGENDA</span><h2>Agenda local + sincronização</h2><p>Guarde nomes e números localmente; PN/LID e JID técnico continuam separados da apresentação.</p></div><div className="head-actions"><button className="button ghost" onClick={exportGoogleContacts}><Download size={16}/> Google CSV</button><button className="button ghost" onClick={() => downloadCsv('contacts.csv',[['phone','name','blocked','friendly','wa_exists'],...contacts.map(contact => [contact.phone,contact.name??'',contact.is_blocked,contact.is_friendly,contact.wa_exists??''])])}><Download size={16}/> CSV</button><button className="button ghost" onClick={() => void pickFile()} title="CSV, TXT, TSV ou XLSX (até 5 MB)"><FileUp size={16}/> Planilha / arquivo</button><button className="button primary" onClick={() => setShowImport(value => !value)}><ClipboardPaste size={16}/> Colar lista</button></div></div>

    <section className="card agenda-sync-card"><div><span className="kicker">BAILEYS / CONTACTS</span><h3>Sincronizar contactos reais</h3><p>Importa para a agenda local nomes, telefones PN e identidades observadas pela conta selecionada.</p></div><div className="agenda-sync-actions"><select className="agenda-account-select" value={accountId} onChange={event => setAccountId(event.target.value)} disabled={!accounts.length}><option value="">Selecione uma conta</option>{accounts.map(account => <option key={account.id} value={account.id}>{account.name}{account.status === 'connected' ? ' · online' : ' · offline'}</option>)}</select><button className="button primary" onClick={() => void syncWhatsApp()} disabled={syncing || !accountId}><RefreshCw size={15} className={syncing ? 'spin' : ''}/> {syncing ? 'Sincronizando…' : 'Sincronizar WhatsApp'}</button></div></section>

    {error && <div className="notice error">{error}</div>}
    {notice && <div className="notice info">{notice}</div>}

    {preview && <section className="card import-box"><div><h3>Prévia do arquivo — {preview.fileName}</h3><p>{preview.contacts.length} contatos válidos · {preview.skipped} ignorados · formato {preview.delimiter} · {preview.hasHeader ? 'cabeçalho detectado' : 'sem cabeçalho'}</p><small>Colunas: {(preview.headers ?? []).join(' · ')}. Os primeiros 100 contatos são exibidos; números repetidos ou inválidos não serão importados.</small></div><div className="contacts-table"><div className="contacts-head"><span>CONTATO</span><span>VARIÁVEIS</span><span></span><span></span></div>{preview.contacts.slice(0,100).map((contact:any) => <div className="contacts-row" key={contact.phone}><div><b>{contact.name || 'Sem nome'}</b><small>+{contact.phone}</small></div><span>{Object.entries(contact.variables ?? {}).slice(0,3).map(([key,value]) => `${key}=${value}`).join(' · ') || '—'}</span><span></span><span></span></div>)}</div><div className="head-actions"><button className="button ghost" onClick={() => setPreview(null)}>Cancelar</button><button className="button primary" onClick={() => void importFile()}><FileUp size={15}/> Importar {preview.contacts.length}</button></div></section>}

    {showImport && <section className="card import-box"><div><h3>Colar contatos</h3><p>Formato: número;nome;campo=valor. Para JID/LID, use diretamente o Sender.</p></div><textarea value={raw} onChange={e => setRaw(e.target.value)} placeholder={'5511999999999;Maria;cidade=SP\n5511888888888;João;cidade=RJ'}/><div className="head-actions"><button className="button ghost" onClick={() => setShowImport(false)}>Cancelar</button><button className="button primary" disabled={!manualContacts.length} onClick={() => void importManual()}>Importar {manualContacts.length}</button></div></section>}

    <section className="card"><div className="table-toolbar"><div className="search-input"><Search size={16}/><input value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && void reload()} placeholder="Buscar nome ou número..."/></div><button className="button ghost" onClick={() => void reload()}><RefreshCw size={15}/> Atualizar</button></div><div className="contacts-table"><div className="contacts-head"><span>CONTATO</span><span>WHATSAPP</span><span>FRIENDLY</span><span>BLOCKLIST</span></div>{contacts.map(contact => <div className="contacts-row" key={contact.phone}><div><b>{contact.name || 'Sem nome'}</b><small>+{contact.phone}</small></div><span>{contact.wa_exists === 1 ? <span className="valid"><CheckCircle2 size={14}/> Sim</span> : contact.wa_exists === 0 ? <span className="invalid"><XCircle size={14}/> Não</span> : 'Não verificado'}</span><button className={`list-toggle ${contact.is_friendly?'on friendly':''}`} onClick={() => void toggle(contact.phone,'friendly',!contact.is_friendly)}><Heart size={15}/>{contact.is_friendly?'Na lista':'Adicionar'}</button><button className={`list-toggle ${contact.is_blocked?'on blocked':''}`} onClick={() => void toggle(contact.phone,'block',!contact.is_blocked)}><Ban size={15}/>{contact.is_blocked?'Bloqueado':'Bloquear'}</button></div>)}{!contacts.length && <div className="empty mini"><Users size={24}/><p>Nenhum contato salvo.</p></div>}</div></section>
  </div>;
}

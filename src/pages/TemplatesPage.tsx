import { useEffect, useMemo, useState } from 'react';
import { Copy, FileText, Plus, Save, Search, Trash2 } from 'lucide-react';

export function TemplatesPage() {
  const [templates, setTemplates] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [form, setForm] = useState({ name: '', category: '', body: 'Olá {name}!' });
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function reload(selectId?: string) {
    try {
      const rows = await window.attozap.templates.list();
      setTemplates(rows);
      const id = selectId ?? selectedId;
      if (id) {
        const selected = rows.find((item: any) => item.id === id);
        if (selected) setForm({ name: selected.name, category: selected.category ?? '', body: selected.body });
      }
    } catch (e: any) { setError(e?.message ?? String(e)); }
  }

  useEffect(() => { void reload(); }, []);

  const filtered = useMemo(() => {
    const value = query.trim().toLowerCase();
    if (!value) return templates;
    return templates.filter(item => [item.name, item.category, item.body].some(value2 => String(value2 ?? '').toLowerCase().includes(value)));
  }, [templates, query]);

  function select(item: any) {
    setSelectedId(item.id);
    setForm({ name: item.name, category: item.category ?? '', body: item.body });
    setNotice(''); setError('');
  }

  function newTemplate() {
    setSelectedId(null);
    setForm({ name: '', category: '', body: 'Olá {name}!' });
    setNotice(''); setError('');
  }

  async function save() {
    setBusy(true); setError(''); setNotice('');
    try {
      const saved = selectedId
        ? await window.attozap.templates.update(selectedId, form)
        : await window.attozap.templates.create(form);
      setSelectedId(saved.id);
      setNotice('Template salvo.');
      await reload(saved.id);
    } catch (e: any) { setError(e?.message ?? String(e)); }
    finally { setBusy(false); }
  }

  async function remove() {
    if (!selectedId) return;
    setBusy(true); setError(''); setNotice('');
    try {
      await window.attozap.templates.remove(selectedId);
      setSelectedId(null);
      setForm({ name: '', category: '', body: 'Olá {name}!' });
      setNotice('Template excluído.');
      await reload();
    } catch (e: any) { setError(e?.message ?? String(e)); }
    finally { setBusy(false); }
  }

  async function copyBody() {
    setError(''); setNotice('');
    try {
      await window.attozap.clipboard.writeText(form.body);
      setNotice('Conteúdo copiado para a área de transferência.');
    } catch (e: any) { setError(e?.message ?? String(e)); }
  }

  return <div className="page-stack">
    <div className="page-head"><div><span className="kicker">MESSAGE TEMPLATES</span><h2>Biblioteca de mensagens</h2><p>Templates locais reutilizáveis com as mesmas variáveis do sender.</p></div><button className="button primary" onClick={newTemplate}><Plus size={16}/> Novo template</button></div>
    {error && <div className="notice error">{error}</div>}
    {notice && <div className="notice info">{notice}</div>}

    <div className="tools-grid">
      <section className="card">
        <div className="table-toolbar"><div className="search-input"><Search size={16}/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar template..."/></div></div>
        <div className="group-list">{filtered.map(item => <button key={item.id} className={selectedId === item.id ? 'selected' : ''} onClick={() => select(item)}><span className="group-avatar"><FileText size={16}/></span><span><b>{item.name}</b><small>{item.category || 'Sem categoria'}</small></span></button>)}{!filtered.length && <div className="empty mini"><FileText size={23}/><p>Nenhum template salvo.</p></div>}</div>
      </section>

      <section className="card">
        <div className="card-head"><div><h3>{selectedId ? 'Editar template' : 'Novo template'}</h3><p>Use {'{name}'}, {'{phone}'} ou {'{{campo}}'}.</p></div></div>
        <div className="form-grid two"><div className="field"><label>Nome</label><input value={form.name} onChange={e => setForm(value => ({...value, name: e.target.value}))} placeholder="Boas-vindas"/></div><div className="field"><label>Categoria</label><input value={form.category} onChange={e => setForm(value => ({...value, category: e.target.value}))} placeholder="Vendas"/></div></div>
        <div className="field"><label>Conteúdo</label><textarea className="tall-area" value={form.body} onChange={e => setForm(value => ({...value, body: e.target.value}))}/></div>
        <div className="variable-row"><span>Variáveis:</span><button onClick={() => setForm(value => ({...value, body: value.body + ' {name}'}))}>{'{name}'}</button><button onClick={() => setForm(value => ({...value, body: value.body + ' {phone}'}))}>{'{phone}'}</button></div>
        <div className="head-actions"><button className="button ghost" disabled={busy} onClick={() => void copyBody()}><Copy size={15}/> Copiar</button>{selectedId && <button className="button ghost" disabled={busy} onClick={() => void remove()}><Trash2 size={15}/> Excluir</button>}<button className="button primary" disabled={busy} onClick={() => void save()}><Save size={15}/>{busy ? 'Salvando...' : 'Salvar'}</button></div>
      </section>
    </div>
  </div>;
}

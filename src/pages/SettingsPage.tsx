import { useEffect, useState } from 'react';
import { Palette, RefreshCw, Settings, Type } from 'lucide-react';
import { toLocalDateTime } from '../lib';

const accents = [
  { id: 'violet', label: 'Violeta', value: '#7c5cff' },
  { id: 'blue', label: 'Azul', value: '#3b82f6' },
  { id: 'emerald', label: 'Verde', value: '#10b981' },
  { id: 'rose', label: 'Rosa', value: '#ec4899' },
  { id: 'amber', label: 'Âmbar', value: '#f59e0b' },
];

export function applyUiPreferences(prefs: { fontScale?: string; accent?: string; density?: string }) {
  const root = document.documentElement;
  if (prefs.fontScale) root.style.setProperty('--ui-scale', String(Number(prefs.fontScale) / 100));
  if (prefs.accent) {
    const found = accents.find(item => item.id === prefs.accent);
    if (found) root.style.setProperty('--accent-custom', found.value);
  }
  if (prefs.density) root.dataset.density = prefs.density;
}

export function SettingsPage({ accounts }: { accounts: any[] }) {
  const [audit, setAudit] = useState<any[]>([]);
  const [fontScale, setFontScale] = useState('112');
  const [accent, setAccent] = useState('violet');
  const [density, setDensity] = useState('comfortable');
  const [saved, setSaved] = useState('');

  async function reloadAudit() { setAudit(await window.attozap.audit.list()); }

  useEffect(() => {
    void reloadAudit();
    void (async () => {
      const [font, color, space] = await Promise.all([
        window.attozap.settings.get('ui_font_scale'),
        window.attozap.settings.get('ui_accent'),
        window.attozap.settings.get('ui_density'),
      ]);
      const prefs = { fontScale: font || '112', accent: color || 'violet', density: space || 'comfortable' };
      setFontScale(prefs.fontScale); setAccent(prefs.accent); setDensity(prefs.density); applyUiPreferences(prefs);
    })();
  }, []);

  async function save() {
    await Promise.all([
      window.attozap.settings.set('ui_font_scale', fontScale),
      window.attozap.settings.set('ui_accent', accent),
      window.attozap.settings.set('ui_density', density),
    ]);
    applyUiPreferences({ fontScale, accent, density });
    setSaved('Personalização salva. Ela será restaurada ao abrir o aplicativo.');
    setTimeout(() => setSaved(''), 2500);
  }

  return <div className="page-stack">
    <div className="page-head"><div><span className="kicker">SETTINGS</span><h2>Configurações & aparência</h2><p>Aumente a leitura, altere a cor principal e ajuste o espaçamento do ATTOZAP.</p></div><button className="button ghost" onClick={() => void reloadAudit()}><RefreshCw size={15}/> Atualizar auditoria</button></div>
    {saved && <div className="notice success">{saved}</div>}
    <div className="settings-grid">
      <section className="card"><div className="card-head"><div><h3>Personalização da interface</h3><p>Preferências locais deste computador.</p></div><Palette size={18}/></div>
        <div className="field"><label><Type size={14}/> Tamanho geral da fonte — {fontScale}%</label><input type="range" min="95" max="135" step="1" value={fontScale} onChange={e => { setFontScale(e.target.value); applyUiPreferences({fontScale:e.target.value}); }}/><div className="scale-preview"><span>Pequeno</span><b style={{fontSize:`calc(1rem * ${Number(fontScale)/100})`}}>Exemplo de leitura ATTOZAP</b><span>Grande</span></div></div>
        <div className="field"><label>Cor de destaque</label><div className="accent-picker">{accents.map(item => <button key={item.id} className={accent === item.id ? 'active' : ''} onClick={() => { setAccent(item.id); applyUiPreferences({accent:item.id}); }} title={item.label}><i style={{background:item.value}}/><span>{item.label}</span></button>)}</div></div>
        <div className="field"><label>Densidade</label><div className="member-mode"><button className={density === 'compact' ? 'active' : ''} onClick={() => { setDensity('compact'); applyUiPreferences({density:'compact'}); }}>Compacta</button><button className={density === 'comfortable' ? 'active' : ''} onClick={() => { setDensity('comfortable'); applyUiPreferences({density:'comfortable'}); }}>Confortável</button><button className={density === 'spacious' ? 'active' : ''} onClick={() => { setDensity('spacious'); applyUiPreferences({density:'spacious'}); }}>Espaçosa</button></div></div>
        <button className="button primary" onClick={() => void save()}>Salvar aparência</button>
      </section>
      <section className="card"><div className="card-head"><div><h3>Diagnóstico</h3><p>Resumo do ambiente atual</p></div><Settings size={18}/></div><div className="diagnostic"><div><span>Contas cadastradas</span><b>{accounts.length}</b></div><div><span>Contas online</span><b>{accounts.filter(account => account.status === 'connected').length}</b></div><div><span>Banco</span><b>SQLite WAL</b></div><div><span>Motor</span><b>Baileys v7 / JID-LID</b></div></div><div className="notice info">Proxy é configurável individualmente em Contas e também no WebChat.</div></section>
    </div>
    <section className="card"><div className="card-head"><div><h3>Auditoria recente</h3><p>Últimas ações persistidas.</p></div></div><div className="audit-list">{audit.slice(0, 100).map(row => <div key={row.id}><span className="audit-dot"/><div><b>{row.action}</b><small>{row.entity_type} · {row.entity_id ?? '—'}</small></div><time>{toLocalDateTime(row.created_at)}</time></div>)}</div></section>
  </div>;
}

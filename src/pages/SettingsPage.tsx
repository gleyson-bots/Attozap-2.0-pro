import { useEffect, useState } from 'react';
import { Bot, KeyRound, Layers3, Palette, RefreshCw, Settings, ShieldCheck, Type } from 'lucide-react';
import { toLocalDateTime } from '../lib';

const accents = [
  { id: 'violet', label: 'Violeta', value: '#7c5cff' }, { id: 'blue', label: 'Azul', value: '#3b82f6' },
  { id: 'emerald', label: 'Verde', value: '#10b981' }, { id: 'rose', label: 'Rosa', value: '#ec4899' }, { id: 'amber', label: 'Âmbar', value: '#f59e0b' },
];

export function applyUiPreferences(prefs: { fontScale?: string; accent?: string; density?: string }) {
  const root = document.documentElement;
  if (prefs.fontScale) root.style.setProperty('--ui-scale', String(Number(prefs.fontScale) / 100));
  if (prefs.accent) { const found = accents.find(item => item.id === prefs.accent); if (found) { root.style.setProperty('--accent-custom', found.value); root.style.setProperty('--accent', found.value); } }
  if (prefs.density) root.dataset.density = prefs.density;
}

type UiMode = 'basic'|'advanced';
export function SettingsPage({ accounts, uiMode = 'basic', onUiModeChange }: { accounts: any[]; uiMode?: UiMode; onUiModeChange?: (mode: UiMode) => void }) {
  const [audit, setAudit] = useState<any[]>([]);
  const [fontScale, setFontScale] = useState('112'); const [accent, setAccent] = useState('violet'); const [density, setDensity] = useState('comfortable');
  const [mode, setMode] = useState<UiMode>(uiMode);
  const [xaiKey, setXaiKey] = useState(''); const [xaiModel, setXaiModel] = useState('grok-4-fast-non-reasoning');
  const [poolsideKey, setPoolsideKey] = useState(''); const [poolsideBase, setPoolsideBase] = useState(''); const [poolsideModel, setPoolsideModel] = useState('');
  const [secureAvailable, setSecureAvailable] = useState(false);
  const [saved, setSaved] = useState('');

  async function reloadAudit() { setAudit(await window.attozap.audit.list()); }
  useEffect(() => {
    void reloadAudit();
    void (async () => {
      const [font, color, space, storedMode, xKey, xModel, pKey, pBase, pModel, secure] = await Promise.all([
        window.attozap.settings.get('ui_font_scale'), window.attozap.settings.get('ui_accent'), window.attozap.settings.get('ui_density'), window.attozap.settings.get('ui_mode'),
        window.attozap.secure.get('ai_xai_key'), window.attozap.settings.get('ai_xai_model'), window.attozap.secure.get('ai_poolside_key'),
        window.attozap.settings.get('ai_poolside_base_url'), window.attozap.settings.get('ai_poolside_model'), window.attozap.secure.available(),
      ]);
      const prefs = { fontScale: font || '112', accent: color || 'violet', density: space || 'comfortable' };
      setFontScale(prefs.fontScale); setAccent(prefs.accent); setDensity(prefs.density); applyUiPreferences(prefs);
      setMode(storedMode === 'advanced' ? 'advanced' : 'basic');
      setXaiKey(xKey || ''); setXaiModel(xModel || 'grok-4-fast-non-reasoning'); setPoolsideKey(pKey || ''); setPoolsideBase(pBase || ''); setPoolsideModel(pModel || ''); setSecureAvailable(Boolean(secure));
    })();
  }, []);

  async function saveAppearance() {
    await Promise.all([window.attozap.settings.set('ui_font_scale', fontScale), window.attozap.settings.set('ui_accent', accent), window.attozap.settings.set('ui_density', density), window.attozap.settings.set('ui_mode', mode)]);
    applyUiPreferences({ fontScale, accent, density }); onUiModeChange?.(mode); setSaved('Personalização salva.'); setTimeout(() => setSaved(''), 2500);
  }
  async function saveAi() {
    if (!secureAvailable && (xaiKey.trim() || poolsideKey.trim())) throw new Error('O armazenamento protegido do sistema não está disponível. Não é seguro salvar API keys neste computador.');
    await Promise.all([
      window.attozap.secure.set('ai_xai_key', xaiKey.trim()), window.attozap.settings.set('ai_xai_model', xaiModel.trim()),
      window.attozap.secure.set('ai_poolside_key', poolsideKey.trim()), window.attozap.settings.set('ai_poolside_base_url', poolsideBase.trim()), window.attozap.settings.set('ai_poolside_model', poolsideModel.trim()),
    ]);
    setSaved('Provedores de IA salvos no armazenamento protegido do sistema.'); setTimeout(() => setSaved(''), 2500);
  }

  return <div className="page-stack">
    <div className="page-head"><div><span className="kicker">SETTINGS</span><h2>Configurações & aparência</h2><p>Leitura, navegação, cores, IA e preferências locais.</p></div><button className="button ghost" onClick={() => void reloadAudit()}><RefreshCw size={15}/> Atualizar auditoria</button></div>
    {saved && <div className="notice success">{saved}</div>}
    <div className="settings-grid">
      <section className="card"><div className="card-head"><div><h3>Personalização da interface</h3><p>Preferências locais deste computador.</p></div><Palette size={18}/></div>
        <div className="field"><label><Layers3 size={14}/> Modo de navegação</label><div className="ui-mode-picker"><button className={mode === 'basic' ? 'active' : ''} onClick={() => setMode('basic')}><b>Básico</b><span>Mostra as ferramentas principais e esconde opções técnicas.</span></button><button className={mode === 'advanced' ? 'active' : ''} onClick={() => setMode('advanced')}><b>Avançado</b><span>Libera JID/LID, extratores, Bulk Tools, Poll Report e diagnósticos técnicos.</span></button></div></div>
        <div className="field"><label><Type size={14}/> Tamanho geral da fonte — {fontScale}%</label><input type="range" min="95" max="145" step="1" value={fontScale} onChange={e => { setFontScale(e.target.value); applyUiPreferences({fontScale:e.target.value}); }}/><div className="scale-preview"><span>Pequeno</span><b style={{fontSize:`calc(1rem * ${Number(fontScale)/100})`}}>Exemplo de leitura ATTOZAP</b><span>Grande</span></div></div>
        <div className="field"><label>Cor de destaque</label><div className="accent-picker">{accents.map(item => <button key={item.id} className={accent === item.id ? 'active' : ''} onClick={() => { setAccent(item.id); applyUiPreferences({accent:item.id}); }} title={item.label}><i style={{background:item.value}}/><span>{item.label}</span></button>)}</div></div>
        <div className="field"><label>Densidade</label><div className="member-mode"><button className={density === 'compact' ? 'active' : ''} onClick={() => { setDensity('compact'); applyUiPreferences({density:'compact'}); }}>Compacta</button><button className={density === 'comfortable' ? 'active' : ''} onClick={() => { setDensity('comfortable'); applyUiPreferences({density:'comfortable'}); }}>Confortável</button><button className={density === 'spacious' ? 'active' : ''} onClick={() => { setDensity('spacious'); applyUiPreferences({density:'spacious'}); }}>Espaçosa</button></div></div>
        <button className="button primary" onClick={() => void saveAppearance()}>Salvar aparência</button>
      </section>
      <section className="card"><div className="card-head"><div><h3>Diagnóstico rápido</h3><p>Resumo do ambiente atual</p></div><Settings size={18}/></div><div className="diagnostic"><div><span>Contas cadastradas</span><b>{accounts.length}</b></div><div><span>Contas online</span><b>{accounts.filter(account => account.status === 'connected').length}</b></div><div><span>Banco</span><b>SQLite WAL</b></div><div><span>Motor</span><b>Baileys v7 / JID-LID</b></div></div><div className="notice info">O Health Center faz a verificação completa de socket, banco, disco, backups e falhas.</div></section>
    </div>

    <section className="card"><div className="card-head"><div><h3>IA para aquecimento</h3><p>As chaves ficam protegidas pelo sistema operacional e não entram nos diagnósticos.</p></div><Bot size={18}/></div>
      <div className={`notice ${secureAvailable ? 'success' : 'error'}`}><ShieldCheck size={14}/> {secureAvailable ? 'Armazenamento protegido disponível. No Windows, as chaves são vinculadas à proteção do usuário local.' : 'Armazenamento protegido indisponível. O ATTOZAP não permitirá salvar novas API keys.'}</div>
      <div className="tools-grid"><div><div className="builder-title"><KeyRound size={15}/><b>xAI / Grok</b></div><div className="field"><label>API Key</label><input type="password" value={xaiKey} onChange={e => setXaiKey(e.target.value)} placeholder="xai-..."/></div><div className="field"><label>Modelo</label><input value={xaiModel} onChange={e => setXaiModel(e.target.value)} placeholder="grok-..."/></div></div><div><div className="builder-title"><KeyRound size={15}/><b>Poolside</b></div><div className="field"><label>API Key</label><input type="password" value={poolsideKey} onChange={e => setPoolsideKey(e.target.value)}/></div><div className="field"><label>URL do deployment</label><input value={poolsideBase} onChange={e => setPoolsideBase(e.target.value)} placeholder="https://seu-deployment..."/></div><div className="field"><label>Modelo</label><input value={poolsideModel} onChange={e => setPoolsideModel(e.target.value)}/></div></div></div>
      <button className="button primary" onClick={() => void saveAi()}>Salvar provedores de IA</button>
    </section>

    <section className="card"><div className="card-head"><div><h3>Auditoria recente</h3><p>Últimas ações persistidas.</p></div></div><div className="audit-list">{audit.slice(0, 100).map(row => <div key={row.id}><span className="audit-dot"/><div><b>{row.action}</b><small>{row.entity_type} · {row.entity_id ?? '—'}</small></div><time>{toLocalDateTime(row.created_at)}</time></div>)}</div></section>
  </div>;
}

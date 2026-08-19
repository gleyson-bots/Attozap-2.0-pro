import { useEffect, useState } from 'react';
import { Activity, Archive, CheckCircle2, Database, Download, HardDrive, RefreshCw, RotateCcw, ShieldCheck, TriangleAlert, Wrench } from 'lucide-react';
import { toLocalDateTime } from '../lib';

function humanBytes(value?: number) {
  const bytes = Number(value ?? 0);
  if (!bytes) return '0 B';
  const units = ['B','KB','MB','GB','TB'];
  const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / 1024 ** index).toFixed(index > 1 ? 1 : 0)} ${units[index]}`;
}

export function HealthCenterPage() {
  const [health, setHealth] = useState<any>(null);
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  async function reload() {
    try { setHealth(await window.attozap.system.health()); setError(''); }
    catch (e: any) { setError(e?.message ?? String(e)); }
  }
  useEffect(() => { void reload(); }, []);

  async function backup(includeSessions: boolean) {
    setBusy(includeSessions ? 'full' : 'data'); setError('');
    try {
      const result = await window.attozap.system.backup(includeSessions);
      if (result?.saved) setNotice(`Backup salvo em: ${result.folder}`);
    } catch (e: any) { setError(e?.message ?? String(e)); }
    finally { setBusy(''); }
  }
  async function optimize() {
    setBusy('optimize');
    try { await window.attozap.system.optimize(); setNotice('Banco otimizado e checkpoint WAL executado.'); await reload(); }
    catch (e: any) { setError(e?.message ?? String(e)); }
    finally { setBusy(''); }
  }
  async function restore() {
    if (!window.confirm('Restaurar um backup substitui os dados locais atuais e reinicia o ATTOZAP. Deseja continuar?')) return;
    setBusy('restore');
    try { await window.attozap.system.restore(); }
    catch (e: any) { setError(e?.message ?? String(e)); setBusy(''); }
  }
  async function diagnostics() {
    setBusy('diag');
    try {
      const data = await window.attozap.system.diagnostics();
      await window.attozap.files.saveText({ suggestedName: `ATTOZAP-Diagnostico-${new Date().toISOString().slice(0,10)}.json`, content: JSON.stringify(data, null, 2), filters: [{ name: 'Diagnóstico JSON', extensions: ['json'] }] });
      setNotice('Diagnóstico sanitizado exportado. Nenhuma chave ou conteúdo de conversa é incluído.');
    } catch (e: any) { setError(e?.message ?? String(e)); }
    finally { setBusy(''); }
  }

  if (!health) return <div className="page-stack"><div className="page-head"><div><span className="kicker">SAÚDE LOCAL</span><h2>Health Center</h2></div></div><div className="card health-loading"><Activity className="spin"/> Verificando o ambiente local...</div>{error && <div className="notice error">{error}</div>}</div>;

  const statusLabel = health.overall === 'healthy' ? 'Tudo funcionando' : health.overall === 'warning' ? 'Atenção necessária' : 'Problema detectado';
  return <div className="page-stack">
    <div className="page-head"><div><span className="kicker">SAÚDE LOCAL</span><h2>Health Center</h2><p>Sessões, banco, armazenamento e falhas — tudo verificado neste computador.</p></div><button className="button ghost" onClick={() => void reload()}><RefreshCw size={15}/> Atualizar</button></div>
    {error && <div className="notice error">{error}</div>}{notice && <div className="notice success">{notice}</div>}

    <section className={`health-overview ${health.overall}`}><div className="health-orb">{health.overall === 'healthy' ? <CheckCircle2/> : <TriangleAlert/>}</div><div><span>STATUS GERAL</span><h3>{statusLabel}</h3><p>Última verificação: {toLocalDateTime(health.generatedAt)}</p></div><div className="health-score"><b>{health.accounts.filter((a:any) => a.runtimeConnected).length}/{health.accounts.length}</b><span>sockets ativos</span></div></section>

    <div className="health-metrics">
      <article className="card"><Database/><span>SQLite</span><b>{health.database.quickCheck === 'ok' ? 'Íntegro' : health.database.quickCheck}</b><small>{health.database.journalMode?.toUpperCase()} · {humanBytes(health.database.sizeBytes)}</small></article>
      <article className="card"><HardDrive/><span>Disco livre</span><b>{humanBytes(health.disk.freeBytes)}</b><small>de {humanBytes(health.disk.totalBytes)}</small></article>
      <article className="card"><Activity/><span>Memória do app</span><b>{humanBytes(health.process.memoryBytes)}</b><small>Electron {health.process.electron} · Node {health.process.node}</small></article>
      <article className="card"><ShieldCheck/><span>Segredos locais</span><b>{health.secureStorage ? 'Protegidos' : 'Indisponível'}</b><small>{health.secureStorage ? 'Armazenamento seguro do sistema' : 'Não salve API keys nesta máquina'}</small></article>
    </div>

    {health.issues.length > 0 && <section className="card"><div className="card-head"><div><h3>Alertas encontrados</h3><p>Itens que merecem atenção.</p></div></div><div className="health-issues">{health.issues.map((issue:any) => <div key={`${issue.code}-${issue.message}`} className={issue.level}><TriangleAlert size={17}/><div><b>{issue.code}</b><span>{issue.message}</span></div></div>)}</div></section>}

    <div className="health-grid">
      <section className="card"><div className="card-head"><div><h3>Sessões WhatsApp</h3><p>Status persistido versus socket real em memória.</p></div></div><div className="health-accounts">{health.accounts.map((account:any) => <div key={account.id}><span className={`health-dot ${account.runtimeConnected ? 'ok' : account.status === 'connected' ? 'bad' : ''}`}/><div className="grow"><b>{account.name}</b><small>{account.phone ? `+${account.phone}` : 'Número não resolvido'} · banco: {account.status}</small></div><span className={`status-chip ${account.runtimeConnected ? 'connected' : 'stopped'}`}>{account.runtimeConnected ? 'socket ativo' : 'socket inativo'}</span></div>)}{!health.accounts.length && <p className="muted-copy">Nenhuma conta configurada.</p>}</div></section>
      <section className="card"><div className="card-head"><div><h3>Resumo local</h3><p>Contagens úteis para diagnóstico.</p></div></div><div className="diagnostic health-counts"><div><span>Mensagens</span><b>{health.counts.messages}</b></div><div><span>Falhas 24h</span><b>{health.counts.failed24h}</b></div><div><span>Identidades</span><b>{health.counts.identities}</b></div><div><span>Contatos</span><b>{health.counts.contacts}</b></div><div><span>Grupos</span><b>{health.counts.groups}</b></div><div><span>Aquecimentos</span><b>{health.counts.warmups}</b></div></div></section>
    </div>

    <section className="card backup-center"><div className="card-head"><div><h3>Backup & recuperação</h3><p>Sem nuvem e sem servidor: os arquivos ficam onde você escolher.</p></div><Archive size={18}/></div><div className="backup-actions">
      <button className="backup-action" disabled={!!busy} onClick={() => void backup(false)}><Database/><div><b>Backup dos dados</b><span>SQLite, configurações, contatos, templates, histórico e regras.</span></div></button>
      <button className="backup-action sensitive" disabled={!!busy} onClick={() => void backup(true)}><ShieldCheck/><div><b>Backup completo</b><span>Inclui também sessões autenticadas do WhatsApp. Trate como arquivo confidencial.</span></div></button>
      <button className="backup-action" disabled={!!busy} onClick={() => void restore()}><RotateCcw/><div><b>Restaurar backup</b><span>Prepara a restauração e reinicia o aplicativo com segurança.</span></div></button>
      <button className="backup-action" disabled={!!busy} onClick={() => void optimize()}><Wrench/><div><b>Otimizar banco</b><span>Executa PRAGMA optimize e checkpoint do WAL.</span></div></button>
      <button className="backup-action" disabled={!!busy} onClick={() => void diagnostics()}><Download/><div><b>Exportar diagnóstico</b><span>JSON sanitizado, sem API keys, sessões ou conteúdo das mensagens.</span></div></button>
    </div></section>
  </div>;
}

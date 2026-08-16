import { useEffect, useState } from 'react';
import { CheckCircle2, Copy, KeyRound, RefreshCw, ShieldCheck, Trash2, XCircle } from 'lucide-react';
import { toLocalDateTime } from '../lib';

type LicenseStatus = {
  configured: boolean;
  activated: boolean;
  valid: boolean;
  reason?: string;
  fingerprint: string;
  payload?: {
    licenseId: string;
    customerId: string;
    customerName: string;
    plan: string;
    issuedAt: string;
    expiresAt: string | null;
    maxSeats: number;
    maxInstances: number;
    features: string[];
    fingerprint?: string | null;
  };
};

export function LicenseActivationPage() {
  const [status, setStatus] = useState<LicenseStatus | null>(null);
  const [encoded, setEncoded] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  async function reload() {
    try {
      setStatus(await window.attozap.license.status());
      setError('');
    } catch (e: any) {
      setError(e?.message ?? String(e));
    }
  }

  useEffect(() => { void reload(); }, []);

  async function activate() {
    if (!encoded.trim()) { setError('Cole a chave de licença antes de ativar.'); return; }
    setBusy(true); setError(''); setNotice('');
    try {
      const next = await window.attozap.license.activate(encoded.trim());
      setStatus(next);
      setEncoded('');
      setNotice(next.valid ? 'Licença ativada com sucesso nesta máquina.' : `A licença foi salva, mas não é válida: ${next.reason ?? 'INVALID_LICENSE'}.`);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally { setBusy(false); }
  }

  async function deactivate() {
    setBusy(true); setError(''); setNotice('');
    try {
      setStatus(await window.attozap.license.deactivate());
      setNotice('Licença removida desta máquina.');
    } catch (e: any) { setError(e?.message ?? String(e)); }
    finally { setBusy(false); }
  }

  async function copyFingerprint() {
    if (!status?.fingerprint) return;
    setError(''); setNotice('');
    try {
      await window.attozap.clipboard.writeText(status.fingerprint);
      setNotice('Fingerprint copiado para a área de transferência.');
    } catch (e: any) {
      setError(e?.message ?? String(e));
    }
  }

  return <div className="page-stack">
    <div className="page-head">
      <div><span className="kicker">LICENSING</span><h2>Licença do ATTOZAP</h2><p>Ativação local com assinatura Ed25519 e fingerprint opcional.</p></div>
      <button className="button ghost" onClick={() => void reload()}><RefreshCw size={15}/> Validar novamente</button>
    </div>
    {error && <div className="notice error">{error}</div>}
    {notice && <div className="notice info">{notice}</div>}
    {status && !status.configured && <div className="notice info">Este build ainda não contém a chave pública da sua License Authority. Coloque <code>resources/license-public.pem</code> antes de distribuir ou configure <code>ATTOZAP_LICENSE_PUBLIC_KEY</code>.</div>}

    <div className="license-layout">
      <section className="card license-card">
        <div className={`license-seal ${status?.valid ? 'valid' : ''}`}>{status?.valid ? <CheckCircle2 size={29}/> : <KeyRound size={28}/>}</div>
        <span>STATUS LOCAL</span>
        <h3>{status?.valid ? 'Licença ativa' : status?.activated ? 'Licença inválida' : 'Não ativado'}</h3>
        <p>{status?.valid ? `Licenciado para ${status.payload?.customerName}.` : status?.reason ? `Status: ${status.reason}` : 'Insira uma chave de licença emitida pela sua autoridade.'}</p>
        <div className="license-features">
          <span><ShieldCheck size={15}/> Assinatura Ed25519</span>
          <span><ShieldCheck size={15}/> Expiração validada</span>
          <span><ShieldCheck size={15}/> Fingerprint opcional</span>
          <span><ShieldCheck size={15}/> Recursos e contas</span>
        </div>
      </section>

      <section className="card license-panel">
        <div className="card-head"><div><h3>{status?.valid ? 'Detalhes da licença' : 'Ativar licença'}</h3><p>A chave privada nunca fica neste aplicativo.</p></div>{status?.valid ? <CheckCircle2 size={18}/> : <XCircle size={18}/>}</div>
        {status?.valid && status.payload ? <div className="license-details">
          <div><span>Cliente</span><b>{status.payload.customerName}</b></div>
          <div><span>Plano</span><b>{status.payload.plan}</b></div>
          <div><span>Licença</span><code>{status.payload.licenseId}</code></div>
          <div><span>Máx. contas</span><b>{status.payload.maxInstances}</b></div>
          <div><span>Emitida</span><b>{toLocalDateTime(status.payload.issuedAt)}</b></div>
          <div><span>Expira</span><b>{status.payload.expiresAt ? toLocalDateTime(status.payload.expiresAt) : 'Sem expiração'}</b></div>
          <div className="wide"><span>Recursos</span><p>{status.payload.features.length ? status.payload.features.join(' · ') : 'Nenhum recurso restrito'}</p></div>
          <button className="button ghost danger-button wide" disabled={busy} onClick={() => void deactivate()}><Trash2 size={15}/> Desativar nesta máquina</button>
        </div> : <div className="license-activation">
          <div className="field"><label>Chave de licença</label><textarea value={encoded} onChange={e => setEncoded(e.target.value)} placeholder="Cole aqui a licença codificada emitida pelo painel proprietário..."/></div>
          <button className="button primary full" disabled={busy || !encoded.trim() || !status?.configured} onClick={() => void activate()}><KeyRound size={16}/>{busy ? 'Validando...' : 'Ativar licença'}</button>
        </div>}
        <div className="fingerprint-box"><div><span>FINGERPRINT DESTA MÁQUINA</span><code>{status?.fingerprint ?? 'Carregando...'}</code></div><button className="icon-button" title="Copiar fingerprint" disabled={!status?.fingerprint} onClick={() => void copyFingerprint()}><Copy size={14}/></button></div>
      </section>
    </div>
  </div>;
}

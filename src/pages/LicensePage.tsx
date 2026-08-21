import { useEffect, useState } from 'react';
import { CheckCircle2, Copy, FileUp, KeyRound, RefreshCw, ShieldCheck, Trash2, XCircle } from 'lucide-react';
import { toLocalDateTime } from '../lib';

type LicenseStatus = {
  configured: boolean;
  activated: boolean;
  valid: boolean;
  licenseValid: boolean;
  reason?: string;
  fingerprint: string;
  subscription?: {
    required: boolean;
    active: boolean;
    reason?: string;
    renewalId?: string;
    startedAt?: string;
    expiresAt?: string;
    daysRemaining: number | null;
  };
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
    billingMode?: 'perpetual' | 'subscription';
  };
};

export function LicenseActivationPage() {
  const [status, setStatus] = useState<LicenseStatus | null>(null);
  const [encoded, setEncoded] = useState('');
  const [renewalEncoded, setRenewalEncoded] = useState('');
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
      setNotice(next.valid ? (next.subscription?.required ? `Licença ativada e mensalidade inicial liberada por ${next.subscription.daysRemaining ?? 0} dia(s).` : 'Licença ativada com sucesso nesta máquina.') : `A licença foi salva, mas não é válida: ${next.reason ?? 'INVALID_LICENSE'}.`);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally { setBusy(false); }
  }

  async function importLicenseFile() {
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await window.attozap.license.importFile();
      if (result.canceled) return;
      setStatus(result.status);
      setEncoded('');
      setNotice(result.status.valid ? (result.status.subscription?.required ? `Licença importada de ${result.fileName ?? 'arquivo'} e mensalidade inicial liberada por ${result.status.subscription.daysRemaining ?? 0} dia(s).` : `Licença importada de ${result.fileName ?? 'arquivo'} com sucesso nesta máquina.`) : `O arquivo foi salvo, mas a licença não é válida: ${result.status.reason ?? 'INVALID_LICENSE'}.`);
    } catch (e: any) { setError(e?.message ?? String(e)); }
    finally { setBusy(false); }
  }

  async function renew() {
    if (!renewalEncoded.trim()) { setError('Cole a chave de renovação antes de aplicar.'); return; }
    setBusy(true); setError(''); setNotice('');
    try {
      const next = await window.attozap.license.renew(renewalEncoded.trim());
      setStatus(next);
      setRenewalEncoded('');
      setNotice(next.valid ? `Mensalidade renovada por ${next.subscription?.daysRemaining ?? 0} dia(s).` : `A renovação foi processada, mas o estado continua bloqueado: ${next.reason ?? 'SUBSCRIPTION_EXPIRED'}.`);
    } catch (e: any) { setError(e?.message ?? String(e)); }
    finally { setBusy(false); }
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

  const statusTitle = status?.valid ? 'Licença e mensalidade ativas' : status?.licenseValid && status.subscription?.required ? (status.subscription.reason === 'SUBSCRIPTION_REQUIRED' ? 'Aguardando renovação' : 'Mensalidade expirada') : status?.activated ? 'Licença inválida' : 'Não ativado';
  const statusText = status?.valid ? `Licenciado para ${status.payload?.customerName}.` : status?.licenseValid && status.subscription?.required ? 'A licença foi reconhecida, mas as operações ficam bloqueadas até aplicar uma chave de renovação.' : status?.reason ? `Status: ${status.reason}` : 'Insira uma chave de licença emitida pela sua autoridade.';

  return <div className="page-stack">
    <div className="page-head">
      <div><span className="kicker">LICENSING</span><h2>Licença e mensalidade</h2><p>Licença Ed25519 separada da validade mensal controlada por chave de renovação.</p></div>
      <button className="button ghost" onClick={() => void reload()}><RefreshCw size={15}/> Validar novamente</button>
    </div>
    {error && <div className="notice error">{error}</div>}
    {notice && <div className="notice info">{notice}</div>}
    {status && !status.configured && <div className="notice info">Este build ainda não contém a chave pública da sua License Authority. Coloque <code>resources/license-public.pem</code> antes de distribuir ou configure <code>ATTOZAP_LICENSE_PUBLIC_KEY</code>.</div>}

    <div className="license-layout">
      <section className="card license-card">
        <div className={`license-seal ${status?.valid ? 'valid' : ''}`}>{status?.valid ? <CheckCircle2 size={29}/> : <KeyRound size={28}/>}</div>
        <span>STATUS LOCAL</span>
        <h3>{statusTitle}</h3>
        <p>{statusText}</p>
        <div className="license-features">
          <span><ShieldCheck size={15}/> Assinatura Ed25519</span>
          <span><ShieldCheck size={15}/> Validade mensal assinada</span>
          <span><ShieldCheck size={15}/> Fingerprint opcional</span>
          <span><ShieldCheck size={15}/> Recursos e quotas do plano</span>
        </div>
      </section>

      <section className="card license-panel">
        <div className="card-head"><div><h3>{status?.licenseValid ? 'Detalhes da licença' : 'Ativar licença'}</h3><p>A chave privada nunca fica neste aplicativo.</p></div>{status?.valid ? <CheckCircle2 size={18}/> : <XCircle size={18}/>}</div>
        {status?.licenseValid && status.payload ? <div className="license-details">
          <div><span>Cliente</span><b>{status.payload.customerName}</b></div>
          <div><span>Plano</span><b>{status.payload.plan}</b></div>
          <div><span>Licença</span><code>{status.payload.licenseId}</code></div>
          <div><span>Máx. contas</span><b>{status.payload.maxInstances}</b></div>
          <div><span>Emitida</span><b>{toLocalDateTime(status.payload.issuedAt)}</b></div>
          <div><span>Expira</span><b>{status.payload.expiresAt ? toLocalDateTime(status.payload.expiresAt) : 'Sem expiração'}</b></div>
          <div><span>Modalidade</span><b>{status.payload.billingMode === 'subscription' ? 'Mensal' : 'Perpétua'}</b></div>
          {status.subscription?.required && <>
            <div><span>Mensalidade</span><b className={status.subscription.active ? 'subscription-active' : 'subscription-expired'}>{status.subscription.active ? `${status.subscription.daysRemaining} dia(s) restante(s)` : status.subscription.reason === 'SUBSCRIPTION_REQUIRED' ? 'Renovação necessária' : 'Expirada'}</b></div>
            <div><span>Válida até</span><b>{status.subscription.expiresAt ? toLocalDateTime(status.subscription.expiresAt) : 'Ainda não renovada'}</b></div>
          </>}
          <div className="wide"><span>Recursos</span><p>{status.payload.features.length ? status.payload.features.join(' · ') : 'Nenhum recurso restrito'}</p></div>
          {status.subscription?.required && <div className="wide renewal-box">
            <div className="card-head"><div><h3>Renovar mensalidade</h3><p>Esta chave é diferente da licença e pode acrescentar dias ao período atual.</p></div><RefreshCw size={17}/></div>
            <textarea value={renewalEncoded} onChange={e => setRenewalEncoded(e.target.value)} placeholder="Cole aqui somente o token codificado gerado em “Emitir chave de renovação” no KeyGen. Não cole a licença principal."/>
            <button className="button primary full" disabled={busy || !renewalEncoded.trim()} onClick={() => void renew()}><RefreshCw size={16}/>{busy ? 'Aplicando...' : 'Aplicar chave de renovação'}</button>
          </div>}
          <button className="button ghost danger-button wide" disabled={busy} onClick={() => void deactivate()}><Trash2 size={15}/> Desativar nesta máquina</button>
        </div> : <div className="license-activation">
          <button className="button ghost full" disabled={busy || !status?.configured} onClick={() => void importLicenseFile()}><FileUp size={16}/> Importar licença (.txt ou .pem)</button>
          <p className="field-help">Aceita apenas um ficheiro de licença emitido pelo Keygen. A chave privada Ed25519 é recusada e nunca deve ser copiada para o aplicativo.</p>
          <div className="field"><label>Chave de licença</label><textarea value={encoded} onChange={e => setEncoded(e.target.value)} placeholder="Cole aqui a licença codificada emitida pelo painel proprietário..."/></div>
          <button className="button primary full" disabled={busy || !encoded.trim() || !status?.configured} onClick={() => void activate()}><KeyRound size={16}/>{busy ? 'Validando...' : 'Ativar licença'}</button>
        </div>}
        <div className="fingerprint-box"><div><span>FINGERPRINT DESTA MÁQUINA</span><code>{status?.fingerprint ?? 'Carregando...'}</code></div><button className="icon-button" title="Copiar fingerprint" disabled={!status?.fingerprint} onClick={() => void copyFingerprint()}><Copy size={14}/></button></div>
      </section>
    </div>
  </div>;
}

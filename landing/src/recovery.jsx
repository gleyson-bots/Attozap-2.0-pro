import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ArrowLeft, CheckCircle2, ChevronRight, KeyRound, LockKeyhole, Mail, RefreshCw, ShieldCheck } from 'lucide-react';

async function api(body) {
  const response = await fetch('/api/password-reset', {
    method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Erro ${response.status}`);
  return data;
}

function Brand() {
  return <a className="portal-brand" href="/"><span className="portal-brand-orb"><img src="/logo.svg" alt="ATTOZAP"/></span><span><b>ATTOZAP</b><small>CLIENT PORTAL</small></span></a>;
}

function RequestReset() {
  const [email,setEmail] = useState('');
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  const [done,setDone] = useState('');
  async function submit(event) {
    event.preventDefault(); setBusy(true); setError(''); setDone('');
    try {
      const recaptchaToken = window.__attozapGetRecaptchaToken?.() || '';
      const result = await api({ action:'request', email, recaptchaToken });
      setDone(result.message || 'Se existir uma conta com este e-mail, enviaremos as instruções.');
      window.__attozapResetRecaptcha?.();
    } catch (e) { setError(e.message); window.__attozapResetRecaptcha?.(); }
    finally { setBusy(false); }
  }
  return <RecoveryLayout title="Recupere sua senha" subtitle="Enviaremos um link seguro com validade de 30 minutos para o e-mail da sua conta.">
    {done ? <div className="recovery-success"><CheckCircle2/><h2>Confira seu e-mail</h2><p>{done}</p><a className="portal-button primary wide" href="/login">Voltar ao login</a></div> : <form className="recovery-form" onSubmit={submit}>
      {error && <div className="portal-notice error"><span>{error}</span></div>}
      <label><span>E-mail da conta</span><div className="recovery-input"><Mail/><input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="voce@empresa.com" required autoComplete="email"/></div></label>
      <div data-recovery-recaptcha></div>
      <button className="portal-button primary wide" disabled={busy}>{busy ? <RefreshCw className="spin"/> : <ChevronRight/>}{busy ? 'Enviando…' : 'Enviar link de redefinição'}</button>
      <a className="recovery-back" href="/login"><ArrowLeft/> Voltar ao login</a>
    </form>}
  </RecoveryLayout>;
}

function ResetPassword() {
  const token = new URLSearchParams(location.search).get('token') || '';
  const [password,setPassword] = useState('');
  const [confirmPassword,setConfirmPassword] = useState('');
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState(token ? '' : 'Link de redefinição inválido.');
  const [done,setDone] = useState(false);
  async function submit(event) {
    event.preventDefault(); setError('');
    if (password.length < 8) { setError('A senha deve ter pelo menos 8 caracteres.'); return; }
    if (password !== confirmPassword) { setError('As senhas não conferem.'); return; }
    setBusy(true);
    try { await api({ action:'reset', token, password }); setDone(true); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  return <RecoveryLayout title="Crie uma nova senha" subtitle="Escolha uma senha forte para proteger sua conta ATTOZAP.">
    {done ? <div className="recovery-success"><CheckCircle2/><h2>Senha atualizada</h2><p>Você já pode entrar usando a nova senha.</p><a className="portal-button primary wide" href="/login">Entrar no portal</a></div> : <form className="recovery-form" onSubmit={submit}>
      {error && <div className="portal-notice error"><span>{error}</span></div>}
      <label><span>Nova senha</span><div className="recovery-input"><LockKeyhole/><input type="password" minLength={8} value={password} onChange={e=>setPassword(e.target.value)} required autoComplete="new-password" placeholder="Mínimo 8 caracteres"/></div></label>
      <label><span>Confirmar senha</span><div className="recovery-input"><KeyRound/><input type="password" minLength={8} value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)} required autoComplete="new-password" placeholder="Repita a nova senha"/></div></label>
      <button className="portal-button primary wide" disabled={busy || !token}>{busy ? <RefreshCw className="spin"/> : <ShieldCheck/>}{busy ? 'Salvando…' : 'Salvar nova senha'}</button>
    </form>}
  </RecoveryLayout>;
}

function RecoveryLayout({ title, subtitle, children }) {
  return <div className="auth-page recovery-page"><div className="auth-ambient one"/><div className="auth-ambient two"/>
    <header className="auth-top"><Brand/><a href="/"><ArrowLeft size={15}/> Voltar à landing</a></header>
    <main className="recovery-layout"><section className="recovery-card"><div className="recovery-icon"><ShieldCheck/></div><small>SEGURANÇA DA CONTA</small><h1>{title}</h1><p>{subtitle}</p>{children}</section></main>
  </div>;
}

const route = location.pathname.replace(/\.html$/i,'').replace(/\/+$/,'') || '/';
createRoot(document.getElementById('root')).render(route === '/reset-password' ? <ResetPassword/> : <RequestReset/>);

import { useEffect, useState } from 'react';
import { ArrowRight, CheckCircle2, Copy, KeyRound, MessageCircle, ShieldCheck, Sparkles, Wifi } from 'lucide-react';
import attoLogo from '../assets/attozap-logo.svg';

type Props = { onReady: () => void };

export function StartupGate({ onReady }: Props) {
  const [stage, setStage] = useState<'loading'|'license'|'tutorial'>('loading');
  const [status, setStatus] = useState<any>(null);
  const [key, setKey] = useState('');
  const [error, setError] = useState('');
  const [step, setStep] = useState(0);

  async function check() {
    const license = await window.attozap.license.status();
    setStatus(license);
    if (!license.valid) { setStage('license'); return; }
    const completed = await window.attozap.settings.get('onboarding_completed');
    if (completed === 'true') onReady(); else setStage('tutorial');
  }
  useEffect(() => { void check().catch(e => { setError(e?.message ?? String(e)); setStage('license'); }); }, []);

  async function activate() {
    if (!key.trim()) return;
    try {
      const next = await window.attozap.license.activate(key.trim());
      setStatus(next);
      if (!next.valid) { setError(next.reason || 'Licença inválida'); return; }
      setError(''); setKey(''); setStage('tutorial');
    } catch (e: any) { setError(e?.message ?? String(e)); }
  }
  async function finish() { await window.attozap.settings.set('onboarding_completed', 'true'); onReady(); }

  if (stage === 'loading') return <div className="startup-gate"><img src={attoLogo}/><b>ATTOZAP</b><span>Validando licença...</span></div>;

  if (stage === 'license') return <div className="license-gate"><div className="license-gate-card"><img className="license-gate-logo" src={attoLogo}/><span className="kicker">ATTOZAP WASENDER PRO</span><h1>Ative sua licença para começar</h1><p>O aplicativo só libera as ferramentas depois de validar a chave desta máquina.</p>{error && <div className="notice error">{error}</div>}<div className="fingerprint-box"><div><span>FINGERPRINT</span><code>{status?.fingerprint || 'Carregando...'}</code></div><button className="icon-button" onClick={() => status?.fingerprint && void window.attozap.clipboard.writeText(status.fingerprint)}><Copy size={15}/></button></div><div className="field"><label>Chave de licença</label><textarea value={key} onChange={e => setKey(e.target.value)} placeholder="Cole aqui a chave emitida pelo KeyGen..."/></div><button className="button primary big full" disabled={!key.trim() || !status?.configured} onClick={() => void activate()}><KeyRound size={17}/> Ativar e continuar</button><div className="license-gate-trust"><span><ShieldCheck size={14}/> Ed25519</span><span><ShieldCheck size={14}/> Fingerprint</span><span><ShieldCheck size={14}/> Limites do plano</span></div></div></div>;

  const slides = [
    { icon: Wifi, title: '1. Conecte seu WhatsApp', text: 'Crie uma conta, escaneie o QR e aguarde o status conectado. As sessões ficam persistentes no computador.' },
    { icon: MessageCircle, title: '2. Use o WebChat', text: 'Converse por JID/LID, envie mídia e visualize fotos, nomes e histórico local das conversas.' },
    { icon: Sparkles, title: '3. Sender, grupos e ferramentas', text: 'Importe contatos, valide números, use grupos, templates, extratores e agendamentos. Teste sempre com poucos destinatários primeiro.' },
    { icon: ShieldCheck, title: '4. Aquecimento e automações', text: 'Use somente contas próprias, grupos próprios ou contatos consentidos. O ATTOZAP aplica limites e registra as ações.' },
  ];
  const slide = slides[step]; const Icon = slide.icon;
  return <div className="onboarding-gate"><div className="onboarding-card"><div className="onboarding-brand"><img src={attoLogo}/><div><b>ATTOZAP</b><span>PRIMEIROS PASSOS</span></div></div><div className="onboarding-icon"><Icon size={32}/></div><h1>{slide.title}</h1><p>{slide.text}</p><div className="onboarding-dots">{slides.map((_, i) => <i key={i} className={i === step ? 'active' : ''}/>)}</div><div className="head-actions"><button className="button ghost" onClick={() => void finish()}>Pular tutorial</button>{step < slides.length - 1 ? <button className="button primary" onClick={() => setStep(v => v + 1)}>Próximo <ArrowRight size={15}/></button> : <button className="button primary" onClick={() => void finish()}><CheckCircle2 size={15}/> Entrar no ATTOZAP</button>}</div></div></div>;
}

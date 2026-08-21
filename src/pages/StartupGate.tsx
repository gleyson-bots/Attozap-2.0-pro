import { useEffect, useState } from 'react';
import { ArrowRight, BookOpen, CheckCircle2, Clipboard, Copy, ExternalLink, KeyRound, LifeBuoy, Mail, MessageCircle, RefreshCw, ShieldAlert, ShieldCheck, Sparkles, Wifi } from 'lucide-react';
import attoLogo from '../assets/attozap-logo.svg';

type Props = { onReady: () => void };

export function StartupGate({ onReady }: Props) {
  const [stage, setStage] = useState<'loading'|'license'|'tutorial'>('loading');
  const [status, setStatus] = useState<any>(null);
  const [key, setKey] = useState('');
  const [renewalKey, setRenewalKey] = useState('');
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
      if (!next.valid) { setError(next.reason || 'A licença foi ativada, mas o período inicial não pôde ser confirmado. Reimporte a licença ou contacte o suporte.'); return; }
      setError(''); setKey(''); setStage('tutorial');
    } catch (e: any) { setError(e?.message ?? String(e)); }
  }
  async function renew() {
    if (!renewalKey.trim()) return;
    try {
      const next = await window.attozap.license.renew(renewalKey.trim());
      setStatus(next);
      if (!next.valid) { setError(next.reason || 'A chave de renovação não ativou a mensalidade.'); return; }
      setError(''); setRenewalKey(''); setStage('tutorial');
    } catch (e: any) { setError(e?.message ?? String(e)); }
  }
  async function finish() { await window.attozap.settings.set('onboarding_completed', 'true'); onReady(); }

  if (stage === 'loading') return <div className="startup-gate"><img src={attoLogo}/><b>ATTOZAP</b><span>Validando licença...</span></div>;

  if (stage === 'license') {
    const renewalRequired = Boolean(status?.licenseValid && status?.subscription?.required && !status?.valid);
    return <div className="license-gate"><div className="license-gate-card"><img className="license-gate-logo" src={attoLogo}/><span className="kicker">ATTOZAP WASENDER PRO</span><h1>{renewalRequired ? 'Renove sua mensalidade para continuar' : 'Ative sua licença para começar'}</h1><p>{renewalRequired ? 'A licença desta máquina continua reconhecida, mas o período mensal terminou. Cole uma chave de renovação válida para desbloquear o aplicativo.' : 'A primeira ativação de uma licença mensal já inicia o período contratado. O aplicativo só libera as ferramentas depois de validar a chave desta máquina.'}</p>{error && <div className="notice error">{error}</div>}<div className="fingerprint-box"><div><span>FINGERPRINT</span><code>{status?.fingerprint || 'Carregando...'}</code></div><button className="icon-button" onClick={() => status?.fingerprint && void window.attozap.clipboard.writeText(status.fingerprint)}><Copy size={15}/></button></div>{renewalRequired ? <><div className="field"><label>Chave de renovação mensal</label><textarea value={renewalKey} onChange={e => setRenewalKey(e.target.value)} placeholder="Cole aqui a chave de renovação emitida pelo KeyGen..."/></div><button className="button primary big full" disabled={!renewalKey.trim()} onClick={() => void renew()}><RefreshCw size={17}/> Renovar e continuar</button></> : <><div className="field"><label>Chave de licença</label><textarea value={key} onChange={e => setKey(e.target.value)} placeholder="Cole aqui a chave emitida pelo KeyGen..."/></div><button className="button primary big full" disabled={!key.trim() || !status?.configured} onClick={() => void activate()}><KeyRound size={17}/> Ativar e continuar</button></>}<div className="license-gate-trust"><span><ShieldCheck size={14}/> Ed25519</span><span><ShieldCheck size={14}/> Fingerprint</span><span><ShieldCheck size={14}/> Controle mensal</span></div></div></div>;
  }

  const slides = [
    { icon: Wifi, title: '1. Conecte a sua conta WhatsApp', text: 'Comece por criar uma conta local, ler o QR Code e aguardar até o estado ficar Conectado. Não feche o app durante a sincronização inicial.', details: [['Conta local', 'Cada sessão fica guardada neste computador e pode ser gerida em Contas.'], ['QR Code', 'Use o WhatsApp no telemóvel em Dispositivos conectados para ler o código.'], ['Confirmação', 'Só avance para envios depois de ver o estado Conectado e o número da conta.'], ['Segurança', 'Não partilhe QR Codes, sessões ou ficheiros de backup com terceiros.']] },
    { icon: MessageCircle, title: '2. Faça o primeiro teste no WebChat', text: 'O WebChat é o melhor lugar para validar a sessão antes de usar campanhas ou aquecimento. Comece com uma conversa autorizada.', details: [['Destino', 'Use número, PN, JID ou LID conforme a identidade apresentada pelo WhatsApp.'], ['Mensagem', 'Envie primeiro um texto curto e confirme o estado pendente, enviado ou falhado.'], ['Mídia', 'Teste imagem, documento, áudio ou figurinha com um ficheiro que ainda exista.'], ['Diagnóstico', 'Abra o Delivery Center para ver o JID efetivo e o código remoto devolvido.']] },
    { icon: BookOpen, title: '3. Organize contactos e campanhas', text: 'Prepare listas, templates e campanhas em pequenos lotes. O envio local fica mais previsível quando a origem e o consentimento estão claros.', details: [['Contactos', 'Importe CSV/TXT, reveja duplicados e bloqueie números que não devem receber mensagens.'], ['Templates', 'Use variáveis e anexos revistos antes de iniciar uma campanha.'], ['Teste', 'Faça uma campanha pequena e verifique a entrega antes de aumentar o volume.'], ['Retoma', 'Campanhas pausadas podem ser retomadas sem perder o histórico persistido.']] },
    { icon: ShieldCheck, title: '4. Aqueça com simulação primeiro', text: 'Use a simulação para validar turnos, cadência, biblioteca de mídia e circuit breaker sem abrir socket, enviar presença ou consultar IA externa.', details: [['Simulação', 'O perfil simulado grava os turnos como prévia offline e nunca os apresenta como entrega real.'], ['Cadência', 'Confira horários, atrasos e quantidade de turnos antes de liberar o envio real.'], ['Circuit breaker', 'Defina limite de falhas e cooldown para impedir retries agressivos.'], ['Boas práticas', 'Utilize apenas contas próprias, contactos consentidos e volumes compatíveis com a operação.']] },
    { icon: ShieldAlert, title: '5. Entenda falhas e o código 463', text: 'Uma falha remota não é o mesmo que um erro da interface. O código 463 pode indicar restrição temporária de alcance do WhatsApp.', details: [['Não insista', 'Pare retries manuais quando aparecer 463, reach-out ou time-lock.'], ['JID efetivo', 'Compare o destino digitado com o PN/LID usado pelo transporte.'], ['Prazo', 'Consulte o aviso de restrição e aguarde o cooldown informado pelo servidor.'], ['Suporte', 'Envie a captura, código, horário, conta e destinatário para acelerar a análise.']] },
    { icon: Sparkles, title: '6. Explore e peça ajuda quando precisar', text: 'Depois do primeiro teste, explore automações, grupos, templates, Chat IA e Delivery Center. O suporte está sempre disponível na navegação do app.', details: [['Backup', 'Use Health Center para manter uma cópia local das configurações e dados importantes.'], ['Histórico', 'O Delivery Center concentra WebChat, campanhas e aquecimento numa visão técnica.'], ['Chat IA', 'Configure as chaves apenas no armazenamento protegido e revise cada resposta antes de usar.'], ['Suporte', 'Fale com GleysonDevs por WhatsApp ou e-mail e inclua o diagnóstico técnico.']] },
  ];
  const slide = slides[step]; const Icon = slide.icon;
  return <div className="onboarding-gate"><div className="onboarding-card"><div className="onboarding-brand"><img src={attoLogo} alt="ATTOZAP"/><div><b>ATTOZAP</b><span>PRIMEIROS PASSOS</span></div></div><div className="onboarding-progress"><span>Configuração guiada</span><strong>Etapa {step + 1} de {slides.length}</strong></div><div className="onboarding-layout"><main className="onboarding-main"><div className="onboarding-icon"><Icon size={32}/></div><h1>{slide.title}</h1><p>{slide.text}</p><div className="onboarding-details">{slide.details.map(([title, description]) => <div className="onboarding-detail" key={title}><b>{title}</b><span>{description}</span></div>)}</div><div className="onboarding-tip"><ShieldAlert size={14}/><span>O ATTOZAP é um aplicativo local. Faça testes graduais e não repita automaticamente um envio que tenha sido rejeitado pelo WhatsApp.</span></div><div className="onboarding-dots">{slides.map((_, i) => <i key={i} className={i === step ? 'active' : ''}/>)}</div><div className="head-actions"><button className="button ghost" onClick={() => void finish()}>Pular tutorial</button>{step < slides.length - 1 ? <button className="button primary" onClick={() => setStep(v => v + 1)}>Próximo <ArrowRight size={15}/></button> : <button className="button primary" onClick={() => void finish()}><CheckCircle2 size={15}/> Entrar no ATTOZAP</button>}</div></main><aside className="onboarding-side"><LifeBuoy size={21} className="onboarding-side-icon"/><h3>Suporte GleysonDevs</h3><p>Se algo não funcionar, envie a captura do erro e a informação apresentada no Delivery Center.</p><div className="onboarding-contact"><button className="button primary" onClick={() => void window.attozap.app.openExternal('https://wa.me/5511936216745?text=Ol%C3%A1%2C%20preciso%20de%20suporte%20no%20ATTOZAP.')}><MessageCircle size={14}/> WhatsApp</button><button className="button ghost" onClick={() => void window.attozap.app.openExternal('mailto:gleysonferreira531@gmail.com?subject=Suporte%20ATTOZAP')}><Mail size={14}/> E-mail</button><button className="button ghost" onClick={() => void window.attozap.clipboard.writeText('gleysonferreira531@gmail.com')}><Clipboard size={14}/> Copiar e-mail</button></div><strong>+55 11 93621-6745</strong><small>gleysonferreira531@gmail.com</small><button className="onboarding-help-link" onClick={() => void window.attozap.app.openExternal('mailto:gleysonferreira531@gmail.com?subject=Suporte%20ATTOZAP')}><ExternalLink size={12}/> Abrir pedido de suporte</button></aside></div></div></div>;
}

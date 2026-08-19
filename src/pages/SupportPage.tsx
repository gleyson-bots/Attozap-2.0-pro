import { BookOpen, CheckCircle2, Clipboard, ExternalLink, LifeBuoy, Mail, MessageCircle, ShieldCheck, Smartphone, Wrench } from 'lucide-react';

const SUPPORT_EMAIL = 'gleysonferreira531@gmail.com';
const SUPPORT_PHONE = '+55 11 93621-6745';
const SUPPORT_PHONE_RAW = '5511936216745';
const WHATSAPP_URL = `https://wa.me/${SUPPORT_PHONE_RAW}?text=${encodeURIComponent('Olá, preciso de suporte no ATTOZAP.')}`;

async function copy(value: string) {
  await window.attozap.clipboard.writeText(value);
}

function openExternal(url: string) {
  void window.attozap.app.openExternal(url);
}

export function SupportPage() {
  return <div className="page-stack support-page">
    <section className="page-head support-hero">
      <div>
        <span className="kicker">CENTRAL DE AJUDA</span>
        <h2>Suporte GleysonDevs</h2>
        <p>Encontre orientações rápidas para configurar a sua sessão, testar o WebChat e diagnosticar envios sem perder o histórico local.</p>
      </div>
      <div className="support-hero-icon"><LifeBuoy size={32}/></div>
    </section>

    <section className="support-contact-grid">
      <article className="card support-contact-card support-contact-primary">
        <div className="support-contact-icon whatsapp"><MessageCircle size={21}/></div>
        <div className="support-contact-copy"><span>Atendimento direto</span><h3>WhatsApp</h3><strong>{SUPPORT_PHONE}</strong><small>Use este canal para enviar capturas de tela, código do erro e o horário aproximado do ocorrido.</small></div>
        <button className="button primary" onClick={() => openExternal(WHATSAPP_URL)}><MessageCircle size={15}/> Abrir conversa <ExternalLink size={13}/></button>
      </article>
      <article className="card support-contact-card">
        <div className="support-contact-icon email"><Mail size={21}/></div>
        <div className="support-contact-copy"><span>Atendimento por escrito</span><h3>E-mail</h3><strong>{SUPPORT_EMAIL}</strong><small>Inclua a versão do ATTOZAP, a conta afetada e os passos necessários para reproduzir o problema.</small></div>
        <div className="support-contact-actions"><button className="button ghost" onClick={() => openExternal(`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Suporte ATTOZAP')}`)}><Mail size={15}/> Enviar e-mail</button><button className="icon-button" title="Copiar e-mail" onClick={() => void copy(SUPPORT_EMAIL)}><Clipboard size={15}/></button></div>
      </article>
    </section>

    <section className="support-content-grid">
      <article className="card support-checklist-card">
        <div className="card-head"><div><h3>Antes de pedir ajuda</h3><p>Estas informações aceleram o diagnóstico.</p></div><ShieldCheck size={18}/></div>
        <div className="support-checklist">
          <div><CheckCircle2 size={16}/><span>Confirme se a conta aparece como <b>Conectada</b> em Contas.</span></div>
          <div><CheckCircle2 size={16}/><span>Copie o código técnico exibido no balão ou no Delivery Center.</span></div>
          <div><CheckCircle2 size={16}/><span>Registe o destinatário, o JID usado e a hora aproximada do envio.</span></div>
          <div><CheckCircle2 size={16}/><span>Para o aquecimento, informe o perfil, o turno, a mídia e se era simulação.</span></div>
          <div><CheckCircle2 size={16}/><span>Não repita muitas vezes um envio que devolva erro 463 ou reach-out.</span></div>
        </div>
      </article>
      <article className="card support-guide-card">
        <div className="card-head"><div><h3>Fluxo recomendado</h3><p>Use esta sequência para configurar o app com segurança.</p></div><BookOpen size={18}/></div>
        <div className="support-guide-list">
          <div><span>01</span><div><b>Conecte a conta</b><small>Crie o perfil, leia o QR e aguarde a sincronização terminar.</small></div></div>
          <div><span>02</span><div><b>Teste o WebChat</b><small>Comece por uma conversa autorizada e valide texto, mídia e estados.</small></div></div>
          <div><span>03</span><div><b>Simule o aquecimento</b><small>Ative Simulação para verificar cadência e biblioteca sem envio real.</small></div></div>
          <div><span>04</span><div><b>Libere operação real</b><small>Use o Delivery Center para acompanhar JID, status, falhas e retries.</small></div></div>
        </div>
      </article>
    </section>

    <section className="card support-diagnostics-card">
      <div className="card-head"><div><h3>Diagnóstico rápido</h3><p>Atalhos para os problemas mais comuns do app local.</p></div><Wrench size={18}/></div>
      <div className="support-diagnostic-grid">
        <div><Smartphone size={16}/><b>QR ou sessão desconectada</b><span>Abra Contas, confira a sessão e refaça a conexão se o estado não mudar.</span></div>
        <div><MessageCircle size={16}/><b>Mensagem recusada com 463</b><span>Consulte o Delivery Center e o painel de restrição. Aguarde o cooldown e evite retries.</span></div>
        <div><Wrench size={16}/><b>Mídia não enviada</b><span>Confirme que o ficheiro ainda existe na biblioteca e teste primeiro no modo simulação.</span></div>
      </div>
    </section>

    <div className="support-footer-note"><LifeBuoy size={15}/><span>Atendimento: <b>GleysonDevs</b> · {SUPPORT_EMAIL} · {SUPPORT_PHONE}</span></div>
  </div>;
}

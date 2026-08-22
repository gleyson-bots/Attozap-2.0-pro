import { Resend } from 'resend';

function client() {
  if (!process.env.RESEND_API_KEY) return null;
  return new Resend(process.env.RESEND_API_KEY);
}

const FROM = process.env.RESEND_FROM || 'ATTOZAP <portal@orbitalcode.shop>';
const APP_URL = String(process.env.APP_URL || '').replace(/\/$/, '') || 'https://attozap.orbitalcode.shop';
const PURPLE = '#785cff';
const BLUE = '#438cff';

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;' }[char]));
}

function shell({ eyebrow, title, intro, ctaLabel, ctaUrl, body, footer }) {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta http-equiv="X-UA-Compatible" content="IE=edge"></head>
  <body style="margin:0;background-color:#070910;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#070910" style="width:100%;background-color:#070910;"><tr><td align="center" style="padding-top:36px;padding-right:18px;padding-bottom:36px;padding-left:18px;">
    <table width="600" cellpadding="0" cellspacing="0" border="0" bgcolor="#10131d" style="width:100%;max-width:600px;background-color:#10131d;border:1px solid #252a3b;border-radius:20px;overflow:hidden;">
      <tr><td bgcolor="#0d1019" style="padding-top:26px;padding-right:32px;padding-bottom:22px;padding-left:32px;background-color:#0d1019;border-bottom:1px solid #252a3b;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="font-family:Arial,Helvetica,sans-serif;font-size:22px;line-height:28px;color:#f7fbff;font-weight:700;letter-spacing:0.5px;">ATTO<span style="color:${PURPLE};">ZAP</span></td><td align="right" style="font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:16px;color:#7f8da3;letter-spacing:1.4px;">CLIENT PORTAL</td></tr></table>
      </td></tr>
      <tr><td style="padding-top:34px;padding-right:32px;padding-bottom:34px;padding-left:32px;">
        <p style="margin-top:0;margin-right:0;margin-bottom:10px;margin-left:0;font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:16px;color:${BLUE};font-weight:700;letter-spacing:1.4px;text-transform:uppercase;">${escapeHtml(eyebrow)}</p>
        <h1 style="margin-top:0;margin-right:0;margin-bottom:16px;margin-left:0;font-family:Arial,Helvetica,sans-serif;font-size:28px;line-height:36px;color:#f7fbff;font-weight:700;">${escapeHtml(title)}</h1>
        <p style="margin-top:0;margin-right:0;margin-bottom:24px;margin-left:0;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:24px;color:#aeb9c9;">${intro}</p>
        ${body || ''}
        ${ctaLabel && ctaUrl ? `<table cellpadding="0" cellspacing="0" border="0" style="margin-top:28px;"><tr><td bgcolor="${PURPLE}" style="background-color:${PURPLE};border-radius:10px;"><a href="${escapeHtml(ctaUrl)}" style="display:inline-block;padding-top:13px;padding-right:20px;padding-bottom:13px;padding-left:20px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:18px;color:#ffffff;text-decoration:none;font-weight:700;">${escapeHtml(ctaLabel)}</a></td></tr></table>` : ''}
      </td></tr>
      <tr><td bgcolor="#0b0e16" style="padding-top:18px;padding-right:32px;padding-bottom:18px;padding-left:32px;background-color:#0b0e16;border-top:1px solid #252a3b;font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:18px;color:#68758a;">${footer || 'ATTO FLOW BY GLEYSONDEVS · Mensagem transacional do portal ATTOZAP.'}</td></tr>
    </table>
  </td></tr></table></body></html>`;
}

async function send(to, subject, html) {
  const resend = client();
  if (!resend) {
    console.warn('[resend] RESEND_API_KEY ausente; e-mail não enviado:', subject, to);
    return { skipped: true };
  }
  if (!to) throw new Error('Destinatário de e-mail não informado');
  return resend.emails.send({ from: FROM, to, subject, html, replyTo: process.env.RESEND_REPLY_TO || undefined });
}

export async function sendWelcome(user) {
  return send(user.email, 'Bem-vindo ao ATTOZAP', shell({
    eyebrow: 'Conta criada',
    title: `Bem-vindo, ${user.name}.`,
    intro: 'Seu portal ATTOZAP está pronto. Por ele você acompanha plano, cobrança, licenças, indicações e novas versões do WASender Pro.',
    ctaLabel: 'Abrir meu portal', ctaUrl: `${APP_URL}/portal`,
  }));
}

export async function sendPasswordReset(user, token) {
  const link = `${APP_URL}/reset-password?token=${encodeURIComponent(token)}`;
  const body = `<table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#0b0e16" style="width:100%;background-color:#0b0e16;border:1px solid #252a3b;border-radius:12px;"><tr><td style="padding-top:16px;padding-right:18px;padding-bottom:16px;padding-left:18px;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:21px;color:#aeb9c9;">Este link expira em <strong style="color:#f7fbff;">30 minutos</strong> e só pode ser usado uma vez. Se você não solicitou a redefinição, ignore este e-mail.</td></tr></table>`;
  return send(user.email, 'Redefina sua senha do ATTOZAP', shell({
    eyebrow: 'Segurança da conta', title: 'Redefina sua senha.',
    intro: `Olá, ${escapeHtml(user.name)}. Recebemos uma solicitação para trocar a senha da sua conta ATTOZAP.`, body,
    ctaLabel: 'Criar nova senha', ctaUrl: link,
    footer: 'ATTOZAP · Link de segurança com uso único e expiração automática.',
  }));
}

export async function sendPasswordChanged(user) {
  return send(user.email, 'Sua senha do ATTOZAP foi alterada', shell({
    eyebrow: 'Segurança confirmada', title: 'Senha alterada com sucesso.',
    intro: 'A senha da sua conta foi atualizada. Se você não realizou essa alteração, entre em contato com o suporte imediatamente.',
    ctaLabel: 'Entrar no portal', ctaUrl: `${APP_URL}/login`,
  }));
}

export async function sendReferralReward(user, amountCents) {
  const value = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(amountCents || 0) / 100);
  return send(user.email, `Você ganhou ${value} no Indique e Ganhe ATTOZAP`, shell({
    eyebrow: 'Indique e Ganhe', title: 'Sua indicação virou recompensa.',
    intro: `Uma pessoa indicada por você realizou o primeiro pagamento aprovado. Sua recompensa de ${escapeHtml(value)} já aparece na área de membros.`,
    ctaLabel: 'Ver minhas indicações', ctaUrl: `${APP_URL}/membros`,
  }));
}

export async function sendLicenseIssued(user, plan, license) {
  const short = String(license.license_key || '').slice(0, 34);
  const body = `<table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#0b0e16" style="width:100%;background-color:#0b0e16;border:1px solid #252a3b;border-radius:12px;"><tr><td style="padding-top:16px;padding-right:18px;padding-bottom:16px;padding-left:18px;"><p style="margin-top:0;margin-right:0;margin-bottom:6px;margin-left:0;font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:16px;color:#7f8da3;">PLANO</p><p style="margin-top:0;margin-right:0;margin-bottom:14px;margin-left:0;font-family:Arial,Helvetica,sans-serif;font-size:17px;line-height:22px;color:#f7fbff;font-weight:700;">${escapeHtml(plan.name)}</p><p style="margin-top:0;margin-right:0;margin-bottom:6px;margin-left:0;font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:16px;color:#7f8da3;">LICENÇA</p><p style="margin-top:0;margin-right:0;margin-bottom:0;margin-left:0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:18px;color:${BLUE};">${escapeHtml(short)}…</p></td></tr></table>`;
  return send(user.email, `Sua licença ATTOZAP ${plan.name} está pronta`, shell({
    eyebrow: 'Licença emitida', title: 'Sua ativação está pronta.',
    intro: 'A chave completa fica protegida no seu portal. Copie por lá e cole no ATTOZAP WASender Pro.', body,
    ctaLabel: 'Ver minha licença', ctaUrl: `${APP_URL}/portal`,
  }));
}

export async function sendReleaseNotice(user, release) {
  const body = `<table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:21px;color:#aeb9c9;"><strong style="font-size:13px;line-height:21px;color:#f7fbff;">${escapeHtml(release.version)}</strong><br>${escapeHtml(release.notes || 'Nova versão disponível para download.')}</td></tr></table>`;
  return send(user.email, `ATTOZAP ${release.version} disponível`, shell({
    eyebrow: release.mandatory ? 'Atualização importante' : 'Nova versão',
    title: `${release.version} já está disponível.`,
    intro: 'Acompanhe as novidades e baixe a versão publicada pelo painel administrativo.', body,
    ctaLabel: 'Ver atualização', ctaUrl: `${APP_URL}/atualizacoes`,
  }));
}

export async function sendPlanActivated(user, plan) {
  return send(user.email, `Plano ${plan.name} ativado no ATTOZAP`, shell({
    eyebrow: 'Plano ativo', title: `Seu plano ${plan.name} foi ativado.`,
    intro: 'A assinatura foi reconhecida e o portal já está sincronizando seus limites e sua licença.',
    ctaLabel: 'Gerenciar meu plano', ctaUrl: `${APP_URL}/portal`,
  }));
}

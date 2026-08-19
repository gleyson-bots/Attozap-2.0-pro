import {
  isLidUser,
  isPnUser,
  jidNormalizedUser,
} from '@whiskeysockets/baileys';

export type WhatsAppIdentity = {
  jid: string;
  lid?: string;
  pnJid?: string;
  phone?: string;
  kind: 'lid' | 'pn' | 'group' | 'newsletter' | 'broadcast' | 'other';
};

export function normalizeJid(value?: string | null) {
  if (!value) return undefined;
  try { return jidNormalizedUser(value); }
  catch { return value.trim() || undefined; }
}

export function jidKind(value?: string | null): WhatsAppIdentity['kind'] {
  const jid = normalizeJid(value);
  if (!jid) return 'other';
  if (jid.endsWith('@g.us')) return 'group';
  if (jid.endsWith('@newsletter')) return 'newsletter';
  if (jid.endsWith('@broadcast')) return 'broadcast';
  if (isLidUser(jid)) return 'lid';
  if (isPnUser(jid)) return 'pn';
  return 'other';
}

export function phoneFromPnJid(value?: string | null) {
  const jid = normalizeJid(value);
  if (!jid || !isPnUser(jid)) return undefined;
  const user = jid.split('@')[0]?.split(':')[0] ?? '';
  return /^\d{6,15}$/.test(user) ? user : undefined;
}

export function identityFromPair(primary?: string | null, alternate?: string | null): WhatsAppIdentity | undefined {
  const jid = normalizeJid(primary);
  const alt = normalizeJid(alternate);
  if (!jid) return undefined;
  const kind = jidKind(jid);

  if (kind === 'lid') {
    const pnJid = alt && isPnUser(alt) ? alt : undefined;
    return { jid, lid: jid, pnJid, phone: phoneFromPnJid(pnJid), kind };
  }
  if (kind === 'pn') {
    const lid = alt && isLidUser(alt) ? alt : undefined;
    return { jid, lid, pnJid: jid, phone: phoneFromPnJid(jid), kind };
  }
  return { jid, kind };
}

export function mergeIdentity(...values: Array<WhatsAppIdentity | undefined>): WhatsAppIdentity | undefined {
  const valid = values.filter((value): value is WhatsAppIdentity => Boolean(value));
  if (!valid.length) return undefined;
  const first = valid[0];
  const lid = valid.find(value => value.lid)?.lid;
  const pnJid = valid.find(value => value.pnJid)?.pnJid;
  const phone = valid.find(value => value.phone)?.phone ?? phoneFromPnJid(pnJid);
  const preferred = lid ?? pnJid ?? first.jid;
  return {
    jid: preferred,
    lid,
    pnJid,
    phone,
    kind: jidKind(preferred),
  };
}

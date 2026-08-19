import type { AttozapDatabase } from '../database.js';

export type PersistableIdentity = {
  jid?: string | null;
  lid?: string | null;
  pnJid?: string | null;
  phone?: string | null;
};

/**
 * Persiste a identidade canónica sem deixar aliases PN/LID em linhas diferentes.
 * Os índices secundários de wa_identities são únicos por conta; por isso, um
 * upsert apenas por canonical_jid não é suficiente quando o provider alterna
 * entre PN e LID para o mesmo contacto.
 */
export function upsertWaIdentity(
  db: AttozapDatabase,
  accountId: string,
  identity: PersistableIdentity,
  source: string,
  pushName?: string | null,
) {
  const canonicalJid = identity.jid?.trim();
  if (!canonicalJid) return;

  const existingRows = db.prepare(`
    SELECT rowid AS identity_rowid, canonical_jid, lid, pn_jid, phone, push_name
    FROM wa_identities
    WHERE account_id=?
      AND (
        canonical_jid=?
        OR (? IS NOT NULL AND lid=?)
        OR (? IS NOT NULL AND pn_jid=?)
      )
    ORDER BY CASE
      WHEN canonical_jid=? THEN 0
      WHEN (? IS NOT NULL AND lid=?) THEN 1
      WHEN (? IS NOT NULL AND pn_jid=?) THEN 2
      ELSE 3
    END, rowid
  `).all(
    accountId,
    canonicalJid,
    identity.lid ?? null,
    identity.lid ?? null,
    identity.pnJid ?? null,
    identity.pnJid ?? null,
    canonicalJid,
    identity.lid ?? null,
    identity.lid ?? null,
    identity.pnJid ?? null,
    identity.pnJid ?? null,
  ) as Array<{
    identity_rowid: number;
    canonical_jid: string;
    lid: string | null;
    pn_jid: string | null;
    phone: string | null;
    push_name: string | null;
  }>;

  const keeper = existingRows[0];
  const merged = {
    lid: identity.lid ?? keeper?.lid ?? null,
    pnJid: identity.pnJid ?? keeper?.pn_jid ?? null,
    phone: identity.phone ?? keeper?.phone ?? null,
    pushName: pushName?.trim() || keeper?.push_name || null,
  };

  const persist = db.transaction(() => {
    if (!keeper) {
      db.prepare(`
        INSERT INTO wa_identities (account_id, canonical_jid, lid, pn_jid, phone, push_name, source, last_seen_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `).run(accountId, canonicalJid, merged.lid, merged.pnJid, merged.phone, merged.pushName, source);
      return;
    }

    for (const duplicate of existingRows.slice(1)) {
      db.prepare(`DELETE FROM wa_identities WHERE rowid=?`).run(duplicate.identity_rowid);
    }

    db.prepare(`
      UPDATE wa_identities
      SET canonical_jid=?, lid=?, pn_jid=?, phone=?, push_name=?, source=?, last_seen_at=CURRENT_TIMESTAMP
      WHERE rowid=? AND account_id=?
    `).run(canonicalJid, merged.lid, merged.pnJid, merged.phone, merged.pushName, source, keeper.identity_rowid, accountId);
  });

  persist();
  return { canonicalJid, lid: merged.lid, pnJid: merged.pnJid, phone: merged.phone };
}

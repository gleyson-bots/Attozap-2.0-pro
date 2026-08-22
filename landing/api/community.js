import { requireUser } from './_lib/auth.js';
import { fail, json } from './_lib/http.js';
import { memberReferralView } from './_lib/referrals.js';

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') return json(res, 405, { ok: false, error: 'Método não permitido' });
    const user = await requireUser(req);
    const member = await memberReferralView(user);
    return json(res, 200, { ok: true, member });
  } catch (error) {
    return fail(res, error);
  }
}

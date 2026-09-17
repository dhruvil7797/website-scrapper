import { json, requireAuth } from '../../../_shared';
import type { Env } from '../../../_shared';

// GET /api/prospects/[id]/sms — SMS history for a prospect
export const onRequestGet: PagesFunction<Env, 'id'> = async (context) => {
  const authErr = requireAuth(context);
  if (authErr) return authErr;

  const id = context.params.id as string;
  const { results } = await context.env.DB.prepare(
    'SELECT * FROM sms_log WHERE prospect_id = ? ORDER BY sent_at DESC'
  ).bind(id).all();

  return json(results);
};

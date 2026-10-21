import { json, error, requireAuth } from '../_shared';
import type { Env } from '../_shared';

// GET /api/unsubscribed — list all opted-out prospects
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const authErr = requireAuth(context);
  if (authErr) return authErr;

  const { results } = await context.env.DB.prepare(
    `SELECT p.id, p.business_name, p.email, p.phone, p.city, p.state_province,
            p.niche_id, n.name as niche_name, p.campaign_id, p.opted_out,
            p.updated_at, p.last_emailed_at, p.email_count
     FROM prospects p
     LEFT JOIN niches n ON p.niche_id = n.id
     WHERE p.opted_out = 1
     ORDER BY p.updated_at DESC`
  ).all();

  return json(results);
};

// POST /api/unsubscribed — re-subscribe a prospect (undo opt-out)
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const authErr = requireAuth(context);
  if (authErr) return authErr;

  const { prospect_id } = await context.request.json() as { prospect_id: string };
  if (!prospect_id) return error('prospect_id required');

  await context.env.DB.prepare(
    `UPDATE prospects SET opted_out = 0, updated_at = datetime('now') WHERE id = ?`
  ).bind(prospect_id).run();

  return json({ resubscribed: true });
};

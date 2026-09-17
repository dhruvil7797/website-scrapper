import { json, error, requireAuth } from '../../_shared';
import type { Env } from '../../_shared';

export const onRequestGet: PagesFunction<Env, 'id'> = async (context) => {
  const authErr = requireAuth(context);
  if (authErr) return authErr;

  const id = context.params.id as string;
  const result = await context.env.DB.prepare(
    `SELECT p.*, n.name as niche_name FROM prospects p LEFT JOIN niches n ON p.niche_id = n.id WHERE p.id = ?`
  ).bind(id).first();

  if (!result) return error('Prospect not found', 404);
  return json(result);
};

export const onRequestPatch: PagesFunction<Env, 'id'> = async (context) => {
  const authErr = requireAuth(context);
  if (authErr) return authErr;

  const id = context.params.id as string;
  const body = await context.request.json() as Record<string, unknown>;

  const allowed = ['status', 'notes', 'email', 'owner_name', 'phone', 'business_name', 'website_url', 'address', 'city', 'state_province', 'postal_code'];
  const sets: string[] = [];
  const values: unknown[] = [];

  for (const key of allowed) {
    if (key in body) {
      sets.push(`${key} = ?`);
      values.push(body[key]);
    }
  }

  if (sets.length === 0) return error('No valid fields to update');

  sets.push(`updated_at = datetime('now')`);
  values.push(id);

  await context.env.DB.prepare(`UPDATE prospects SET ${sets.join(', ')} WHERE id = ?`).bind(...values).run();
  const result = await context.env.DB.prepare(`SELECT p.*, n.name as niche_name FROM prospects p LEFT JOIN niches n ON p.niche_id = n.id WHERE p.id = ?`).bind(id).first();
  return json(result);
};

export const onRequestDelete: PagesFunction<Env, 'id'> = async (context) => {
  const authErr = requireAuth(context);
  if (authErr) return authErr;

  const id = context.params.id as string;
  await context.env.DB.prepare('DELETE FROM email_log WHERE prospect_id = ?').bind(id).run();
  await context.env.DB.prepare('DELETE FROM prospects WHERE id = ?').bind(id).run();
  return json({ deleted: true });
};

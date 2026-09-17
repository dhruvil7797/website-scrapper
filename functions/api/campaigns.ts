import { json, error, requireAuth, nanoid } from '../_shared';
import type { Env } from '../_shared';

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const authErr = requireAuth(context);
  if (authErr) return authErr;

  const { results } = await context.env.DB.prepare(
    `SELECT c.*, n.name as niche_name FROM campaigns c LEFT JOIN niches n ON c.niche_id = n.id ORDER BY c.created_at DESC`
  ).all();
  return json(results);
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const authErr = requireAuth(context);
  if (authErr) return authErr;

  const body = await context.request.json() as {
    name: string;
    niche_id: string;
    location: string;
    country?: string;
    radius_km?: number;
    requested_count?: number;
  };

  if (!body.name || !body.niche_id || !body.location) {
    return error('name, niche_id, and location are required');
  }

  const id = nanoid();
  await context.env.DB.prepare(
    `INSERT INTO campaigns (id, name, niche_id, location, country, radius_km, requested_count)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).bind(id, body.name, body.niche_id, body.location, body.country || 'US', body.radius_km || 40, body.requested_count || 50).run();

  const result = await context.env.DB.prepare(
    `SELECT c.*, n.name as niche_name FROM campaigns c LEFT JOIN niches n ON c.niche_id = n.id WHERE c.id = ?`
  ).bind(id).first();

  return json(result, 201);
};

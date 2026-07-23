import type { Env } from '../_shared';
import { jsonResponse, errorResponse, handleOptions, requireAuth, generateId } from '../_shared';

export const onRequestOptions: PagesFunction<Env> = async () => handleOptions();

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const authError = requireAuth(context.request, context.env);
  if (authError) return authError;

  const db = context.env.CLIENT_DB;

  try {
    const rows = await db
      .prepare(
        `SELECT c.*, n.name as niche_name
         FROM campaigns c
         LEFT JOIN niches n ON c.niche_id = n.id
         ORDER BY c.created_at DESC`
      )
      .all();

    return jsonResponse({ data: rows.results });
  } catch (e: any) {
    return errorResponse(`Database error: ${e.message}`, 500);
  }
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const authError = requireAuth(context.request, context.env);
  if (authError) return authError;

  try {
    const body = await context.request.json<Record<string, any>>();
    if (!body.name || !body.niche_id || !body.postal_codes) {
      return errorResponse('name, niche_id, and postal_codes are required');
    }

    const db = context.env.CLIENT_DB;
    const id = generateId();
    const now = new Date().toISOString();

    await db
      .prepare(
        `INSERT INTO campaigns (id, name, niche_id, postal_codes, country, radius_km, daily_limit, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        id,
        body.name,
        body.niche_id,
        JSON.stringify(body.postal_codes),
        body.country || 'US',
        body.radius_km || 40,
        body.daily_limit || 50,
        'active',
        now,
        now
      )
      .run();

    return jsonResponse({ id, message: 'Campaign created' }, 201);
  } catch (e: any) {
    return errorResponse(`Failed to create campaign: ${e.message}`, 500);
  }
};

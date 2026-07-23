import type { Env } from '../../_shared';
import { jsonResponse, errorResponse, handleOptions, requireAuth } from '../../_shared';

export const onRequestOptions: PagesFunction<Env> = async () => handleOptions();

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const authError = requireAuth(context.request, context.env);
  if (authError) return authError;

  const { id } = context.params;
  const db = context.env.CLIENT_DB;

  try {
    const campaign = await db
      .prepare(
        `SELECT c.*, n.name as niche_name
         FROM campaigns c
         LEFT JOIN niches n ON c.niche_id = n.id
         WHERE c.id = ?`
      )
      .bind(id)
      .first();

    if (!campaign) {
      return errorResponse('Campaign not found', 404);
    }

    return jsonResponse(campaign);
  } catch (e: any) {
    return errorResponse(`Database error: ${e.message}`, 500);
  }
};

export const onRequestPatch: PagesFunction<Env> = async (context) => {
  const authError = requireAuth(context.request, context.env);
  if (authError) return authError;

  const { id } = context.params;
  const db = context.env.CLIENT_DB;

  try {
    const body = await context.request.json<Record<string, any>>();
    const now = new Date().toISOString();

    const allowedFields = ['name', 'postal_codes', 'country', 'radius_km', 'daily_limit', 'status'];
    const updates: string[] = ['updated_at = ?'];
    const values: unknown[] = [now];

    for (const field of allowedFields) {
      if (field in body) {
        const val = field === 'postal_codes' ? JSON.stringify(body[field]) : body[field];
        updates.push(`${field} = ?`);
        values.push(val);
      }
    }

    values.push(id);

    const result = await db
      .prepare(`UPDATE campaigns SET ${updates.join(', ')} WHERE id = ?`)
      .bind(...values)
      .run();

    if (result.meta.changes === 0) {
      return errorResponse('Campaign not found', 404);
    }

    return jsonResponse({ message: 'Updated' });
  } catch (e: any) {
    return errorResponse(`Failed to update: ${e.message}`, 500);
  }
};

export const onRequestDelete: PagesFunction<Env> = async (context) => {
  const authError = requireAuth(context.request, context.env);
  if (authError) return authError;

  const { id } = context.params;
  const db = context.env.CLIENT_DB;

  try {
    // Remove campaign reference from prospects first (don't delete prospects)
    await db.prepare(`UPDATE prospects SET campaign_id = NULL WHERE campaign_id = ?`).bind(id).run();
    
    const result = await db
      .prepare(`DELETE FROM campaigns WHERE id = ?`)
      .bind(id)
      .run();

    if (result.meta.changes === 0) {
      return errorResponse('Campaign not found', 404);
    }

    return jsonResponse({ message: 'Deleted' });
  } catch (e: any) {
    return errorResponse(`Failed to delete: ${e.message}`, 500);
  }
};

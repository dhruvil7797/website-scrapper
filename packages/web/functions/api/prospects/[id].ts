import type { Env } from '../../_shared';
import { jsonResponse, errorResponse, handleOptions, requireAuth } from '../../_shared';

export const onRequestOptions: PagesFunction<Env> = async () => handleOptions();

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const authError = requireAuth(context.request, context.env);
  if (authError) return authError;

  const { id } = context.params;
  const db = context.env.CLIENT_DB;

  try {
    const prospect = await db
      .prepare(`SELECT * FROM prospects WHERE id = ?`)
      .bind(id)
      .first();

    if (!prospect) {
      return errorResponse('Prospect not found', 404);
    }

    return jsonResponse(prospect);
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

    const allowedFields = [
      'business_name', 'phone_raw', 'phone_normalized', 'email', 'email_type',
      'website_url', 'address', 'city', 'state_province', 'postal_code', 'country',
      'campaign_id', 'niche_id', 'quality_score', 'stage', 'reply_notes', 'replied',
      'follow_up_approved', 'owner_name', 'timezone',
    ];

    const updates: string[] = ['updated_at = ?'];
    const values: unknown[] = [now];

    for (const field of allowedFields) {
      if (field in body) {
        updates.push(`${field} = ?`);
        values.push(body[field]);
      }
    }

    values.push(id);

    const result = await db
      .prepare(`UPDATE prospects SET ${updates.join(', ')} WHERE id = ?`)
      .bind(...values)
      .run();

    if (result.meta.changes === 0) {
      return errorResponse('Prospect not found', 404);
    }

    return jsonResponse({ message: 'Updated' });
  } catch (e: any) {
    return errorResponse(`Failed to update: ${e.message}`, 500);
  }
};

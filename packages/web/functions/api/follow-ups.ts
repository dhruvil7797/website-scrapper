import type { Env } from '../_shared';
import { jsonResponse, errorResponse, handleOptions, requireAuth } from '../_shared';

export const onRequestOptions: PagesFunction<Env> = async () => handleOptions();

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const authError = requireAuth(context.request, context.env);
  if (authError) return authError;

  const db = context.env.CLIENT_DB;

  try {
    const rows = await db
      .prepare(
        `SELECT id, business_name, email, city, state_province, stage,
                follow_up_due_at, follow_up_approved, open_count, click_count,
                email_sent_at, email_subject
         FROM prospects
         WHERE stage = 'follow_up_due'
           AND follow_up_due_at <= datetime('now')
         ORDER BY follow_up_due_at ASC
         LIMIT 100`
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
    const body = await context.request.json<{ ids: string[] }>();
    if (!body.ids || !Array.isArray(body.ids) || body.ids.length === 0) {
      return errorResponse('ids array is required');
    }

    const db = context.env.CLIENT_DB;
    const now = new Date().toISOString();
    let approved = 0;

    for (const id of body.ids) {
      const result = await db
        .prepare(
          `UPDATE prospects SET follow_up_approved = 1, updated_at = ? WHERE id = ? AND stage = 'follow_up_due'`
        )
        .bind(now, id)
        .run();
      approved += result.meta.changes || 0;
    }

    return jsonResponse({ approved, message: `${approved} follow-ups approved` });
  } catch (e: any) {
    return errorResponse(`Failed to approve: ${e.message}`, 500);
  }
};

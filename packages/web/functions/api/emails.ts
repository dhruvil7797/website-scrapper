import type { Env } from '../_shared';
import { jsonResponse, errorResponse, handleOptions, requireAuth } from '../_shared';

export const onRequestOptions: PagesFunction<Env> = async () => handleOptions();

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const authError = requireAuth(context.request, context.env);
  if (authError) return authError;

  const url = new URL(context.request.url);
  const page = parseInt(url.searchParams.get('page') || '1');
  const pageSize = Math.min(parseInt(url.searchParams.get('pageSize') || '1000'), 1000);
  const status = url.searchParams.get('status');
  const prospectId = url.searchParams.get('prospectId');

  const db = context.env.CLIENT_DB;
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (status) {
    conditions.push('e.status = ?');
    params.push(status);
  }
  if (prospectId) {
    conditions.push('e.prospect_id = ?');
    params.push(prospectId);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  try {
    const countResult = await db
      .prepare(`SELECT COUNT(*) as total FROM email_log e ${where}`)
      .bind(...params)
      .first<{ total: number }>();

    const offset = (page - 1) * pageSize;
    const rows = await db
      .prepare(
        `SELECT e.*, p.business_name
         FROM email_log e
         LEFT JOIN prospects p ON e.prospect_id = p.id
         ${where}
         ORDER BY e.sent_at DESC
         LIMIT ? OFFSET ?`
      )
      .bind(...params, pageSize, offset)
      .all();

    return jsonResponse({
      data: rows.results,
      total: countResult?.total || 0,
      page,
      pageSize,
    });
  } catch (e: any) {
    return errorResponse(`Database error: ${e.message}`, 500);
  }
};

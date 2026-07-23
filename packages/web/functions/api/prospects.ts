import type { Env } from '../_shared';
import { jsonResponse, errorResponse, handleOptions, requireAuth, generateId } from '../_shared';

export const onRequestOptions: PagesFunction<Env> = async () => handleOptions();

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const authError = requireAuth(context.request, context.env);
  if (authError) return authError;

  const url = new URL(context.request.url);
  const page = parseInt(url.searchParams.get('page') || '1');
  const pageSize = Math.min(parseInt(url.searchParams.get('pageSize') || '1000'), 1000);
  const stage = url.searchParams.get('stage');
  const campaignId = url.searchParams.get('campaignId');
  const search = url.searchParams.get('search');
  const sortBy = url.searchParams.get('sortBy') || 'created_at';
  const sortDir = url.searchParams.get('sortDir') === 'asc' ? 'ASC' : 'DESC';

  const db = context.env.CLIENT_DB;
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (stage) {
    conditions.push('stage = ?');
    params.push(stage);
  }
  if (campaignId) {
    conditions.push('campaign_id = ?');
    params.push(campaignId);
  }
  if (search) {
    conditions.push('(business_name LIKE ? OR email LIKE ? OR city LIKE ?)');
    const term = `%${search}%`;
    params.push(term, term, term);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const allowedSorts = ['created_at', 'quality_score', 'business_name', 'updated_at'];
  const sort = allowedSorts.includes(sortBy) ? sortBy : 'created_at';

  try {
    const countResult = await db
      .prepare(`SELECT COUNT(*) as total FROM prospects ${where}`)
      .bind(...params)
      .first<{ total: number }>();

    const offset = (page - 1) * pageSize;
    const rows = await db
      .prepare(
        `SELECT id, business_name, email, phone_raw, city, state_province, stage,
                quality_score, campaign_id, niche_id, open_count, click_count,
                generated_site_url, created_at, updated_at
         FROM prospects ${where}
         ORDER BY ${sort} ${sortDir}
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

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const authError = requireAuth(context.request, context.env);
  if (authError) return authError;

  try {
    const body = await context.request.json<Record<string, any>>();
    if (!body.business_name) {
      return errorResponse('business_name is required');
    }

    const db = context.env.CLIENT_DB;
    const id = generateId();
    const now = new Date().toISOString();

    await db
      .prepare(
        `INSERT INTO prospects (id, business_name, phone_raw, phone_normalized, email, email_type,
          website_url, address, city, state_province, postal_code, country, campaign_id, niche_id,
          source, quality_score, stage, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        id,
        body.business_name,
        body.phone_raw || null,
        body.phone_normalized || null,
        body.email || null,
        body.email_type || null,
        body.website_url || null,
        body.address || null,
        body.city || null,
        body.state_province || null,
        body.postal_code || null,
        body.country || 'US',
        body.campaign_id || null,
        body.niche_id || null,
        body.source || 'manual',
        body.quality_score || 0,
        body.stage || 'discovered',
        now,
        now
      )
      .run();

    return jsonResponse({ id, message: 'Prospect created' }, 201);
  } catch (e: any) {
    return errorResponse(`Failed to create prospect: ${e.message}`, 500);
  }
};

export const onRequestPatch: PagesFunction<Env> = async (context) => {
  const authError = requireAuth(context.request, context.env);
  if (authError) return authError;

  const db = context.env.CLIENT_DB;

  try {
    const body = await context.request.json<{ ids: string[]; action: string }>();
    const { ids, action } = body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return errorResponse('ids array required', 400);
    }

    const placeholders = ids.map(() => '?').join(',');
    const now = new Date().toISOString();

    switch (action) {
      case 'approve':
        await db.prepare(
          `UPDATE prospects SET stage = 'pending_approval', updated_at = ? WHERE id IN (${placeholders})`
        ).bind(now, ...ids).run();
        break;
      case 'prioritize':
        await db.prepare(
          `UPDATE prospects SET quality_score = 999, updated_at = ? WHERE id IN (${placeholders})`
        ).bind(now, ...ids).run();
        break;
      case 'skip':
        await db.prepare(
          `UPDATE prospects SET stage = 'skipped', skip_reason = 'manual_skip', updated_at = ? WHERE id IN (${placeholders})`
        ).bind(now, ...ids).run();
        break;
      default:
        return errorResponse(`Unknown action: ${action}`, 400);
    }

    return jsonResponse({ success: true, action, count: ids.length });
  } catch (e: any) {
    return errorResponse(`Batch action failed: ${e.message}`, 500);
  }
};

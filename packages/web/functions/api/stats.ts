import type { Env } from '../_shared';
import { jsonResponse, errorResponse, handleOptions, requireAuth } from '../_shared';

export const onRequestOptions: PagesFunction<Env> = async () => handleOptions();

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const authError = requireAuth(context.request, context.env);
  if (authError) return authError;

  const db = context.env.CLIENT_DB;
  const url = new URL(context.request.url);
  const from = url.searchParams.get('from'); // ISO date e.g. 2026-01-15
  const to = url.searchParams.get('to');     // ISO date e.g. 2026-01-20

  // Build date filter clauses
  const hasDateFilter = from || to;
  const prospectDateFilter = hasDateFilter
    ? `${from ? `AND created_at >= '${from}T00:00:00'` : ''} ${to ? `AND created_at < '${to}T23:59:59'` : ''}`
    : '';
  const emailLogDateFilter = hasDateFilter
    ? `${from ? `AND sent_at >= '${from}T00:00:00'` : ''} ${to ? `AND sent_at < '${to}T23:59:59'` : ''}`
    : '';
  const engagementDateFilter = hasDateFilter
    ? `${from ? `AND email_sent_at >= '${from}T00:00:00'` : ''} ${to ? `AND email_sent_at < '${to}T23:59:59'` : ''}`
    : '';

  try {
    // Stage counts (filtered by prospect created_at)
    const stageCounts = await db
      .prepare(
        `SELECT stage, COUNT(*) as count FROM prospects WHERE 1=1 ${prospectDateFilter} GROUP BY stage`
      )
      .all<{ stage: string; count: number }>();

    // Total prospects in range
    const totalResult = await db
      .prepare(`SELECT COUNT(*) as total FROM prospects WHERE 1=1 ${prospectDateFilter}`)
      .first<{ total: number }>();

    // Open/click rates (filtered by email_sent_at within range)
    const engagementResult = await db
      .prepare(
        `SELECT
           COUNT(*) as emailed,
           SUM(CASE WHEN open_count > 0 THEN 1 ELSE 0 END) as opened,
           SUM(CASE WHEN click_count > 0 THEN 1 ELSE 0 END) as clicked,
           SUM(CASE WHEN replied = 1 THEN 1 ELSE 0 END) as replied
         FROM prospects
         WHERE email_sent_at IS NOT NULL ${engagementDateFilter}`
      )
      .first<{ emailed: number; opened: number; clicked: number; replied: number }>();

    // Active campaigns count (not date-filtered - campaigns are ongoing)
    const campaignResult = await db
      .prepare(`SELECT COUNT(*) as count FROM campaigns WHERE status = 'active'`)
      .first<{ count: number }>();

    // Email stats from log (filtered by sent_at)
    const emailStats = await db
      .prepare(
        `SELECT status, COUNT(*) as count FROM email_log WHERE 1=1 ${emailLogDateFilter} GROUP BY status`
      )
      .all<{ status: string; count: number }>();

    // Sends in range (replaces "today's sends" when date filter is active)
    const sendsQuery = hasDateFilter
      ? `SELECT COUNT(*) as count FROM email_log WHERE 1=1 ${emailLogDateFilter}`
      : `SELECT COUNT(*) as count FROM email_log WHERE sent_at >= datetime('now', 'start of day')`;
    const todaySends = await db
      .prepare(sendsQuery)
      .first<{ count: number }>();

    const emailed = engagementResult?.emailed || 0;

    // Get ramp info
    const rampLevelResult = await db.prepare("SELECT value FROM settings WHERE key = 'ramp_level'").first<{ value: string }>();
    const rampStepsResult = await db.prepare("SELECT value FROM settings WHERE key = 'ramp_steps'").first<{ value: string }>();
    const rampLevel = parseInt(rampLevelResult?.value || '0');
    const rampSteps = JSON.parse(rampStepsResult?.value || '[10,25,50,100,200,300]');
    const rampLimit = rampSteps[rampLevel] || rampSteps[0];

    return jsonResponse({
      pipeline: Object.fromEntries(
        (stageCounts.results || []).map((r) => [r.stage, r.count])
      ),
      total: totalResult?.total || 0,
      activeCampaigns: campaignResult?.count || 0,
      engagement: {
        emailed,
        opened: engagementResult?.opened || 0,
        clicked: engagementResult?.clicked || 0,
        replied: engagementResult?.replied || 0,
        openRate: emailed > 0 ? ((engagementResult?.opened || 0) / emailed) : 0,
        clickRate: emailed > 0 ? ((engagementResult?.clicked || 0) / emailed) : 0,
        replyRate: emailed > 0 ? ((engagementResult?.replied || 0) / emailed) : 0,
      },
      emailLog: Object.fromEntries(
        (emailStats.results || []).map((r) => [r.status, r.count])
      ),
      todaySends: todaySends?.count || 0,
      rampLevel,
      rampLimit,
      rampSteps,
    });
  } catch (e: any) {
    return errorResponse(`Database error: ${e.message}`, 500);
  }
};

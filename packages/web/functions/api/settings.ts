import type { Env } from '../_shared';
import { jsonResponse, errorResponse, handleOptions, requireAuth } from '../_shared';

export const onRequestOptions: PagesFunction<Env> = async () => handleOptions();

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const authError = requireAuth(context.request, context.env);
  if (authError) return authError;

  const db = context.env.CLIENT_DB;

  try {
    const rows = await db.prepare(`SELECT key, value, updated_at FROM settings`).all();
    const settings: Record<string, string> = {};
    for (const row of rows.results as any[]) {
      settings[row.key] = row.value;
    }
    return jsonResponse(settings);
  } catch (e: any) {
    return errorResponse(`Database error: ${e.message}`, 500);
  }
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const authError = requireAuth(context.request, context.env);
  if (authError) return authError;

  try {
    const body = await context.request.json<Record<string, string>>();
    const db = context.env.CLIENT_DB;
    const now = new Date().toISOString();

    const allowedKeys = [
      'ramp_level', 'ramp_steps', 'ramp_days_per_step', 'ramp_last_step_date',
      'bounce_rate_threshold', 'bounce_rate_pause_threshold', 'qa_confidence_threshold',
      'scraper_delay_ms', 'discovery_cache_days', 'follow_up_delay_days',
      'email_morning_weight', 'email_midday_weight', 'email_afternoon_weight',
      'worker_concurrency', 'purelymail_daily_limit',
    ];

    let updated = 0;
    for (const [key, value] of Object.entries(body)) {
      if (!allowedKeys.includes(key)) continue;
      await db
        .prepare(`INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, ?)`)
        .bind(key, String(value), now)
        .run();
      updated++;
    }

    return jsonResponse({ updated, message: `${updated} settings saved` });
  } catch (e: any) {
    return errorResponse(`Failed to save settings: ${e.message}`, 500);
  }
};

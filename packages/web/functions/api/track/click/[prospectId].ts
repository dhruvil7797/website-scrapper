import type { Env } from '../../../_shared';
import { generateId } from '../../../_shared';

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { prospectId } = context.params;
  const ip = context.request.headers.get('CF-Connecting-IP') || '';
  const ua = context.request.headers.get('User-Agent') || '';

  let redirectUrl = '/';

  try {
    const db = context.env.CLIENT_DB;
    const now = new Date().toISOString();

    // Log tracking event
    await db
      .prepare(
        `INSERT INTO tracking_events (id, prospect_id, event_type, timestamp, ip_address, user_agent)
         VALUES (?, ?, 'click', ?, ?, ?)`
      )
      .bind(generateId(), prospectId, now, ip, ua)
      .run();

    // Update prospect click counts
    await db
      .prepare(
        `UPDATE prospects SET
           click_count = click_count + 1,
           first_clicked_at = COALESCE(first_clicked_at, ?),
           last_clicked_at = ?,
           updated_at = ?
         WHERE id = ?`
      )
      .bind(now, now, now, prospectId)
      .run();

    // Get the generated site URL for redirect
    const prospect = await db
      .prepare(`SELECT generated_site_url, portfolio_slug FROM prospects WHERE id = ?`)
      .bind(prospectId)
      .first<{ generated_site_url: string | null; portfolio_slug: string | null }>();

    if (prospect?.generated_site_url) {
      redirectUrl = prospect.generated_site_url;
    } else if (prospect?.portfolio_slug) {
      redirectUrl = `/portfolio/${prospect.portfolio_slug}`;
    }
  } catch (e) {
    console.error('Tracking click error:', e);
  }

  return Response.redirect(new URL(redirectUrl, context.request.url).toString(), 302);
};

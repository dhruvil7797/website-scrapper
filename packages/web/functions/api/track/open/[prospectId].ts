import type { Env } from '../../../_shared';
import { generateId } from '../../../_shared';

// 1x1 transparent PNG
const PIXEL = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
  0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00,
  0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x62, 0x00, 0x00, 0x00, 0x02,
  0x00, 0x01, 0xe5, 0x27, 0xde, 0xfc, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45,
  0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
]);

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { prospectId } = context.params;
  const ip = context.request.headers.get('CF-Connecting-IP') || '';
  const ua = context.request.headers.get('User-Agent') || '';

  try {
    const db = context.env.CLIENT_DB;
    const now = new Date().toISOString();

    // Log tracking event
    await db
      .prepare(
        `INSERT INTO tracking_events (id, prospect_id, event_type, timestamp, ip_address, user_agent)
         VALUES (?, ?, 'open', ?, ?, ?)`
      )
      .bind(generateId(), prospectId, now, ip, ua)
      .run();

    // Update prospect open counts
    await db
      .prepare(
        `UPDATE prospects SET
           open_count = open_count + 1,
           first_opened_at = COALESCE(first_opened_at, ?),
           last_opened_at = ?,
           updated_at = ?
         WHERE id = ?`
      )
      .bind(now, now, now, prospectId)
      .run();
  } catch (e) {
    // Don't fail the pixel - tracking is best-effort
    console.error('Tracking open error:', e);
  }

  return new Response(PIXEL, {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    },
  });
};

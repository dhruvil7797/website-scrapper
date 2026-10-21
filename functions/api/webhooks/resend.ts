import { json } from '../../_shared';
import type { Env } from '../../_shared';

// POST /api/webhooks/resend — Resend webhook receiver
export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const event = await context.request.json() as {
      type: string;
      data: {
        email_id: string;
        created_at?: string;
        [key: string]: unknown;
      };
    };

    const { type, data } = event;
    if (!type || !data?.email_id) {
      return json({ received: true, skipped: 'missing type or email_id' });
    }

    const now = new Date().toISOString();

    switch (type) {
      case 'email.delivered':
        await context.env.DB.prepare(
          'UPDATE email_log SET delivered_at = ? WHERE resend_id = ?'
        ).bind(now, data.email_id).run();
        break;

      case 'email.opened':
        await context.env.DB.prepare(
          'UPDATE email_log SET opened_at = ? WHERE resend_id = ? AND opened_at IS NULL'
        ).bind(now, data.email_id).run();
        break;

      case 'email.clicked':
        await context.env.DB.prepare(
          'UPDATE email_log SET clicked_at = ? WHERE resend_id = ? AND clicked_at IS NULL'
        ).bind(now, data.email_id).run();
        break;

      case 'email.bounced':
        await context.env.DB.prepare(
          'UPDATE email_log SET bounced_at = ?, status = ? WHERE resend_id = ?'
        ).bind(now, 'bounced', data.email_id).run();
        break;

      case 'email.complained':
        await context.env.DB.prepare(
          'UPDATE email_log SET bounced_at = ?, status = ? WHERE resend_id = ?'
        ).bind(now, 'complained', data.email_id).run();
        break;

      default:
        // Unknown event type — acknowledge but ignore
        break;
    }

    return json({ received: true, type });
  } catch {
    // Always return 200 to prevent Resend retries
    return json({ received: true, error: 'parse_failed' });
  }
};

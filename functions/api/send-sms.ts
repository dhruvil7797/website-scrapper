import { json, error, requireAuth, nanoid } from '../_shared';
import type { Env } from '../_shared';

// POST /api/send-sms — send SMS via Twilio
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const authErr = requireAuth(context);
  if (authErr) return authErr;

  try {
    const { prospect_id, to_phone, body, template_id } = await context.request.json() as {
      prospect_id: string;
      to_phone: string;
      body: string;
      template_id?: string;
    };

    if (!to_phone || !body) return error('to_phone and body are required');

    // Get Twilio phone from settings
    const phoneSetting = await context.env.DB.prepare("SELECT value FROM settings WHERE key = 'twilio_phone_number'").first<{ value: string }>();
    const fromPhone = phoneSetting?.value;
    if (!fromPhone) return error('Twilio phone number not configured in Settings');

    const SID = context.env.TWILIO_ACCOUNT_SID;
    const TOKEN = context.env.TWILIO_AUTH_TOKEN;
    if (!SID || !TOKEN) return error('Twilio credentials not configured');

    // Send via Twilio REST API
    let twilioSid = '';
    let status = 'sent';
    let errorMessage = '';

    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${SID}/Messages.json`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${btoa(SID + ':' + TOKEN)}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        To: to_phone,
        From: fromPhone,
        Body: body,
      }),
    });

    const data = await res.json() as { sid?: string; message?: string; code?: number; status?: string };

    if (!res.ok || data.code) {
      status = 'failed';
      errorMessage = data.message || `Twilio error ${res.status}`;
    } else {
      twilioSid = data.sid || '';
    }

    // Log SMS
    const logId = nanoid();
    await context.env.DB.prepare(
      `INSERT INTO sms_log (id, prospect_id, template_id, to_phone, from_phone, body, status, error_message, twilio_sid)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(logId, prospect_id || 'direct_' + nanoid(6), template_id || null, to_phone, fromPhone, body, status, errorMessage || null, twilioSid || null).run();

    // Update prospect if linked
    if (prospect_id && status === 'sent') {
      await context.env.DB.prepare(
        `UPDATE prospects SET status = CASE WHEN status = 'new' THEN 'contacted' ELSE status END, sms_sent_at = datetime('now'), sms_count = sms_count + 1, updated_at = datetime('now') WHERE id = ?`
      ).bind(prospect_id).run();
    }

    if (status === 'failed') return error(errorMessage, 500);
    return json({ sent: true, twilio_sid: twilioSid, log_id: logId });
  } catch (e) {
    return error(e instanceof Error ? e.message : 'SMS send failed', 500);
  }
};

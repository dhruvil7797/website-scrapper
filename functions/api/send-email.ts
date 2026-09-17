import { json, error, requireAuth, nanoid } from '../_shared';
import type { Env } from '../_shared';

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const authErr = requireAuth(context);
  if (authErr) return authErr;

  const { prospect_id, template_id, subject, body_html, body_text } = await context.request.json() as {
    prospect_id: string;
    template_id: string | null;
    subject: string;
    body_html: string;
    body_text: string;
  };

  if (!prospect_id || !subject || !body_html) {
    return error('prospect_id, subject, and body_html are required');
  }

  // Get prospect
  const prospect = await context.env.DB.prepare('SELECT * FROM prospects WHERE id = ?').bind(prospect_id).first<{ email: string; business_name: string }>();
  if (!prospect || !prospect.email) return error('Prospect not found or has no email', 404);

  // Get sending settings
  const settingsRows = await context.env.DB.prepare('SELECT key, value FROM settings').all();
  const settings: Record<string, string> = {};
  for (const row of settingsRows.results as Array<{ key: string; value: string }>) {
    settings[row.key] = row.value;
  }

  const fromEmail = settings.sending_email || 'hello@cloudgenz.com';
  const replyTo = settings.reply_to_email || fromEmail;
  const senderName = settings.sender_name || 'CloudGenZ';

  // Send via Resend
  let resendId = '';
  let status = 'sent';
  let errorMessage = '';

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${context.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `${senderName} <${fromEmail}>`,
        to: [prospect.email],
        reply_to: replyTo,
        subject,
        html: body_html,
        text: body_text,
      }),
    });

    if (!res.ok) {
      const errBody = await res.text();
      status = 'failed';
      errorMessage = `Resend ${res.status}: ${errBody.substring(0, 200)}`;
    } else {
      const data = await res.json() as { id: string };
      resendId = data.id;
    }
  } catch (e) {
    status = 'failed';
    errorMessage = e instanceof Error ? e.message : 'Send failed';
  }

  // Log email
  const logId = nanoid();
  await context.env.DB.prepare(
    `INSERT INTO email_log (id, prospect_id, template_id, to_address, subject, body_preview, status, error_message, resend_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(logId, prospect_id, template_id, prospect.email, subject, body_text.substring(0, 200), status, errorMessage || null, resendId || null).run();

  // Update prospect
  if (status === 'sent') {
    await context.env.DB.prepare(
      `UPDATE prospects SET status = 'contacted', last_emailed_at = datetime('now'), email_count = email_count + 1, template_used = ?, updated_at = datetime('now') WHERE id = ?`
    ).bind(template_id, prospect_id).run();

    // Update template usage count
    if (template_id) {
      await context.env.DB.prepare(`UPDATE email_templates SET usage_count = usage_count + 1 WHERE id = ?`).bind(template_id).run();
    }
  }

  if (status === 'failed') {
    return error(errorMessage, 500);
  }

  return json({ sent: true, resend_id: resendId, log_id: logId });
};

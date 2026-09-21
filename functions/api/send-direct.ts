import { json, error, requireAuth, nanoid } from '../_shared';
import type { Env } from '../_shared';

// POST /api/send-direct — send email to any address (not linked to a prospect)
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const authErr = requireAuth(context);
  if (authErr) return authErr;

  const { to_email, to_name, subject, body_html, body_text, template_id } = await context.request.json() as {
    to_email: string;
    to_name?: string;
    subject: string;
    body_html: string;
    body_text: string;
    template_id?: string;
  };

  if (!to_email || !subject || !body_html) {
    return error('to_email, subject, and body_html are required');
  }

  // Get sending settings
  const settingsRows = await context.env.DB.prepare('SELECT key, value FROM settings').all();
  const settings: Record<string, string> = {};
  for (const row of settingsRows.results as Array<{ key: string; value: string }>) {
    settings[row.key] = row.value;
  }

  const fromEmail = settings.sending_email || 'hello@cloudgenz.com';
  const replyTo = settings.reply_to_email || fromEmail;
  const senderName = settings.sender_name || 'CloudGenZ';

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
        to: [to_email],
        bcc: ['dhruvil@cloudgenz.com'],
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

  // Log email (no prospect_id)
  const logId = nanoid();
  await context.env.DB.prepare(
    `INSERT INTO email_log (id, prospect_id, template_id, to_address, subject, body_preview, body_html, body_text, status, error_message, resend_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(logId, 'direct_' + nanoid(6), template_id || null, to_email, subject, body_text.substring(0, 200), body_html, body_text, status, errorMessage || null, resendId || null).run();

  if (template_id) {
    await context.env.DB.prepare('UPDATE email_templates SET usage_count = usage_count + 1 WHERE id = ?').bind(template_id).run();
  }

  if (status === 'failed') return error(errorMessage, 500);
  return json({ sent: true, resend_id: resendId });
};

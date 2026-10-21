import { json, error, requireAuth, nanoid } from '../_shared';
import type { Env } from '../_shared';

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const authErr = requireAuth(context);
  if (authErr) return authErr;

  const body = await context.request.json() as {
    prospect_id: string;
    template_id: string | null;
    to_email: string;
    from_email?: string;
    reply_to_email?: string;
    sender_name?: string;
    subject: string;
    body_html: string;
    body_text: string;
  };

  if (!body.to_email || !body.subject || !body.body_html) {
    return error('to_email, subject, and body_html are required');
  }

  // Check if prospect has opted out
  if (body.prospect_id) {
    const prospect = await context.env.DB.prepare(
      'SELECT opted_out FROM prospects WHERE id = ?'
    ).bind(body.prospect_id).first<{ opted_out: number }>();

    if (prospect?.opted_out === 1) {
      return error('This prospect has opted out of emails', 403);
    }
  }

  // Get sending settings for defaults
  const settingsRows = await context.env.DB.prepare('SELECT key, value FROM settings').all();
  const settings: Record<string, string> = {};
  for (const row of settingsRows.results as Array<{ key: string; value: string }>) {
    settings[row.key] = row.value;
  }

  const fromEmail = body.from_email || settings.sending_email || 'hello@cloudgenz.com';
  const replyTo = body.reply_to_email || settings.reply_to_email || fromEmail;
  const senderName = body.sender_name || settings.sender_name || 'CloudGenZ';

  // Append unsubscribe footer
  const origin = new URL(context.request.url).origin;
  const unsubscribeUrl = `${origin}/api/unsubscribe?id=${body.prospect_id}`;
  const unsubscribeFooter = `<div style="margin-top:32px;padding-top:16px;border-top:1px solid #e5e7eb;text-align:center;font-size:12px;color:#9ca3af;"><a href="${unsubscribeUrl}" style="color:#9ca3af;text-decoration:underline;">Unsubscribe from future emails</a></div>`;
  const finalHtml = body.body_html + unsubscribeFooter;

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
        to: [body.to_email],
        bcc: ['dhruvil@cloudgenz.com'],
        reply_to: replyTo,
        subject: body.subject,
        html: finalHtml,
        text: body.body_text,
        tags: body.prospect_id ? [{ name: 'prospect_id', value: body.prospect_id }] : [],
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
    `INSERT INTO email_log (id, prospect_id, template_id, to_address, subject, body_preview, body_html, body_text, status, error_message, resend_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(logId, body.prospect_id, body.template_id, body.to_email, body.subject, body.body_text.substring(0, 200), finalHtml, body.body_text, status, errorMessage || null, resendId || null).run();

  // Update prospect
  if (body.prospect_id && status === 'sent') {
    await context.env.DB.prepare(
      `UPDATE prospects SET status = CASE WHEN status = 'new' THEN 'contacted' ELSE status END, last_emailed_at = datetime('now'), email_count = email_count + 1, template_used = ?, updated_at = datetime('now') WHERE id = ?`
    ).bind(body.template_id, body.prospect_id).run();

    if (body.template_id) {
      await context.env.DB.prepare('UPDATE email_templates SET usage_count = usage_count + 1 WHERE id = ?').bind(body.template_id).run();
    }
  }

  if (status === 'failed') return error(errorMessage, 500);
  return json({ sent: true, resend_id: resendId, log_id: logId });
};

import nodemailer from 'nodemailer';
import { ImapFlow } from 'imapflow';
import { nanoid } from 'nanoid';
import { config } from '../config.js';
import { d1Select, d1Execute } from '../services/cloudflare.js';
import { aiCallJson } from '../services/ai.js';
import { createLogger } from '../services/logger.js';

const log = createLogger('follow-up-sender');

interface ApprovedProspect {
  id: string;
  business_name: string;
  owner_name: string | null;
  email: string;
  email_subject: string | null;
  portfolio_slug: string | null;
  niche_id: string | null;
  city: string | null;
  state_province: string | null;
}

interface FollowUpEmail {
  subject: string;
  body_html: string;
  body_text: string;
}

const transporter = nodemailer.createTransport({
  host: config.email.smtpHost,
  port: config.email.smtpPort,
  secure: config.email.smtpPort === 465,
  auth: {
    user: config.email.smtpUser,
    pass: config.email.smtpPass,
  },
});

/**
 * Send follow-up emails to prospects with stage='follow_up_approved'.
 * These are short, friendly check-ins referencing the original email.
 */
export async function runFollowUpSender(): Promise<{ sent: number; failed: number }> {
  let sent = 0;
  let failed = 0;

  const prospects = await d1Select<ApprovedProspect>(
    `SELECT id, business_name, owner_name, email, email_subject,
            portfolio_slug, niche_id, city, state_province
     FROM prospects
     WHERE stage = 'follow_up_approved'
     ORDER BY updated_at ASC
     LIMIT 20`,
  );

  if (prospects.length === 0) {
    log.info('No approved follow-ups to send');
    return { sent: 0, failed: 0 };
  }

  log.info(`Sending ${prospects.length} follow-up emails`);

  for (const prospect of prospects) {
    try {
      const portfolioUrl = `https://${config.portfolio.domain}/portfolio/${prospect.portfolio_slug}`;
      const followUp = await generateFollowUp(prospect, portfolioUrl);

      const messageId = `<${nanoid(24)}@${config.portfolio.domain}>`;
      const unsubscribeUrl = `https://${config.portfolio.domain}/api/unsubscribe/${prospect.id}`;

      const info = await transporter.sendMail({
        from: `"Dhruvil @ CloudGenz" <${config.email.sendingEmail}>`,
        replyTo: config.email.replyToEmail,
        to: prospect.email,
        subject: followUp.subject,
        messageId,
        html: buildFollowUpHtml(followUp.body_html, prospect.id),
        text: followUp.body_text,
        headers: {
          'X-Mailer': 'CloudGenz-Mailer/1.0',
          'List-Unsubscribe': `<${unsubscribeUrl}>, <mailto:${config.email.sendingEmail}?subject=unsubscribe>`,
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
          'X-Entity-Ref-ID': prospect.id,
          'Feedback-ID': `followup:${prospect.id}:cloudgenz`,
        },
      });

      // Copy to Sent folder
      await copyToSent(info, prospect, followUp);

      // Log the follow-up email
      await d1Execute(
        `INSERT INTO email_log (id, prospect_id, email_type, to_address, subject, body_preview, sent_at, status, message_id)
         VALUES (?, ?, 'follow_up', ?, ?, ?, datetime('now'), 'sent', ?)`,
        [nanoid(16), prospect.id, prospect.email, followUp.subject, followUp.body_text.substring(0, 200), info.messageId],
      );

      // Update stage to followed_up
      await d1Execute(
        `UPDATE prospects SET stage = 'followed_up', updated_at = datetime('now') WHERE id = ?`,
        [prospect.id],
      );

      sent++;
      log.info('Follow-up sent', { prospectId: prospect.id, to: prospect.email });

      // Jitter between sends (30s - 2min)
      const jitterMs = (30 + Math.random() * 90) * 1000;
      await new Promise(r => setTimeout(r, jitterMs));
    } catch (err: unknown) {
      const error = err as Error;
      failed++;
      log.error('Follow-up send failed', { prospectId: prospect.id, error: error.message });
    }
  }

  log.info('Follow-up sender complete', { sent, failed });
  return { sent, failed };
}

async function generateFollowUp(prospect: ApprovedProspect, portfolioUrl: string): Promise<FollowUpEmail> {
  const ownerName = prospect.owner_name || null;
  const greeting = ownerName ? `Hi ${ownerName}` : 'Hey there';
  const originalSubject = prospect.email_subject || 'your new website preview';

  const prompt = `Write a SHORT follow-up email for a local business owner. This is a gentle check-in, NOT a hard sell.

Context:
- Owner: ${ownerName || 'Unknown'}
- Business: ${prospect.business_name}
- Location: ${prospect.city || ''}, ${prospect.state_province || ''}
- Original email subject: "${originalSubject}"
- Preview link: ${portfolioUrl}
- They opened the first email but didn't reply

Requirements:
1. Subject line: "Re: ${originalSubject}" (keep it as a reply thread)
2. Open with "${greeting}"
3. Keep it to 2-3 sentences max
4. Reference the original email naturally ("just following up on the preview I sent")
5. Soft ask: "curious if you had a chance to take a look" or similar
6. No pressure, no urgency, no discounts
7. Sign off as "Dhruvil"
8. Body HTML: use inline styles, <p style="margin:0 0 12px 0;color:#374151;font-size:15px;line-height:1.7;">
9. Under 60 words total

Return JSON: {"subject": "Re: ...", "body_html": "<p>...</p>", "body_text": "plain text"}`;

  return aiCallJson<FollowUpEmail>({ prompt, timeout: 90000 });
}

function buildFollowUpHtml(bodyHtml: string, prospectId: string): string {
  const trackingPixel = `<img src="https://${config.portfolio.domain}/api/track/open/${prospectId}-fu.png" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0;" />`;
  const unsubscribeUrl = `https://${config.portfolio.domain}/api/unsubscribe/${prospectId}`;

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width:600px;margin:0 auto;">
    <tr>
      <td style="padding:24px;">
        ${bodyHtml}
      </td>
    </tr>
    <tr>
      <td style="padding:12px 24px;border-top:1px solid #f0f0f0;">
        <p style="margin:0;font-size:11px;color:#9ca3af;">
          <a href="${unsubscribeUrl}" style="color:#9ca3af;text-decoration:underline;">Unsubscribe</a>
        </p>
      </td>
    </tr>
  </table>
  ${trackingPixel}
</body>
</html>`;
}

async function copyToSent(
  info: nodemailer.SentMessageInfo,
  prospect: ApprovedProspect,
  followUp: FollowUpEmail,
): Promise<void> {
  try {
    const client = new ImapFlow({
      host: 'imap.purelymail.com',
      port: 993,
      secure: true,
      auth: {
        user: config.email.smtpUser,
        pass: config.email.smtpPass,
      },
      logger: false,
    });

    const boundary = `----=_Part_${nanoid(12)}`;
    const rawMessage = [
      `From: "Dhruvil @ CloudGenz" <${config.email.sendingEmail}>`,
      `To: ${prospect.email}`,
      `Subject: ${followUp.subject}`,
      `Message-ID: ${info.messageId}`,
      `Date: ${new Date().toUTCString()}`,
      `MIME-Version: 1.0`,
      `Content-Type: multipart/alternative; boundary="${boundary}"`,
      '',
      `--${boundary}`,
      'Content-Type: text/plain; charset=utf-8',
      '',
      followUp.body_text,
      '',
      `--${boundary}`,
      'Content-Type: text/html; charset=utf-8',
      '',
      buildFollowUpHtml(followUp.body_html, prospect.id),
      '',
      `--${boundary}--`,
    ].join('\r\n');

    await client.connect();
    await client.append('Sent', rawMessage, ['\\Seen']);
    await client.logout();
    log.debug('Follow-up copied to Sent folder');
  } catch (err: unknown) {
    log.warn('Failed to copy follow-up to Sent', { error: (err as Error).message });
  }
}

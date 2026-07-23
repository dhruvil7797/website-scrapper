import nodemailer from 'nodemailer';
import { config } from '../config.js';
import { d1Select, d1Execute, getSetting, setSetting } from '../services/cloudflare.js';
import { aiCallJson } from '../services/ai.js';
import { createLogger } from '../services/logger.js';
import { nanoid } from 'nanoid';

const log = createLogger('mailer');

interface Prospect {
  id: string;
  business_name: string;
  owner_name: string | null;
  email: string | null;
  website_url: string | null;
  city: string | null;
  state_province: string | null;
  google_rating: number | null;
  google_review_count: number | null;
  niche_id: string | null;
  has_website: number;
  pagespeed_mobile: number | null;
  generated_site_url: string | null;
  portfolio_slug: string | null;
}

interface NicheRow {
  features: string;
  name: string;
}

interface EmailGenResult {
  subject_options: string[];
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
 * Build the full HTML email wrapper with inline CSS.
 * Email clients strip <style> tags, so everything is inlined.
 */
function buildHtmlEmail(params: {
  bodyHtml: string;
  portfolioUrl: string;
  trackingPixel: string;
  prospectId: string;
  businessName: string;
}): string {
  const { bodyHtml, portfolioUrl, trackingPixel, prospectId, businessName } = params;
  const year = new Date().getFullYear();

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="x-apple-disable-message-reformatting">
  <title>CloudGenZ</title>
  <!--[if mso]>
  <noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript>
  <![endif]-->
</head>
<body style="margin:0;padding:0;background-color:#f4f4f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color:#f4f4f7;">
    <tr>
      <td align="center" style="padding:24px 16px;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width:600px;">
          
          <!-- Logo / Brand Header -->
          <tr>
            <td style="padding:0 0 20px 0;text-align:center;">
              <span style="font-size:18px;font-weight:700;color:#1a1a2e;letter-spacing:-0.5px;">CloudGenZ</span>
            </td>
          </tr>

          <!-- Main Card -->
          <tr>
            <td style="background-color:#ffffff;border-radius:12px;box-shadow:0 2px 8px rgba(0,0,0,0.06);overflow:hidden;">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                
                <!-- Email Body -->
                <tr>
                  <td style="padding:40px 36px 24px 36px;font-size:15px;line-height:1.7;color:#374151;">
                    ${bodyHtml}
                  </td>
                </tr>

                <!-- Preview Site CTA -->
                <tr>
                  <td style="padding:0 36px 36px 36px;">
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                      <tr>
                        <td style="background-color:#f0fdf4;border-radius:8px;border:1px solid #e8f8f0;padding:20px 24px;">
                          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                            <tr>
                              <td style="padding-bottom:12px;">
                                <span style="font-size:12px;font-weight:600;color:#2ecc71;text-transform:uppercase;letter-spacing:0.5px;">Preview Built for ${businessName}</span>
                              </td>
                            </tr>
                            <tr>
                              <td>
                                <a href="${portfolioUrl}" target="_blank" style="display:inline-block;background-color:#2ecc71;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;padding:12px 28px;border-radius:6px;mso-padding-alt:0;">
                                  <!--[if mso]><i style="mso-font-width:150%;mso-text-raise:18pt">&nbsp;</i><![endif]-->
                                  <span style="mso-text-raise:9pt;">View Your Site Preview &rarr;</span>
                                  <!--[if mso]><i style="mso-font-width:150%">&nbsp;</i><![endif]-->
                                </a>
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:24px 0 0 0;text-align:center;">
              <p style="margin:0 0 8px 0;font-size:13px;color:#6b7280;">
                Dhruvil @ CloudGenZ
              </p>
              <p style="margin:0 0 4px 0;font-size:12px;color:#9ca3af;">
                <a href="mailto:dhruvil@cloudgenz.com" style="color:#27ae60;text-decoration:none;">dhruvil@cloudgenz.com</a>
              </p>
              <p style="margin:0;font-size:12px;color:#9ca3af;">
                Call or WhatsApp: <a href="tel:+15197780245" style="color:#27ae60;text-decoration:none;">+1 519-778-0245</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
  ${trackingPixel}
</body>
</html>`;
}

/**
 * Send emails to deployed prospects respecting warm-up ramp.
 */
export async function runMailer(): Promise<{ sent: number; failed: number }> {
  let sent = 0;
  let failed = 0;

  // Check ramp level
  const rampLevel = parseInt(await getSetting('ramp_level') || '0');
  const rampSteps: number[] = JSON.parse(await getSetting('ramp_steps') || '[10,25,50,100,200,300]');
  const dailyLimit = rampSteps[rampLevel] || rampSteps[0];

  // Check how many sent today
  const todayCount = await d1Select<{ count: number }>(
    "SELECT COUNT(*) as count FROM email_log WHERE sent_at >= date('now')"
  );
  const sentToday = todayCount[0]?.count || 0;

  if (sentToday >= dailyLimit) {
    log.info('Daily email limit reached', { sentToday, dailyLimit, rampLevel });
    return { sent: 0, failed: 0 };
  }

  const remaining = dailyLimit - sentToday;

  // Get prospects ready to email (approved, scheduled for today or earlier)
  const prospects = await d1Select<Prospect>(
    `SELECT p.*, n.features as niche_features, n.name as niche_name 
     FROM prospects p 
     LEFT JOIN niches n ON p.niche_id = n.id
     WHERE p.stage = 'approved' 
     AND p.email IS NOT NULL
     AND p.scheduled_send_at <= datetime('now')
     ORDER BY p.scheduled_send_at ASC 
     LIMIT ?`,
    [Math.min(remaining, config.worker.emailMaxPerRun)]
  );

  if (prospects.length === 0) {
    log.info('No prospects ready for email');
    return { sent: 0, failed: 0 };
  }

  for (const prospect of prospects) {
    try {
      // Generate email via AI
      const niche = await d1Select<NicheRow>(
        'SELECT features, name FROM niches WHERE id = ?',
        [prospect.niche_id || '']
      );
      const nicheFeatures = niche[0] ? JSON.parse(niche[0].features).slice(0, 3) : [];
      const nicheName = niche[0]?.name || 'local service';

      const template = prospect.has_website ? 'redesign' : 'no_website';
      const portfolioUrl = `https://${config.portfolio.domain}/portfolio/${prospect.portfolio_slug}`;

      const emailData = await generateEmail(prospect, template, nicheFeatures, nicheName, portfolioUrl);
      
      // Pick subject (alternate A/B)
      const subjectIndex = sent % 2;
      const subject = emailData.subject_options[subjectIndex] || emailData.subject_options[0];

      // Build tracking elements
      const trackingPixel = `<img src="https://${config.portfolio.domain}/api/track/open/${prospect.id}.png" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0;" />`;
      const trackingLink = `https://${config.portfolio.domain}/api/track/click/${prospect.id}`;
      
      // Replace portfolio URL with tracking link in body HTML
      const bodyHtmlWithTracking = emailData.body_html.replace(
        new RegExp(escapeRegex(portfolioUrl), 'g'),
        trackingLink
      );

      // Build the full HTML email
      const fullHtml = buildHtmlEmail({
        bodyHtml: bodyHtmlWithTracking,
        portfolioUrl: trackingLink,
        trackingPixel,
        prospectId: prospect.id,
        businessName: prospect.business_name,
      });

      // Build plain text version
      const plainText = emailData.body_text;

      const messageId = `<${nanoid(24)}@${config.portfolio.domain}>`;

      // Send email with proper headers
      const info = await transporter.sendMail({
        from: `"CloudGenZ" <${config.email.sendingEmail}>`,
        replyTo: config.email.replyToEmail,
        to: prospect.email!,
        bcc: config.email.bccEmail || undefined,
        subject,
        messageId,
        html: fullHtml,
        text: plainText,
        headers: {
          'X-Mailer': 'CloudGenZ-Mailer/1.0',
          'X-Entity-Ref-ID': prospect.id,
          'Feedback-ID': `initial:${prospect.id}:cloudgenz`,
        },
      });

      // Copy to Sent folder so it appears in admin mailbox
      if (info.raw) {
        await copyToSent(info.raw.toString());
      } else if (info.envelope) {
        // Rebuild raw message for IMAP append
        const rawForSent = await buildRawMessage({
          from: `"CloudGenZ" <${config.email.sendingEmail}>`,
          to: prospect.email!,
          subject,
          html: fullHtml,
          text: plainText,
          messageId,
        });
        await copyToSent(rawForSent);
      }

      // Log email
      await d1Execute(
        `INSERT INTO email_log (id, prospect_id, email_type, to_address, subject, body_preview, sent_at, status, message_id)
         VALUES (?, ?, 'initial', ?, ?, ?, datetime('now'), 'sent', ?)`,
        [nanoid(16), prospect.id, prospect.email!, subject, plainText.substring(0, 200), info.messageId]
      );

      // Update prospect stage
      await d1Execute(
        `UPDATE prospects SET stage = 'emailed', email_sent_at = datetime('now'), 
         email_subject = ?, email_template = ?, updated_at = datetime('now') WHERE id = ?`,
        [subject, template, prospect.id]
      );

      sent++;
      log.info('Email sent', { prospectId: prospect.id, to: prospect.email, subject });

      // Random jitter between sends (1-5 min)
      const jitterMs = (60 + Math.random() * 240) * 1000;
      await new Promise(r => setTimeout(r, jitterMs));

    } catch (err: unknown) {
      const error = err as Error;
      failed++;
      log.error('Email send failed', { prospectId: prospect.id, error: error.message });
      
      // Check for bounce
      if (error.message.includes('550') || error.message.includes('bounced')) {
        await d1Execute(
          `INSERT INTO email_log (id, prospect_id, email_type, to_address, subject, sent_at, status, bounce_reason)
           VALUES (?, ?, 'initial', ?, 'BOUNCE', datetime('now'), 'bounced', ?)`,
          [nanoid(16), prospect.id, prospect.email!, error.message]
        );
      }
    }
  }

  // Check ramp advancement
  await checkRampAdvancement(rampLevel, rampSteps);

  log.info('Mailer run complete', { sent, failed });
  return { sent, failed };
}

async function generateEmail(
  prospect: Prospect, 
  template: string, 
  nicheFeatures: string[], 
  nicheName: string,
  portfolioUrl: string
): Promise<EmailGenResult> {
  const ownerName = prospect.owner_name || null;
  const greeting = ownerName ? `Hi ${ownerName}` : 'Hi there';
  
  const htmlInstructions = `
CRITICAL: Return the email body as semantic HTML with ALL styles inline on each element.
Use these inline style patterns:
- Paragraphs: <p style="margin:0 0 16px 0;color:#374151;font-size:15px;line-height:1.7;">
- Bold text: <strong style="color:#1a1a2e;">
- Links (not the main CTA): <a href="..." style="color:#2ecc71;text-decoration:underline;">
- Subtle emphasis: <span style="color:#2ecc71;font-weight:600;">

Do NOT include subject, headers, greetings, or signature in the HTML body - just the email content paragraphs.
Do NOT use <html>, <body>, or <head> tags - just the inner content.
Do NOT include a CTA button - that is added by the template wrapper.

Also provide a plain text version with no HTML (just line breaks between paragraphs).`;

  let prompt: string;
  
  if (template === 'no_website') {
    prompt = `Write a personalized cold email to a local ${nicheName} business owner who does NOT have a website. I've built them a sample site.

Context:
- Owner: ${ownerName || 'Unknown'}
- Business: ${prospect.business_name}
- Location: ${prospect.city}, ${prospect.state_province}
- Google rating: ${prospect.google_rating || 'N/A'}★ (${prospect.google_review_count || 0} reviews)
- Preview link: ${portfolioUrl}

Requirements:
1. Two subject line options (short, curiosity-driven, no spam words like "free", "act now", "limited")
2. Open with "${greeting}"
3. Mention I noticed they don't have a website and built them a sample to show what's possible
4. Highlight these features relevant to their niche: ${nicheFeatures.join(', ')}
5. Reference the preview link naturally in text (the CTA button is added separately)
6. Soft CTA tone - "take a look when you get a chance"
7. Mention "I'll keep this preview up for a couple weeks"
8. Under 120 words for body content
9. Sign off as "Dhruvil" (no company name in signoff - it's in the email template)
10. Tone: friendly, professional, zero pressure - like a developer who genuinely enjoys building things

${htmlInstructions}

Return JSON: {"subject_options": ["Subject 1", "Subject 2"], "body_html": "<p>...</p>", "body_text": "plain text version"}`;
  } else {
    prompt = `Write a personalized cold email to a ${nicheName} business with an outdated website. I've built a modern redesign preview.

Context:
- Owner: ${ownerName || 'Unknown'}
- Business: ${prospect.business_name}
- Current site: ${prospect.website_url}
- PageSpeed mobile score: ${prospect.pagespeed_mobile}/100
- Location: ${prospect.city}, ${prospect.state_province}
- Google rating: ${prospect.google_rating || 'N/A'}★
- Preview link: ${portfolioUrl}

Requirements:
1. Two subject options (short, no spam words)
2. Reference their current site positively first - acknowledge their business
3. Mention PageSpeed: "Your current site scores ${prospect.pagespeed_mobile}/100 on mobile - the redesign I put together scores 95+"
4. Features added: ${nicheFeatures.join(', ')}
5. Reference the preview link naturally (CTA button added separately)
6. Under 120 words
7. Sign off as "Dhruvil"
8. Tone: respectful of their existing work, showing improvement not criticism

${htmlInstructions}

Return JSON: {"subject_options": ["Subject 1", "Subject 2"], "body_html": "<p>...</p>", "body_text": "plain text version"}`;
  }

  return aiCallJson<EmailGenResult>({ prompt, timeout: 120000 });
}

async function checkRampAdvancement(currentLevel: number, steps: number[]) {
  const daysPerStep = parseInt(await getSetting('ramp_days_per_step') || '3');
  const lastStepDate = await getSetting('ramp_last_step_date');
  
  if (!lastStepDate) {
    await setSetting('ramp_last_step_date', new Date().toISOString());
    return;
  }

  const daysSinceStep = (Date.now() - new Date(lastStepDate).getTime()) / (1000 * 60 * 60 * 24);
  
  if (daysSinceStep >= daysPerStep && currentLevel < steps.length - 1) {
    // Check bounce rate before advancing
    const recentEmails = await d1Select<{ total: number; bounced: number }>(
      `SELECT COUNT(*) as total, 
       SUM(CASE WHEN status = 'bounced' THEN 1 ELSE 0 END) as bounced
       FROM email_log WHERE sent_at >= datetime('now', '-3 days')`
    );
    
    const total = recentEmails[0]?.total || 0;
    const bounced = recentEmails[0]?.bounced || 0;
    const bounceRate = total > 0 ? bounced / total : 0;

    if (bounceRate < 0.02) {
      const newLevel = currentLevel + 1;
      await setSetting('ramp_level', String(newLevel));
      await setSetting('ramp_last_step_date', new Date().toISOString());
      log.info('Ramp advanced', { from: currentLevel, to: newLevel, newLimit: steps[newLevel] });
    } else {
      log.warn('Ramp blocked by high bounce rate', { bounceRate, threshold: 0.02 });
    }
  }
}

/**
 * Test SMTP connection
 */
export async function testSmtp(testEmail: string): Promise<boolean> {
  try {
    const info = await transporter.sendMail({
      from: `"CloudGenZ" <${config.email.sendingEmail}>`,
      replyTo: config.email.replyToEmail,
      to: testEmail,
      subject: 'CloudGenZ - Connection Test',
      text: 'If you received this, SMTP is configured correctly.\n\nDhruvil @ CloudGenZ',
      html: buildHtmlEmail({
        bodyHtml: '<p style="margin:0 0 16px 0;color:#374151;font-size:15px;line-height:1.7;">If you received this, <strong style="color:#1a1a2e;">SMTP is configured correctly.</strong></p>',
        portfolioUrl: `https://${config.portfolio.domain}`,
        trackingPixel: '',
        prospectId: 'test',
        businessName: 'Test',
      }),
      headers: {
        'X-Mailer': 'CloudGenZ-Mailer/1.0',
      },
    });
    log.info('SMTP test successful', { messageId: info.messageId, to: testEmail });
    return true;
  } catch (err: unknown) {
    const error = err as Error;
    log.error('SMTP test failed', { error: error.message });
    return false;
  }
}

/**
 * Build a raw RFC822 message string for IMAP APPEND.
 */
async function buildRawMessage(params: {
  from: string;
  to: string;
  subject: string;
  html: string;
  text: string;
  messageId: string;
}): Promise<string> {
  const boundary = `----=_Part_${nanoid(12)}`;
  const date = new Date().toUTCString();

  return [
    `From: ${params.from}`,
    `To: ${params.to}`,
    `Subject: ${params.subject}`,
    `Message-ID: ${params.messageId}`,
    `Date: ${date}`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    `X-Mailer: CloudGenZ-Mailer/1.0`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: quoted-printable',
    '',
    params.text,
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset=utf-8',
    'Content-Transfer-Encoding: quoted-printable',
    '',
    params.html,
    '',
    `--${boundary}--`,
  ].join('\r\n');
}

/**
 * Copy sent message to IMAP Sent folder.
 * So it appears in admin@cloudgenz.com mailbox.
 */
async function copyToSent(rawMessage: string): Promise<void> {
  try {
    const { ImapFlow } = await import('imapflow');
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

    await client.connect();
    await client.append('Sent', rawMessage, ['\\Seen']);
    await client.logout();
    log.debug('Copied to Sent folder');
  } catch (err: unknown) {
    // Non-critical - don't fail the pipeline if IMAP copy fails
    log.warn('Failed to copy to Sent folder', { error: (err as Error).message });
  }
}

/** Escape special regex characters in a string */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

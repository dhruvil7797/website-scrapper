import { json, error, requireAuth } from '../_shared';
import type { Env } from '../_shared';

const MODEL = 'gemini-3.1-flash-lite';

function buildPrompt(mode: 'email' | 'sms', instruction: string, prospect: Record<string, unknown>, settings: Record<string, string>): string {
  const psData = (() => { try { return prospect.pagespeed_data ? JSON.parse(prospect.pagespeed_data as string) : null; } catch { return null; } })();

  const prospectContext = [
    `Business: ${prospect.business_name}`,
    prospect.city ? `City: ${prospect.city}${prospect.state_province ? ', ' + prospect.state_province : ''}` : null,
    prospect.google_rating ? `Rating: ${prospect.google_rating} stars (${prospect.google_review_count} reviews)` : null,
    prospect.website_url ? `Website: ${prospect.website_url}` : 'Website: none',
    prospect.pagespeed_mobile ? `PageSpeed Score: ${prospect.pagespeed_mobile}/100` : null,
    psData?.issues?.length ? `PageSpeed Issues: ${psData.issues.join(', ')}` : null,
    psData?.fcp ? `First Contentful Paint: ${psData.fcp}` : null,
    psData?.lcp ? `Largest Contentful Paint: ${psData.lcp}` : null,
    prospect.owner_name ? `Owner: ${prospect.owner_name}` : null,
    prospect.phone ? `Phone: ${prospect.phone}` : null,
    prospect.niche_name ? `Niche: ${prospect.niche_name}` : null,
  ].filter(Boolean).join('\n');

  const senderContext = `Sender: ${settings.sender_name || 'CloudGenZ'} from ${settings.company_name || 'CloudGenZ'} (${settings.sending_email || 'hello@cloudgenz.com'})\nPortfolio: ${settings.portfolio_link || ''}`;

  if (mode === 'sms') {
    return `You are a web design agency outreach specialist writing a cold outreach SMS.

Tone/instruction: ${instruction}

Prospect data:
${prospectContext}

${senderContext}

Rules:
- Sound like a real human texting, not a template or AI
- Be specific about their business
- Keep it under 300 characters (2 SMS segments max)
- Include a soft call-to-action
- Do NOT start with "Hi there" — use their name if available
- Be conversational and warm

Return ONLY a JSON object with one field:
- body: the SMS text message`;
  }

  return `You are a web design agency outreach specialist writing a cold outreach email.

Tone/instruction: ${instruction}

Prospect data:
${prospectContext}

${senderContext}

Rules:
- Sound like a real human, not a template or AI
- Be specific about their business details
- Keep it concise (under 200 words)
- Include a soft call-to-action
- Do NOT use generic phrases like "I hope this email finds you well"
- Do NOT start with "Dear" — use "Hi [name]" or similar casual opener
- End with sender name, company, and email
- Make it feel like you actually looked at their business

Return ONLY a JSON object with two fields:
- subject: email subject line (short, specific, no clickbait)
- body: plain text email body (use newlines for paragraphs, not HTML)`;
}

// POST /api/ai-draft — generate email/SMS draft using Gemini
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const authErr = requireAuth(context);
  if (authErr) return authErr;

  try {
    const { prospect_id, instruction, mode } = await context.request.json() as {
      prospect_id: string;
      instruction: string;
      mode: 'email' | 'sms';
    };

    if (!instruction) return error('instruction is required');

    // Get prospect
    const prospect = await context.env.DB.prepare(
      'SELECT p.*, n.name as niche_name FROM prospects p LEFT JOIN niches n ON p.niche_id = n.id WHERE p.id = ?'
    ).bind(prospect_id).first();
    if (!prospect) return error('Prospect not found', 404);

    // Get settings
    const settingsRows = await context.env.DB.prepare('SELECT key, value FROM settings').all();
    const settings: Record<string, string> = {};
    for (const row of settingsRows.results as Array<{ key: string; value: string }>) {
      settings[row.key] = row.value;
    }

    const prompt = buildPrompt(mode, instruction, prospect as Record<string, unknown>, settings);

    // Call Gemini API
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${context.env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.8, maxOutputTokens: 1024 },
        }),
        signal: AbortSignal.timeout(15000),
      }
    );

    if (!res.ok) {
      const errBody = await res.text();
      return error(`Gemini API error (${res.status}): ${errBody.substring(0, 200)}`, 502);
    }

    const data = await res.json() as {
      candidates?: Array<{ content: { parts: Array<{ text: string }> } }>;
    };

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return error('Gemini returned no content');

    // Parse JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return error('Could not parse AI response');

    const parsed = JSON.parse(jsonMatch[0]) as { subject?: string; body?: string };
    if (!parsed.body) return error('AI response missing body');

    return json({
      subject: parsed.subject || '',
      body: parsed.body,
      model: MODEL,
    });
  } catch (e) {
    if (e instanceof Error && e.name === 'TimeoutError') {
      return error('AI request timed out — try again', 504);
    }
    return error(e instanceof Error ? e.message : 'AI draft failed', 500);
  }
};

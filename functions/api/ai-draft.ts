import { json, error, requireAuth } from '../_shared';
import type { Env } from '../_shared';

const MODEL = 'gemini-3.1-flash-lite';

function buildPrompt(mode: 'email' | 'sms', instruction: string, prospect: Record<string, unknown>, settings: Record<string, string>): string {
  const psData = (() => { try { return prospect.pagespeed_data ? JSON.parse(prospect.pagespeed_data as string) : null; } catch { return null; } })();

  const prospectContext = [
    `Business: ${prospect.business_name}`,
    prospect.city ? `City: ${prospect.city}${prospect.state_province ? ', ' + prospect.state_province : ''}` : null,
    prospect.google_rating ? `Rating: ${prospect.google_rating} stars (${prospect.google_review_count} reviews)` : null,
    prospect.website_url ? `Website: ${prospect.website_url}` : 'Website: none (no website at all)',
    prospect.pagespeed_mobile ? `PageSpeed Score: ${prospect.pagespeed_mobile}/100 (Google considers 90+ good)` : null,
    psData?.issues?.length ? `PageSpeed Issues: ${psData.issues.join(', ')}` : null,
    psData?.fcp ? `First Contentful Paint: ${psData.fcp} (good is under 1.8s)` : null,
    psData?.lcp ? `Largest Contentful Paint: ${psData.lcp} (good is under 2.5s)` : null,
    prospect.owner_name ? `Owner name: ${prospect.owner_name}` : null,
    prospect.niche_name ? `Industry: ${prospect.niche_name}` : null,
    prospect.has_website === 0 ? `NOTE: This business has NO website at all` : null,
  ].filter(Boolean).join('\n');

  const senderContext = `Sender name: ${settings.sender_name || 'Dhruvil'}\nCompany: ${settings.company_name || 'CloudGenZ'}\nEmail: ${settings.sending_email || 'hello@cloudgenz.com'}\nPortfolio link: ${settings.portfolio_link || ''}`;

  if (mode === 'sms') {
    return `You are writing a cold outreach SMS to a local business owner about web design services.

USER'S INSTRUCTION (follow this closely for tone, angle, and what to emphasize):
${instruction}

PROSPECT DATA:
${prospectContext}

SENDER:
${senderContext}

WRITING RULES — these are non-negotiable:
1. MAX 280 characters. Every character counts. No filler words.
2. First 40 characters must hook — lead with THEIR business name or a specific fact
3. Use their owner name if available, otherwise their business name
4. ONE clear ask at the end (call, text back, or visit link)
5. Write like you're texting a friend. Simple words. Short sentences.
6. DO NOT use: "Hi there", "I noticed", exclamation marks, emojis, "potential leads", "currently", "specialize"
7. Reference ONE specific thing about their business (rating, location, broken site)
8. Include the portfolio link only if it fits within the character limit

GOOD SMS EXAMPLES:
- "Hey Mike, your 4.8 stars at Smith Plumbing caught my eye. Your website loads in 20s though — customers are leaving before they can call. Quick fix possible. Mind if I share details? -Dhruvil"
- "Miller Plumbing has great reviews but no website. 60% of customers search online before calling a plumber. I build sites for plumbing businesses in Burnaby — worth a quick call? -Dhruvil"

Return ONLY a JSON object: {"body": "the sms text"}`;
  }

  return `You are writing a cold outreach email to a local business owner about web design services.

USER'S INSTRUCTION (follow this closely for tone, angle, and what to emphasize):
${instruction}

PROSPECT DATA:
${prospectContext}

SENDER:
${senderContext}

CONVERSION FRAMEWORK — follow this structure:
1. HOOK (1 sentence): Reference something specific about THEIR business. Their rating, their city, their industry, or something you noticed about their website. Make them feel seen, not targeted.
2. PROBLEM (2-3 sentences): Connect their specific situation to a real business impact. Use their data — if PageSpeed is 38/100, say that. If they have no website, say what they're missing. Be specific, not generic.
3. PROOF (1 sentence): Mention you specialize in their industry. Link to portfolio.
4. CTA (1 sentence): Soft ask. Not "buy now" — ask for a conversation. "Would a quick call be worth it?" or "Open to seeing what this could look like?"

WRITING RULES — these are non-negotiable:
1. Under 120 words total. Short paragraphs (1-2 sentences each). Lots of white space.
2. Subject line: 5-8 words, specific to their business, no clickbait, no caps
3. Open with "Hi [owner name]" or "Hi [business name] team" — never "Dear", never "Hello"
4. WRITE AT A GRADE 6 READING LEVEL. Use simple, everyday words. No business jargon.
   - Say "broken" not "suspension error"
   - Say "losing customers" not "losing potential leads to competitors"
   - Say "people" not "residents"
   - Say "shows" not "demonstrates" or "indicates"
   - Say "fix" not "resolve" or "address"
   - Say "call" not "conversation" or "discussion"
   - Say "looks great" not "high-performing"
   - NEVER use: "leverage", "optimize", "ensure", "utilize", "synergy", "specialize in", "high-performing", "potential leads", "currently", "clearly"
5. Write like you're texting a friend who owns a business, not writing a business letter
6. Use their actual numbers — rating, review count, PageSpeed score, load time
7. ONE clear CTA at the end. Keep it casual: "Worth a quick call?" or "Mind if I show you?"
8. Sign off with just: first name, company, email. Nothing else.
9. Read the draft out loud — if any sentence sounds like it came from a marketing email, rewrite it in plain English

BAD EXAMPLE (too formal, jargon-heavy):
"Your online presence is currently experiencing technical difficulties. Every hour that page stays down, you are losing potential leads to competitors who show up when residents search for emergency plumbing services. A broken site tells customers you are no longer in business."

GOOD EXAMPLE (simple, human, conversational):
"Your website is showing an error page right now. When someone in Burnaby Googles 'plumber near me' and lands on a broken page, they just call the next one. With 4.9 stars and 102 reviews, you deserve a site that actually works for you."

Return ONLY a JSON object with two fields:
{"subject": "short specific subject", "body": "plain text body with newlines between paragraphs"}`;
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

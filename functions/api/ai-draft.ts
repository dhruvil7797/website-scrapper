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

  const senderContext = `Sender name: ${settings.sender_name || 'Dhruvil'}\nCompany: ${settings.company_name || 'CloudGenZ'}\nEmail: ${settings.sending_email || 'hello@cloudgenz.com'}\nPortfolio link: ${settings.portfolio_link || ''}\nBooking link: ${settings.calendly_link || ''}`;
  const nicheStr = prospect.niche_name ? ` (${prospect.niche_name})` : '';

  if (mode === 'sms') {
    return `You are writing a cold outreach SMS to a local business owner${nicheStr} about web design services.

USER'S INSTRUCTION: ${instruction}

PROSPECT DATA:
${prospectContext}

SENDER:
${senderContext}

RULES:
1. MAX 280 characters total
2. Lead with THEIR business name or a specific fact about them
3. Use owner name if available
4. ONE ask at the end (call, text back, or visit link)
5. Write like texting a friend. Simple words. Short sentences.
6. NEVER use: "Hi there", "I noticed", "potential leads", "currently", "specialize", "leverage"
7. If space allows, mention ONE feature that would help their type of business. For example:
   - Plumber → online booking, emergency call button
   - Barber → appointment scheduling, gallery of cuts
   - Dentist → online booking, insurance info page
   - Restaurant → online menu, reservation system
   Explain what it does for them in a few words, not just the feature name.

Return ONLY: {"body": "the sms text"}`;
  }

  return `You are writing a cold outreach email to a local business owner${nicheStr} about web design services.

USER'S INSTRUCTION: ${instruction}

PROSPECT DATA:
${prospectContext}

SENDER:
${senderContext}

EMAIL STRUCTURE — follow this order:
1. HOOK (1 sentence): Something specific about THEIR business — rating, city, what you saw.
2. PROBLEM (1-2 sentences): What's wrong and how it hurts them. Use their actual numbers.
3. FEATURES (2-3 short bullet points): Based on their industry, suggest 2-3 website features that would actually help their business. For each one, say what it is AND what it does for them in simple words.

   Think about what makes sense for a ${prospect.niche_name || 'local service'} business:
   - Plumber → "Online booking — customers schedule a job without calling" / "Emergency call button — people with burst pipes reach you in one tap" / "Service area map — locals know you cover their neighborhood"
   - Barber/Salon → "Appointment booking — no more phone tag or no-shows" / "Gallery of your work — your best cuts sell themselves" / "Price list — customers know what to expect before walking in"
   - Dentist → "Online appointment form — patients book when they have a toothache at midnight" / "Insurance page — answers the #1 question every new patient has" / "Team photos — people want to see who's working on their teeth"
   - Restaurant → "Menu page — 70% of diners check the menu before showing up" / "Online reservations — fill empty tables without picking up the phone" / "Hours + location on Google — so nobody shows up when you're closed"
   - Auto Mechanic → "Online booking — customers schedule from the parking lot" / "Service list — people see you do brakes, not just oil changes" / "Review highlights — your 4.8 stars front and center"
   - Cleaning → "Quote calculator — visitors type in their home size and get a price" / "Booking form — turn visitors into booked jobs"
   - General → "Contact form — turn visitors into calls" / "Mobile-friendly design — most searches are from phones" / "Google Maps listing — show up in 'near me' searches"

   Pick features that fit THIS business. Don't copy the examples word-for-word. Adapt them.

4. PROOF (1 sentence): Portfolio link.
5. CTA (1 sentence): If a booking link is provided, use it: "Pick a time that works for you: [booking link]". If no booking link, use a soft ask: "Worth a quick call?"

WRITING RULES:
1. Under 150 words. Short paragraphs. Lots of white space.
2. Subject line: 5-8 words, about their business, no clickbait
3. Open with "Hi [name]" — never "Dear" or "Hello"
4. GRADE 6 READING LEVEL. Simple everyday words only.
   - "broken" not "suspension error"
   - "losing customers" not "losing potential leads"
   - "people" not "residents"
   - "fix" not "resolve"
   - BANNED: "leverage", "optimize", "ensure", "utilize", "specialize in", "high-performing", "potential leads", "currently", "clearly", "synergy"
5. Write like texting a friend who owns a business
6. Use their actual numbers (rating, score, load time)
7. Sign off: first name, company, email. Nothing else.
8. Read it out loud. If it sounds like a marketing email, rewrite it simpler.

GOOD EXAMPLE:
"Hi John,

4.7 stars and 89 reviews — your customers trust you. But your website takes 20 seconds to load on a phone. Most people give up after 3.

A few things that could help:
- Online booking — so customers schedule a job without calling
- Emergency button — people with burst pipes reach you in one tap
- Service area map — so locals know you cover their neighborhood

Here's what that looks like: [portfolio link]

Want to chat about it? Pick a time here: [booking link]

Dhruvil
CloudGenZ
hello@cloudgenz.com"

Return ONLY: {"subject": "short subject", "body": "plain text with newlines"}`;
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

    const prospect = await context.env.DB.prepare(
      'SELECT p.*, n.name as niche_name FROM prospects p LEFT JOIN niches n ON p.niche_id = n.id WHERE p.id = ?'
    ).bind(prospect_id).first();
    if (!prospect) return error('Prospect not found', 404);

    const settingsRows = await context.env.DB.prepare('SELECT key, value FROM settings').all();
    const settings: Record<string, string> = {};
    for (const row of settingsRows.results as Array<{ key: string; value: string }>) {
      settings[row.key] = row.value;
    }

    const prompt = buildPrompt(mode, instruction, prospect as Record<string, unknown>, settings);

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

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return error('Could not parse AI response');

    const parsed = JSON.parse(jsonMatch[0]) as { subject?: string; body?: string };
    if (!parsed.body) return error('AI response missing body');

    return json({ subject: parsed.subject || '', body: parsed.body, model: MODEL });
  } catch (e) {
    if (e instanceof Error && e.name === 'TimeoutError') {
      return error('AI request timed out — try again', 504);
    }
    return error(e instanceof Error ? e.message : 'AI draft failed', 500);
  }
};

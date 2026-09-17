import { json, error, requireAuth } from '../_shared';
import type { Env } from '../_shared';

const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const IGNORE_EMAILS = new Set(['example@example.com', 'email@example.com', 'your@email.com', 'name@domain.com', 'info@w3.org', 'noreply@', 'no-reply@']);

function cleanEmails(raw: string[]): string[] {
  const seen = new Set<string>();
  return raw.filter(e => {
    const lower = e.toLowerCase();
    if (seen.has(lower)) return false;
    if (IGNORE_EMAILS.has(lower)) return false;
    if (lower.endsWith('.png') || lower.endsWith('.jpg') || lower.endsWith('.gif')) return false;
    if (lower.includes('wixpress') || lower.includes('sentry') || lower.includes('webpack')) return false;
    seen.add(lower);
    return true;
  });
}

async function scrapeEmails(websiteUrl: string): Promise<string[]> {
  const emails: string[] = [];
  const urls = [websiteUrl];

  // Try common contact page paths
  try {
    const base = new URL(websiteUrl).origin;
    urls.push(`${base}/contact`, `${base}/contact-us`, `${base}/about`, `${base}/about-us`);
  } catch { /* invalid URL */ }

  for (const url of urls) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; CloudGenZ/1.0)' },
        redirect: 'follow',
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) continue;
      const html = await res.text();

      // Extract from HTML
      const found = html.match(EMAIL_REGEX) || [];
      emails.push(...found);

      // Extract from mailto: links
      const mailtos = html.match(/mailto:([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g) || [];
      for (const m of mailtos) {
        emails.push(m.replace('mailto:', ''));
      }
    } catch {
      // timeout or fetch error — skip this URL
    }
  }

  return cleanEmails(emails);
}

// POST /api/scrape-email — scrape email for a single prospect
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const authErr = requireAuth(context);
  if (authErr) return authErr;

  try {
    const { prospect_id } = await context.request.json() as { prospect_id: string };
    if (!prospect_id) return error('prospect_id required');

    const prospect = await context.env.DB.prepare('SELECT id, website_url, email FROM prospects WHERE id = ?').bind(prospect_id).first<{ id: string; website_url: string | null; email: string | null }>();
    if (!prospect) return error('Prospect not found', 404);
    if (!prospect.website_url) return error('Prospect has no website to scrape');

    const emails = await scrapeEmails(prospect.website_url);

    if (emails.length > 0) {
      await context.env.DB.prepare('UPDATE prospects SET email = ?, updated_at = datetime(\'now\') WHERE id = ?').bind(emails[0], prospect_id).run();
      return json({ email: emails[0], all_found: emails });
    }

    return json({ email: null, all_found: [] });
  } catch (e) {
    return error(e instanceof Error ? `Scrape failed: ${e.message}` : 'Scrape failed', 500);
  }
};

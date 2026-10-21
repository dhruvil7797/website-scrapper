import { json, error, requireAuth } from '../_shared';
import type { Env } from '../_shared';
import { scoreProspect } from './score';

// ─── Constants ───────────────────────────────────────────────────────────────

const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const IGNORE_EMAILS = new Set([
  'example@example.com', 'email@example.com', 'your@email.com',
  'name@domain.com', 'info@w3.org', 'noreply@', 'no-reply@',
]);
const COPYRIGHT_YEAR_REGEX = /(?:©|\bcopyright\b)\s*(\d{4})/gi;
const STALE_COPYRIGHT_YEARS = 2;

// ─── Email Scraping ──────────────────────────────────────────────────────────

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

  try {
    const base = new URL(websiteUrl).origin;
    urls.push(`${base}/contact`, `${base}/contact-us`, `${base}/about`, `${base}/about-us`);
  } catch { /* invalid URL */ }

  for (const url of urls) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; CloudGenZ/1.0)' },
        redirect: 'follow',
        signal: AbortSignal.timeout(4000),
      });
      if (!res.ok) continue;
      const html = await res.text();
      const found = html.match(EMAIL_REGEX) || [];
      emails.push(...found);
      const mailtos = html.match(/mailto:([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g) || [];
      for (const m of mailtos) emails.push(m.replace('mailto:', ''));
    } catch { /* timeout or fetch error — skip */ }
  }

  return cleanEmails(emails);
}

// ─── Website Audit ───────────────────────────────────────────────────────────

async function auditWebsite(websiteUrl: string): Promise<string[]> {
  const issues: string[] = [];

  if (websiteUrl.startsWith('http://')) {
    issues.push('no_ssl');
  }

  try {
    const res = await fetch(websiteUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; CloudGenZ/1.0)' },
      redirect: 'follow',
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      issues.push('homepage_unreachable');
      return issues;
    }

    const html = await res.text();
    const htmlLower = html.toLowerCase();
    const pageSize = new TextEncoder().encode(html).length;

    // Facebook redirect
    const finalUrl = res.url || websiteUrl;
    if (finalUrl.includes('facebook.com') || finalUrl.includes('fb.com')) {
      issues.push('facebook_redirect');
    }

    // Mobile-friendly
    if (!htmlLower.includes('viewport')) {
      issues.push('no_viewport_meta');
    }

    // Favicon
    if (!htmlLower.includes('favicon') && !htmlLower.includes('rel="icon"') && !htmlLower.includes("rel='icon'") && !htmlLower.includes('rel="shortcut icon"')) {
      issues.push('no_favicon');
    }

    // Stale copyright year
    const currentYear = new Date().getFullYear();
    let latestCopyrightYear = 0;
    let match: RegExpExecArray | null;
    const crRegex = new RegExp(COPYRIGHT_YEAR_REGEX.source, 'gi');
    while ((match = crRegex.exec(html)) !== null) {
      const year = parseInt(match[1], 10);
      if (year > latestCopyrightYear && year <= currentYear) latestCopyrightYear = year;
    }
    if (latestCopyrightYear > 0 && (currentYear - latestCopyrightYear) >= STALE_COPYRIGHT_YEARS) {
      issues.push(`stale_copyright_${latestCopyrightYear}`);
    }

    // Builder platform detection
    if (htmlLower.includes('wix.com') || htmlLower.includes('wixsite.com') || htmlLower.includes('x-wix-')) {
      issues.push('wix_site');
    }
    if (htmlLower.includes('weebly.com') || htmlLower.includes('weebly-footer')) {
      issues.push('weebly_site');
    }
    if (htmlLower.includes('godaddy.com/websites') || htmlLower.includes('godaddy-ws')) {
      issues.push('godaddy_site');
    }

    // WordPress version
    const wpMatch = html.match(/meta\s+name=["']generator["']\s+content=["']WordPress\s+([\d.]+)["']/i);
    if (wpMatch) {
      issues.push(`wordpress_${wpMatch[1]}`);
    }

    // Heavy page (>5MB HTML)
    if (pageSize > 5 * 1024 * 1024) {
      issues.push('heavy_page');
    }
  } catch {
    issues.push('audit_fetch_failed');
  }

  return issues;
}

// ─── Main Handler ────────────────────────────────────────────────────────────
// Phase 2: ENRICH a single prospect — email scraping + website audit + re-score.
// Called one prospect at a time (from frontend batch loop or manual click).
// Typical wall-clock: 5-12 seconds. Well within CF Worker limits.

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const authErr = requireAuth(context);
  if (authErr) return authErr;

  const { prospect_id } = await context.request.json() as { prospect_id: string };
  if (!prospect_id) return error('prospect_id required');

  const prospect = await context.env.DB.prepare(
    `SELECT p.*, n.name as niche_name FROM prospects p LEFT JOIN niches n ON p.niche_id = n.id WHERE p.id = ?`
  ).bind(prospect_id).first<{
    id: string; website_url: string | null; email: string | null; phone: string | null;
    google_rating: number | null; google_review_count: number | null;
    google_types: string | null; pagespeed_mobile: number | null;
    quality_score: number; score_breakdown: string | null;
  }>();

  if (!prospect) return error('Prospect not found', 404);

  let emailFound: string | null = prospect.email;
  let allEmails: string[] = [];
  let websiteIssues: string[] = [];
  let enriched = false;

  // ── Email scraping (only if has website and no email yet) ──
  if (prospect.website_url && !prospect.email) {
    try {
      allEmails = await scrapeEmails(prospect.website_url);
      if (allEmails.length > 0) {
        emailFound = allEmails[0];
        await context.env.DB.prepare(
          `UPDATE prospects SET email = ?, updated_at = datetime('now') WHERE id = ?`
        ).bind(emailFound, prospect_id).run();
        enriched = true;
      }
    } catch { /* best-effort */ }
  }

  // ── Website audit (only if has website) ──
  if (prospect.website_url) {
    try {
      websiteIssues = await auditWebsite(prospect.website_url);
      if (websiteIssues.length > 0) {
        await context.env.DB.prepare(
          `UPDATE prospects SET website_issues = ?, updated_at = datetime('now') WHERE id = ?`
        ).bind(JSON.stringify(websiteIssues), prospect_id).run();
        enriched = true;
      }
    } catch { /* best-effort */ }
  }

  // ── Re-score with enriched data ──
  const { score, breakdown, tier, reasons } = scoreProspect({
    website_url: prospect.website_url,
    phone: prospect.phone,
    google_rating: prospect.google_rating,
    google_review_count: prospect.google_review_count,
    email: emailFound,
    pagespeed_mobile: prospect.pagespeed_mobile,
    website_issues: websiteIssues.length > 0 ? websiteIssues : null,
    google_types: prospect.google_types,
  });

  await context.env.DB.prepare(
    `UPDATE prospects SET quality_score = ?, score_breakdown = ?, tier = ?, reasons = ?, updated_at = datetime('now') WHERE id = ?`
  ).bind(score, JSON.stringify(breakdown), tier, JSON.stringify(reasons), prospect_id).run();

  return json({
    enriched,
    email: emailFound,
    all_emails: allEmails,
    website_issues: websiteIssues,
    score,
    tier,
    reasons,
  });
};

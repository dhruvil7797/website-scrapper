import { json, error, requireAuth } from '../_shared';
import type { Env } from '../_shared';

// Audit IDs we care about and human-friendly labels
const AUDIT_CHECKS: { id: string; label: string }[] = [
  { id: 'render-blocking-resources', label: 'Render-blocking resources (CSS/JS)' },
  { id: 'uses-optimized-images', label: 'Unoptimized images' },
  { id: 'uses-responsive-images', label: 'Oversized images' },
  { id: 'offscreen-images', label: 'Images not lazy-loaded' },
  { id: 'unused-css-rules', label: 'Unused CSS code' },
  { id: 'unused-javascript', label: 'Unused JavaScript' },
  { id: 'uses-text-compression', label: 'No text compression' },
  { id: 'uses-long-cache-ttl', label: 'No browser caching' },
  { id: 'server-response-time', label: 'Slow server response' },
  { id: 'font-display', label: 'Font blocking render' },
  { id: 'third-party-summary', label: 'Heavy third-party scripts' },
  { id: 'total-byte-weight', label: 'Large page size' },
  { id: 'dom-size', label: 'Excessive DOM size' },
  { id: 'viewport', label: 'Not mobile-optimized' },
];

interface LighthouseAudit {
  score: number | null;
  displayValue?: string;
}

interface PSIResponse {
  lighthouseResult?: {
    categories?: {
      performance?: { score: number };
    };
    audits?: Record<string, LighthouseAudit>;
  };
  error?: { message: string };
}

function extractFromAPI(data: PSIResponse): {
  score: number | null;
  fcp: string | null;
  lcp: string | null;
  tbt: string | null;
  cls: string | null;
  si: string | null;
  issues: string[];
} {
  const result = {
    score: null as number | null,
    fcp: null as string | null,
    lcp: null as string | null,
    tbt: null as string | null,
    cls: null as string | null,
    si: null as string | null,
    issues: [] as string[],
  };

  const lh = data.lighthouseResult;
  if (!lh) return result;

  // Performance score (0-1 → 0-100)
  if (lh.categories?.performance?.score != null) {
    result.score = Math.round(lh.categories.performance.score * 100);
  }

  const audits = lh.audits || {};

  // Core Web Vitals
  if (audits['first-contentful-paint']?.displayValue) result.fcp = audits['first-contentful-paint'].displayValue;
  if (audits['largest-contentful-paint']?.displayValue) result.lcp = audits['largest-contentful-paint'].displayValue;
  if (audits['total-blocking-time']?.displayValue) result.tbt = audits['total-blocking-time'].displayValue;
  if (audits['cumulative-layout-shift']?.displayValue) result.cls = audits['cumulative-layout-shift'].displayValue;
  if (audits['speed-index']?.displayValue) result.si = audits['speed-index'].displayValue;

  // Failing audits
  for (const check of AUDIT_CHECKS) {
    const audit = audits[check.id];
    if (audit && audit.score !== null && audit.score < 0.9) {
      result.issues.push(check.label);
    }
  }

  return result;
}

// POST /api/pagespeed — analyze a prospect's website via Google PageSpeed Insights API
// Two modes:
//   1. { prospect_id } — triggers API call directly using prospect's website_url
//   2. { prospect_id, report_url } — legacy: fetch from pagespeed.web.dev URL (kept for backward compat)
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const authErr = requireAuth(context);
  if (authErr) return authErr;

  try {
    const body = await context.request.json() as {
      prospect_id: string;
      report_url?: string;  // legacy — kept for backward compat
    };

    if (!body.prospect_id) return error('prospect_id required');

    const prospect = await context.env.DB.prepare(
      'SELECT id, website_url FROM prospects WHERE id = ?'
    ).bind(body.prospect_id).first<{ id: string; website_url: string | null }>();

    if (!prospect) return error('Prospect not found', 404);
    if (!prospect.website_url) return error('Prospect has no website to analyze');

    // Call Google PageSpeed Insights API directly
    const apiUrl = new URL('https://www.googleapis.com/pagespeedonline/v5/runPagespeed');
    apiUrl.searchParams.set('url', prospect.website_url);
    apiUrl.searchParams.set('key', context.env.GOOGLE_API_KEY);
    apiUrl.searchParams.set('strategy', 'mobile');
    apiUrl.searchParams.set('category', 'performance');

    const res = await fetch(apiUrl.toString(), {
      signal: AbortSignal.timeout(25000), // PSI can take 15-25s
    });

    if (!res.ok) {
      const errBody = await res.text();
      // If the target site is unreachable, PSI returns 400 with a specific message
      if (res.status === 400 && errBody.includes('FAILED_DOCUMENT_REQUEST')) {
        return error('Website is unreachable — PageSpeed could not load it');
      }
      if (res.status === 429) {
        return error('PageSpeed API rate limit hit — try again in a minute');
      }
      return error(`PageSpeed API error (${res.status}): ${errBody.substring(0, 200)}`, 502);
    }

    const apiData = await res.json() as PSIResponse;

    if (apiData.error) {
      return error(`PageSpeed error: ${apiData.error.message}`);
    }

    const data = extractFromAPI(apiData);

    if (data.score === null) {
      return error('Could not extract performance score — the site may have blocked Lighthouse');
    }

    // Build the pagespeed.web.dev report URL for reference
    const reportUrl = `https://pagespeed.web.dev/analysis?url=${encodeURIComponent(prospect.website_url)}&form_factor=mobile`;

    // Store results on prospect
    const fullData = { ...data, report_url: reportUrl };
    await context.env.DB.prepare(
      `UPDATE prospects SET pagespeed_mobile = ?, pagespeed_data = ?, updated_at = datetime('now') WHERE id = ?`
    ).bind(data.score, JSON.stringify(fullData), body.prospect_id).run();

    // Re-score the prospect with the new pagespeed data
    // Import scoring if available, otherwise do inline update
    const current = await context.env.DB.prepare(
      'SELECT quality_score, score_breakdown, website_issues, tier, reasons FROM prospects WHERE id = ?'
    ).bind(body.prospect_id).first<{
      quality_score: number; score_breakdown: string | null;
      website_issues: string | null; tier: string | null; reasons: string | null;
    }>();

    if (current?.score_breakdown) {
      try {
        const breakdown = JSON.parse(current.score_breakdown) as Record<string, number>;
        // Remove old pagespeed entries
        delete breakdown.poor_mobile;
        delete breakdown.very_slow;
        delete breakdown.slow_website;
        delete breakdown.mediocre_speed;
        // Add new ones
        if (data.score < 50) {
          breakdown.slow_website = 10;
        } else if (data.score < 70) {
          breakdown.mediocre_speed = 5;
        }
        const newScore = Math.max(0, Math.min(100, Object.values(breakdown).reduce((a, c) => a + c, 0)));

        // Re-derive tier
        const hasWebsite = true; // we know they have one since we analyzed it
        const tier = newScore >= 60 ? 'hot' : newScore >= 35 ? 'warm' : newScore >= 15 ? 'cold' : 'skip';

        // Update reasons with pagespeed info
        let reasons: string[] = [];
        try { reasons = current.reasons ? JSON.parse(current.reasons) : []; } catch { reasons = []; }
        // Remove old pagespeed reasons
        reasons = reasons.filter(r => !r.includes('PageSpeed') && !r.includes('very slow') && !r.includes('mediocre'));
        if (data.score < 50) reasons.push(`Website is very slow (PageSpeed ${data.score}/100)`);
        else if (data.score < 70) reasons.push(`Website is mediocre (PageSpeed ${data.score}/100)`);

        await context.env.DB.prepare(
          `UPDATE prospects SET quality_score = ?, score_breakdown = ?, tier = ?, reasons = ? WHERE id = ?`
        ).bind(newScore, JSON.stringify(breakdown), tier, JSON.stringify(reasons), body.prospect_id).run();
      } catch { /* ignore scoring errors — data is still saved */ }
    }

    return json(fullData);
  } catch (e) {
    if (e instanceof Error && e.name === 'TimeoutError') {
      return error('PageSpeed analysis timed out (site too slow or unresponsive) — try again', 504);
    }
    return error(e instanceof Error ? e.message : 'PageSpeed analysis failed', 500);
  }
};

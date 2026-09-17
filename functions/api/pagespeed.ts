import { json, error, requireAuth } from '../_shared';
import type { Env } from '../_shared';

function extractFromReport(html: string): {
  score: number | null;
  fcp: string | null;
  lcp: string | null;
  tbt: string | null;
  cls: string | null;
  si: string | null;
  issues: string[];
} {
  const result = { score: null as number | null, fcp: null as string | null, lcp: null as string | null, tbt: null as string | null, cls: null as string | null, si: null as string | null, issues: [] as string[] };

  // Data is double-escaped JSON inside AF_initDataCallback
  const perf = html.match(/\\"id\\":\s*\\"performance\\".*?\\"score\\":\s*([0-9.]+)/);
  if (perf) result.score = Math.round(parseFloat(perf[1]) * 100);

  const fcp = html.match(/\\"first-contentful-paint\\".*?\\"displayValue\\":\s*\\"([^\\]+)/);
  if (fcp) result.fcp = fcp[1].replace(/\\u00a0/g, ' ');

  const lcp = html.match(/\\"largest-contentful-paint\\".*?\\"displayValue\\":\s*\\"([^\\]+)/);
  if (lcp) result.lcp = lcp[1].replace(/\\u00a0/g, ' ');

  const tbt = html.match(/\\"total-blocking-time\\".*?\\"displayValue\\":\s*\\"([^\\]+)/);
  if (tbt) result.tbt = tbt[1].replace(/\\u00a0/g, ' ');

  const cls = html.match(/\\"cumulative-layout-shift\\".*?\\"displayValue\\":\s*\\"([^\\]+)/);
  if (cls) result.cls = cls[1].replace(/\\u00a0/g, ' ');

  const si = html.match(/\\"speed-index\\".*?\\"displayValue\\":\s*\\"([^\\]+)/);
  if (si) result.si = si[1].replace(/\\u00a0/g, ' ');

  // Extract failing audits
  const auditChecks: { pattern: string; label: string }[] = [
    { pattern: 'render-blocking-resources', label: 'Render-blocking resources (CSS/JS)' },
    { pattern: 'uses-optimized-images', label: 'Unoptimized images' },
    { pattern: 'uses-responsive-images', label: 'Oversized images' },
    { pattern: 'offscreen-images', label: 'Images not lazy-loaded' },
    { pattern: 'unused-css-rules', label: 'Unused CSS code' },
    { pattern: 'unused-javascript', label: 'Unused JavaScript' },
    { pattern: 'uses-text-compression', label: 'No text compression' },
    { pattern: 'uses-long-cache-ttl', label: 'No browser caching' },
    { pattern: 'server-response-time', label: 'Slow server response' },
    { pattern: 'font-display', label: 'Font blocking render' },
    { pattern: 'third-party-summary', label: 'Heavy third-party scripts' },
    { pattern: 'total-byte-weight', label: 'Large page size' },
    { pattern: 'dom-size', label: 'Excessive DOM size' },
    { pattern: 'viewport', label: 'Not mobile-optimized' },
  ];

  for (const check of auditChecks) {
    // Look for this audit with a failing score (score: 0 or score < 0.5)
    const auditRegex = new RegExp(`\\\\"${check.pattern}\\\\".*?\\\\"score\\\\":\\s*([0-9.]+)`, 's');
    const m = html.match(auditRegex);
    if (m) {
      const s = parseFloat(m[1]);
      if (s < 0.9) result.issues.push(check.label);
    }
  }

  return result;
}

// POST /api/pagespeed — fetch data from a pagespeed.web.dev report URL
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const authErr = requireAuth(context);
  if (authErr) return authErr;

  try {
    const { prospect_id, report_url } = await context.request.json() as { prospect_id: string; report_url: string };
    if (!prospect_id || !report_url) return error('prospect_id and report_url required');
    if (!report_url.includes('pagespeed.web.dev')) return error('URL must be from pagespeed.web.dev');

    const prospect = await context.env.DB.prepare('SELECT id, website_url FROM prospects WHERE id = ?').bind(prospect_id).first<{ id: string; website_url: string | null }>();
    if (!prospect) return error('Prospect not found', 404);

    // Fetch the web.dev report page (HTML with embedded Lighthouse JSON)
    const res = await fetch(report_url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; CloudGenZ/1.0)' },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) return error(`Could not fetch report (${res.status})`, 502);

    const html = await res.text();
    if (html.length < 1000) return error('Report page is empty — the URL may be invalid');

    const data = extractFromReport(html);
    if (data.score === null) return error('Could not extract score from report. Make sure the report has finished loading on pagespeed.web.dev before copying the URL.');

    // Store on prospect
    await context.env.DB.prepare(
      'UPDATE prospects SET pagespeed_mobile = ?, pagespeed_data = ?, updated_at = datetime(\'now\') WHERE id = ?'
    ).bind(data.score, JSON.stringify(data), prospect_id).run();

    // Update quality score
    const current = await context.env.DB.prepare('SELECT score_breakdown FROM prospects WHERE id = ?').bind(prospect_id).first<{ score_breakdown: string | null }>();
    if (current?.score_breakdown) {
      try {
        const breakdown = JSON.parse(current.score_breakdown) as Record<string, number>;
        delete breakdown.poor_mobile;
        delete breakdown.very_slow;
        if (data.score < 50) breakdown.poor_mobile = 15;
        if (data.score < 30) breakdown.very_slow = 10;
        const newScore = Math.max(0, Math.min(100, Object.values(breakdown).reduce((a, c) => a + c, 0)));
        await context.env.DB.prepare('UPDATE prospects SET quality_score = ?, score_breakdown = ? WHERE id = ?').bind(newScore, JSON.stringify(breakdown), prospect_id).run();
      } catch { /* ignore */ }
    }

    return json({ ...data, report_url });
  } catch (e) {
    if (e instanceof Error && e.name === 'TimeoutError') {
      return error('Timed out fetching report page', 504);
    }
    return error(e instanceof Error ? e.message : 'Failed', 500);
  }
};

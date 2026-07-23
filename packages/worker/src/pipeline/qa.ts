import puppeteer from 'puppeteer';
import { d1Select, d1Execute, r2Download, getSetting } from '../services/cloudflare.js';
import { aiCallJson } from '../services/ai.js';
import { createLogger } from '../services/logger.js';
import { writeFileSync, unlinkSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const log = createLogger('qa');

interface ProspectRow {
  id: string;
  business_name: string;
  generated_site_key: string;
  portfolio_slug: string;
  niche_id: string | null;
}

interface QaResult {
  score: number;
  pass: boolean;
  issues: string[];
  strengths: string[];
}

/**
 * QA score generated sites - take screenshot of generated HTML, AI evaluates quality.
 */
export async function runQa(): Promise<{ passed: number; failed: number }> {
  let passed = 0;
  let failed = 0;

  const threshold = parseFloat(await getSetting('qa_confidence_threshold') || '0.85');

  // Get prospects at 'generated' stage
  const prospects = await d1Select<ProspectRow>(
    `SELECT id, business_name, generated_site_key, portfolio_slug, niche_id
     FROM prospects 
     WHERE stage = 'generated'
     AND (locked_until IS NULL OR locked_until < datetime('now'))
     ORDER BY quality_score DESC
     LIMIT 10`,
    []
  );

  if (prospects.length === 0) {
    log.info('No prospects for QA');
    return { passed: 0, failed: 0 };
  }

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });

  try {
    for (const prospect of prospects) {
      try {
        // Lock
        await d1Execute(
          `UPDATE prospects SET locked_until = datetime('now', '+5 minutes'), locked_by = 'qa' WHERE id = ?`,
          [prospect.id]
        );

        // Download generated HTML from R2
        const htmlBuffer = await r2Download(prospect.generated_site_key);
        const html = htmlBuffer.toString('utf-8');

        // Write to temp file for Puppeteer to render
        const tmpPath = join(tmpdir(), `qa-${prospect.id}.html`);
        writeFileSync(tmpPath, html);

        // Take screenshot of generated site
        const page = await browser.newPage();
        await page.setViewport({ width: 1440, height: 900 });
        await page.goto(`file://${tmpPath}`, { waitUntil: 'domcontentloaded' });
        await page.evaluate(() => new Promise(r => setTimeout(r, 1000)));

        const screenshot = await page.screenshot({ type: 'png', fullPage: false }) as Buffer;
        await page.close();

        // Clean up temp file
        if (existsSync(tmpPath)) unlinkSync(tmpPath);

        // AI QA evaluation
        const qaPrompt = `You are a web design quality assurance reviewer. Analyze this website that was generated for "${prospect.business_name}" (a ${prospect.niche_id || 'local'} business).

Rate it on a 0.0 to 1.0 scale based on:
- Visual appeal (modern, professional?) - 25%
- Content accuracy (real business info, no placeholders?) - 25%
- Layout quality (well-structured, readable?) - 20%
- Conversion optimization (clear CTAs, phone visible?) - 15%
- Trust signals (ratings, certifications visible?) - 15%

The HTML content is:
${html.substring(0, 3000)}

Return JSON only:
{"score": 0.87, "pass": true, "issues": ["list of problems"], "strengths": ["what works well"]}

A score of ${threshold}+ passes. Common failures: placeholder text, broken layout, missing business name, generic look.`;

        const qaResult = await aiCallJson<QaResult>({ prompt: qaPrompt, timeout: 120000 });

        // Update prospect based on QA result
        if (qaResult.score >= threshold) {
          await d1Execute(
            `UPDATE prospects SET 
              stage = 'qa_passed',
              qa_score = ?,
              qa_feedback = ?,
              locked_until = NULL,
              locked_by = NULL,
              updated_at = datetime('now')
            WHERE id = ?`,
            [qaResult.score, JSON.stringify({ issues: qaResult.issues, strengths: qaResult.strengths }), prospect.id]
          );
          passed++;
          log.info('QA passed', { id: prospect.id, score: qaResult.score });
        } else {
          await d1Execute(
            `UPDATE prospects SET 
              stage = 'qa_failed',
              qa_score = ?,
              qa_feedback = ?,
              locked_until = NULL,
              locked_by = NULL,
              updated_at = datetime('now')
            WHERE id = ?`,
            [qaResult.score, JSON.stringify({ issues: qaResult.issues, strengths: qaResult.strengths }), prospect.id]
          );
          failed++;
          log.warn('QA failed', { id: prospect.id, score: qaResult.score, issues: qaResult.issues });
        }

      } catch (err: unknown) {
        const error = err as Error;
        failed++;
        log.error('QA error', { id: prospect.id, error: error.message });
        
        await d1Execute(
          `UPDATE prospects SET locked_until = NULL, locked_by = NULL, last_error = ?, updated_at = datetime('now') WHERE id = ?`,
          [error.message.substring(0, 200), prospect.id]
        );
      }
    }
  } finally {
    await browser.close();
  }

  log.info('QA run complete', { passed, failed, threshold });
  return { passed, failed };
}

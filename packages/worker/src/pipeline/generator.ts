import puppeteer, { Browser } from 'puppeteer';
import { getDesignSkillsPrompt, getDesignSkillsShort } from '../prompts/load-skills.js';
import { d1Select, d1Execute, d1SelectOne, r2Upload } from '../services/cloudflare.js';
import { aiCall, aiCallJson, aiGenerateHtml } from '../services/ai.js';
import { createLogger } from '../services/logger.js';
import { lookupDesignSystem } from '../services/design-lookup.js';
import { config } from '../config.js';
import { nanoid } from 'nanoid';
import { readFileSync, writeFileSync, existsSync, unlinkSync, mkdirSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';

const log = createLogger('generator');

const GEN_DIR = '/tmp/client-scraper-gen';

interface ProspectRow {
  id: string;
  business_name: string;
  owner_name: string | null;
  email: string | null;
  website_url: string | null;
  address: string | null;
  city: string | null;
  state_province: string | null;
  niche_id: string | null;
  has_website: number;
  pagespeed_mobile: number | null;
  google_rating: number | null;
  google_review_count: number | null;
  source_data: string | null;
  phone_raw: string | null;
}

interface NicheRow {
  id: string;
  name: string;
  features: string;
  ui_guidance: string | null;
  color_palette: string | null;
}

interface SiteStructure {
  sections: { name: string; content: string; purpose: string }[];
  color_scheme: { primary: string; accent: string; bg: string; text: string };
  headline: string;
  tagline: string;
  cta_text: string;
}

interface QaResult {
  score: number;
  issues: string[];
  feedback: string;
}

const MAX_ITERATIONS = 5;
const PASS_THRESHOLD = 0.85;

/**
 * Iterative visual quality loop:
 * 1. Plan site structure (AI JSON call)
 * 2. Generate full HTML (aiCall -> write file ourselves)
 * 3. QA via Puppeteer screenshot + AI vision evaluation
 * 4. If below threshold, improve with screenshot + feedback (full rewrite)
 * 5. Repeat up to MAX_ITERATIONS
 */
export async function runGenerator(): Promise<{ generated: number; failed: number }> {
  let generated = 0;
  let failed = 0;

  mkdirSync(GEN_DIR, { recursive: true });

  // Skip prospects without email - no point generating if unreachable
  const skippedNoEmail = await d1Execute(
    `UPDATE prospects SET stage = 'skipped', skip_reason = 'no_email_found'
     WHERE stage = 'scraped' AND (email IS NULL OR email = '')
     AND retry_count >= 1`,
    []
  );

  const prospects = await d1Select<ProspectRow>(
    `SELECT * FROM prospects 
     WHERE stage = 'scraped'
     AND email IS NOT NULL AND email != ''
     AND (locked_until IS NULL OR locked_until < datetime('now'))
     ORDER BY quality_score DESC
     LIMIT ?`,
    [config.worker.generationMaxPerRun]
  );

  if (prospects.length === 0) {
    log.info('No prospects ready for generation');
    return { generated: 0, failed: 0 };
  }

  for (const prospect of prospects) {
    try {
      await d1Execute(
        `UPDATE prospects SET locked_until = datetime('now', '+20 minutes'), locked_by = 'generator' WHERE id = ?`,
        [prospect.id]
      );

      const niche = await d1SelectOne<NicheRow>('SELECT * FROM niches WHERE id = ?', [prospect.niche_id || 'plumber']);
      if (!niche) continue;

      log.info('=== Starting generation ===', { id: prospect.id, name: prospect.business_name });

      const result = await iterativeGenerate(prospect, niche);

      if (result.success) {
        const slug = generateSlug(prospect.business_name, prospect.city);
        const finalHtml = injectCta(result.html, prospect);

        const siteKey = `portfolio/${slug}/index.html`;
        await r2Upload(siteKey, finalHtml, 'text/html');

        const portfolioUrl = `https://${config.portfolio.domain}/portfolio/${slug}`;

        // Generate draft email (prepared but NOT sent — awaits manual approval)
        const draftEmail = await generateDraftEmail(prospect, niche, portfolioUrl);

        await d1Execute(
          `UPDATE prospects SET 
            stage = 'pending_approval', qa_score = ?,
            generated_site_key = ?, generated_site_url = ?, portfolio_slug = ?,
            draft_email_subject = ?, draft_email_body_html = ?, draft_email_body_text = ?,
            approval_status = 'pending',
            locked_until = NULL, locked_by = NULL, updated_at = datetime('now')
          WHERE id = ?`,
          [result.score, siteKey, portfolioUrl, slug,
           draftEmail.subject, draftEmail.body_html, draftEmail.body_text,
           prospect.id]
        );
        generated++;
        log.info('Generation complete — awaiting approval', { id: prospect.id, slug, score: result.score });
      } else {
        await d1Execute(
          `UPDATE prospects SET stage = 'qa_failed', qa_score = ?, qa_feedback = ?,
           locked_until = NULL, locked_by = NULL, updated_at = datetime('now') WHERE id = ?`,
          [result.score, result.feedback, prospect.id]
        );
        failed++;
        log.warn('Generation failed QA', { id: prospect.id, score: result.score });
      }

      await sleep(3000);
    } catch (err: unknown) {
      const error = err as Error;
      failed++;
      log.error('Generation error', { id: prospect.id, error: error.message.substring(0, 300) });
      await d1Execute(
        `UPDATE prospects SET retry_count = retry_count + 1, last_error = ?,
         locked_until = NULL, locked_by = NULL, updated_at = datetime('now') WHERE id = ?`,
        [error.message.substring(0, 200), prospect.id]
      );
    }
  }

  log.info('Generator run complete', { generated, failed });
  return { generated, failed };
}

async function iterativeGenerate(prospect: ProspectRow, niche: NicheRow): Promise<{
  success: boolean; html: string; score: number; iterations: number; feedback: string;
}> {
  const outputPath = join(GEN_DIR, `${prospect.id}.html`);
  if (existsSync(outputPath)) unlinkSync(outputPath);

  // === Step 1: Plan site structure ===
  log.info('[Step 1] Planning site structure...');
  const structure = await planSiteStructure(prospect, niche);
  log.info('[Step 1] Done', { sections: structure.sections.length });

  let currentHtml = '';
  let lastFeedback = '';
  let lastScore = 0;

  for (let iteration = 1; iteration <= MAX_ITERATIONS; iteration++) {
    const startTime = Date.now();

    // === Step 2/4: Generate or improve HTML ===
    if (iteration === 1) {
      log.info(`[Iter ${iteration}] Generating initial HTML...`);
      currentHtml = await generateHtml(prospect, niche, structure);
    } else {
      log.info(`[Iter ${iteration}] Improving based on visual feedback...`);
      currentHtml = await improveHtml(prospect, niche, currentHtml, lastFeedback);
    }

    // Validate we got something
    if (!currentHtml || currentHtml.length < 500) {
      log.warn(`[Iter ${iteration}] HTML too short (${currentHtml.length}), retrying`);
      continue;
    }

    // Write to disk for Puppeteer
    writeFileSync(outputPath, currentHtml, 'utf-8');

    // === Step 3: Visual QA - screenshot + AI vision evaluation ===
    log.info(`[Iter ${iteration}] Visual QA evaluation...`);
    const qa = await evaluateWithVision(outputPath, prospect, niche);
    lastScore = qa.score;
    lastFeedback = qa.feedback;

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    log.info(`[Iter ${iteration}] Score: ${qa.score.toFixed(2)} (${elapsed}s)`, {
      issues: qa.issues.slice(0, 3),
    });

    if (qa.score >= PASS_THRESHOLD) {
      if (existsSync(outputPath)) unlinkSync(outputPath);
      return { success: true, html: currentHtml, score: qa.score, iterations: iteration, feedback: '' };
    }
  }

  // Cleanup
  if (existsSync(outputPath)) unlinkSync(outputPath);

  // Accept if score is reasonable (> 0.65) after all iterations
  if (currentHtml.length > 1000 && lastScore >= 0.65) {
    return { success: true, html: currentHtml, score: lastScore, iterations: MAX_ITERATIONS, feedback: lastFeedback };
  }

  return { success: false, html: '', score: lastScore, iterations: MAX_ITERATIONS, feedback: lastFeedback || 'Failed to generate acceptable HTML' };
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 1: Plan
// ─────────────────────────────────────────────────────────────────────────────

async function planSiteStructure(prospect: ProspectRow, niche: NicheRow): Promise<SiteStructure> {
  const features: string[] = JSON.parse(niche.features);
  let services: string[] = [];

  if (prospect.source_data) {
    try { services = JSON.parse(prospect.source_data).scraped?.services || []; } catch {}
  }

  // Query the design database for niche-specific design system
  const designSystem = lookupDesignSystem(niche.name, prospect.city || undefined);
  log.info('[Plan] Design system loaded', { style: designSystem.style.substring(0, 40), primary: designSystem.colors.primary });

  const prompt = `You are a web strategy consultant planning a website for a local business. Create a detailed content plan.

Business: ${prospect.business_name} (${niche.name})
Location: ${prospect.city}, ${prospect.state_province}
Phone: ${prospect.phone_raw || 'N/A'}
Rating: ${prospect.google_rating || 'N/A'}★ (${prospect.google_review_count || 0} reviews)
Owner: ${prospect.owner_name || 'N/A'}
Services: ${services.slice(0, 8).join(', ') || `Standard ${niche.name} services`}
${prospect.has_website ? `Current site: ${prospect.website_url} (PageSpeed ${prospect.pagespeed_mobile}/100 - needs upgrade)` : 'NO current website'}

DESIGN SYSTEM (from professional database - USE THESE EXACT COLORS):
${designSystem.raw || `Style: ${designSystem.style}\nColors: Primary ${designSystem.colors.primary}, Accent ${designSystem.colors.accent}, BG ${designSystem.colors.background}\nTypography: ${designSystem.typography}\nEffects: ${designSystem.effects}\nAvoid: ${designSystem.avoid}`}

Plan the site structure. Return JSON only, no other text:
{
  "headline": "compelling 6-8 word headline",
  "tagline": "supporting subtitle (15-20 words)",
  "cta_text": "primary button text",
  "color_scheme": {"primary": "${designSystem.colors.primary}", "accent": "${designSystem.colors.accent}", "bg": "${designSystem.colors.background}", "text": "${designSystem.colors.foreground}"},
  "sections": [
    {"name": "hero", "content": "what goes here specifically", "purpose": "first impression + CTA"},
    {"name": "services", "content": "list 4-6 specific services for this business", "purpose": "show what they offer"},
    {"name": "trust", "content": "specific trust signals for this business", "purpose": "build credibility"},
    {"name": "features", "content": "${features.slice(0, 4).join(', ')}", "purpose": "what their website offers"},
    {"name": "about", "content": "about section content", "purpose": "personal connection"},
    {"name": "contact", "content": "contact details + form", "purpose": "conversion"}
  ]
}`;

  try {
    return await aiCallJson<SiteStructure>({ prompt, timeout: 120000 });
  } catch {
    return {
      headline: `${prospect.city}'s Trusted ${niche.name}`,
      tagline: `Professional ${niche.name.toLowerCase()} services you can rely on`,
      cta_text: 'Get a Free Quote',
      color_scheme: JSON.parse(niche.color_palette || '{"primary":"#1e40af","accent":"#f59e0b","bg":"#ffffff","text":"#1e293b"}'),
      sections: [
        { name: 'hero', content: 'Headline + CTA + phone', purpose: 'first impression' },
        { name: 'services', content: services.slice(0, 6).join(', '), purpose: 'service list' },
        { name: 'trust', content: 'Rating, reviews, experience', purpose: 'credibility' },
        { name: 'features', content: features.slice(0, 4).join(', '), purpose: 'website features' },
        { name: 'about', content: 'Business story', purpose: 'connection' },
        { name: 'contact', content: 'Phone, address, form', purpose: 'conversion' },
      ],
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 2: Generate HTML (uses aiCall + we write the file)
// ─────────────────────────────────────────────────────────────────────────────

async function generateHtml(prospect: ProspectRow, niche: NicheRow, structure: SiteStructure): Promise<string> {
  const designSkills = getDesignSkillsPrompt();
  const outputPath = join(GEN_DIR, `site-${prospect.id}.html`);
  
  // Clean any previous file
  if (existsSync(outputPath)) unlinkSync(outputPath);

  const prompt = `${designSkills}

=== YOUR TASK ===

Create a stunning, DISTINCTIVE single-page website for the business below and SAVE IT to this file:
${outputPath}

Use the write tool to save the complete HTML file to that exact path. The file must start with <!DOCTYPE html> and end with </html>.

## Business Details
- Name: ${prospect.business_name}
- Type: ${niche.name}
- Phone: ${prospect.phone_raw || 'N/A'}
- Address: ${prospect.address || `${prospect.city}, ${prospect.state_province}`}
- Rating: ${prospect.google_rating}★ (${prospect.google_review_count} reviews)
- Owner: ${prospect.owner_name || ''}
- Headline: "${structure.headline}"
- Tagline: "${structure.tagline}"
- CTA: "${structure.cta_text}"

## Sections to include:
${structure.sections.map(s => `- ${s.name}: ${s.content}`).join('\n')}

## Color Scheme
Primary: ${structure.color_scheme.primary}, Accent: ${structure.color_scheme.accent}

## STRICT Technical Rules
1. Single complete HTML file - starts with <!DOCTYPE html>, ends with </html>
2. ALL CSS in one <style> tag in head
3. MUST start CSS with: *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
4. System fonts ONLY: font-family: system-ui, -apple-system, sans-serif
5. NO external dependencies (no CDN, no Google Fonts, no JS libraries)
6. FULLY responsive with @media queries for mobile (max-width: 768px)
7. Minimum 5 distinct sections with real content
8. Use CSS Grid or Flexbox for layouts
9. Smooth transitions on hover states
10. Phone must be clickable: <a href="tel:${prospect.phone_raw}">${prospect.phone_raw}</a>

## Quality Bar
- Must look like a $5,000+ agency site
- Use layered box-shadows for depth
- Strong typography hierarchy: large headlines, balanced body text
- Generous whitespace, asymmetric layouts, not a generic card grid
- ALL content must be REAL and specific to this business
- ONE bold design choice that makes this memorable

IMPORTANT: Write the complete HTML file to ${outputPath} using the file write tool. Do NOT output it in chat.`;

  const tmpPrompt = join(GEN_DIR, `prompt-${prospect.id}.txt`);
  writeFileSync(tmpPrompt, prompt, 'utf-8');

  try {
    // Ask kiro to write the file directly
    execSync(`kiro-cli chat --no-interactive < "${tmpPrompt}"`, {
      timeout: 600000,
      encoding: 'utf-8',
      maxBuffer: 10 * 1024 * 1024,
      cwd: GEN_DIR,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch {
    // kiro may exit non-zero but still write the file - that's fine
  } finally {
    if (existsSync(tmpPrompt)) unlinkSync(tmpPrompt);
  }

  // Check if kiro wrote the file
  if (existsSync(outputPath)) {
    const html = readFileSync(outputPath, 'utf-8');
    unlinkSync(outputPath);
    if (html.includes('<html') && html.length > 2000) {
      return html;
    }
  }

  // Fallback: try stdout parsing if file write failed
  log.warn('kiro did not write file directly, falling back to stdout parsing');
  const fallbackPrompt = prompt.replace(
    `IMPORTANT: Write the complete HTML file to ${outputPath} using the file write tool. Do NOT output it in chat.`,
    'Output the COMPLETE HTML below. Start with <!DOCTYPE html>, end with </html>. No code fences, no explanation.'
  );
  const raw = await aiCall({ prompt: fallbackPrompt, timeout: 600000 });
  return cleanHtml(raw);
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 4: Improve HTML (receives screenshot feedback, rewrites entirely)
// ─────────────────────────────────────────────────────────────────────────────

async function improveHtml(prospect: ProspectRow, niche: NicheRow, currentHtml: string, feedback: string): Promise<string> {
  const designSkills = getDesignSkillsShort();

  const prompt = `${designSkills}

You are rewriting an entire website HTML from scratch to fix visual quality issues.

## Visual Problems Identified:
${feedback}

## Business Context
- Name: ${prospect.business_name} (${niche.name})
- Phone: ${prospect.phone_raw || 'N/A'}
- Location: ${prospect.city}, ${prospect.state_province}
- Rating: ${prospect.google_rating}★ (${prospect.google_review_count} reviews)

## Current HTML (for reference of content/structure only):
${currentHtml.substring(0, 8000)}

## Instructions
Rewrite the ENTIRE HTML from scratch fixing ALL the visual problems listed above.
Write the COMPLETE HTML starting with <!DOCTYPE html> and ending with </html>.
Do NOT wrap in markdown code fences. Do NOT include any explanation. Output ONLY raw HTML.

## Technical Requirements
- *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
- System fonts only, no external deps
- @media responsive queries for mobile
- Phone as clickable tel: link
- Must look premium, not generic

Write the COMPLETE improved HTML:`;

  const outputPath = join(GEN_DIR, `improve-${prospect.id}.html`);
  if (existsSync(outputPath)) unlinkSync(outputPath);

  // Modify prompt to ask kiro to write to file
  const filePrompt = prompt.replace(
    'Write the COMPLETE improved HTML:',
    `Write the COMPLETE improved HTML to this file: ${outputPath}\nUse the write tool to save it. Do NOT output in chat.`
  );

  const tmpPrompt = join(GEN_DIR, `improve-prompt-${prospect.id}.txt`);
  writeFileSync(tmpPrompt, filePrompt, 'utf-8');

  try {
    execSync(`kiro-cli chat --no-interactive < "${tmpPrompt}"`, {
      timeout: 600000,
      encoding: 'utf-8',
      maxBuffer: 10 * 1024 * 1024,
      cwd: GEN_DIR,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch {
    // Non-fatal if file was written
  } finally {
    if (existsSync(tmpPrompt)) unlinkSync(tmpPrompt);
  }

  // Check if kiro wrote the file
  if (existsSync(outputPath)) {
    const html = readFileSync(outputPath, 'utf-8');
    unlinkSync(outputPath);
    if (html.includes('<html') && html.length > 2000) {
      return html;
    }
  }

  // Fallback to stdout parsing
  log.warn('Improve: kiro did not write file, falling back to stdout');
  const raw = await aiCall({ prompt, timeout: 600000 });
  return cleanHtml(raw);
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 3: Visual QA - Screenshot + AI Vision Evaluation
// ─────────────────────────────────────────────────────────────────────────────

async function evaluateWithVision(htmlPath: string, prospect: ProspectRow, niche: NicheRow): Promise<QaResult> {
  let browser: Browser | null = null;
  const screenshotPath = join(GEN_DIR, `screenshot-${prospect.id}-${nanoid(4)}.png`);

  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.goto(`file://${htmlPath}`, { waitUntil: 'networkidle0', timeout: 15000 });
    await page.evaluate(() => new Promise(r => setTimeout(r, 800)));

    // Take full-page screenshot
    await page.screenshot({ path: screenshotPath, fullPage: true, type: 'png' });

    // Also run quick programmatic checks for hard failures
    const hardChecks = await page.evaluate((bizName: string, phone: string) => {
      const body = document.body;
      const text = body.innerText;
      return {
        hasContent: text.length > 200,
        hasBusinessName: text.toLowerCase().includes(bizName.split(' ')[0].toLowerCase()),
        hasPhone: phone ? text.includes(phone.replace(/\D/g, '').slice(-4)) : true,
        hasClickablePhone: document.querySelectorAll('a[href^="tel:"]').length > 0,
        sectionCount: document.querySelectorAll('section, header, footer, main > div, [class*="section"]').length,
        hasResponsive: document.querySelector('style')?.textContent?.includes('@media') || false,
        hasCssReset: document.querySelector('style')?.textContent?.includes('box-sizing') || false,
        pageHeight: body.scrollHeight,
      };
    }, prospect.business_name, prospect.phone_raw || '');

    await page.close();

    // Hard-fail checks (no need for vision if these fail)
    const hardIssues: string[] = [];
    if (!hardChecks.hasContent) hardIssues.push('Page has almost no text content - generation likely failed');
    if (!hardChecks.hasCssReset) hardIssues.push('Missing CSS reset (* { box-sizing: border-box })');
    if (!hardChecks.hasBusinessName) hardIssues.push('Business name not visible anywhere on page');
    if (!hardChecks.hasResponsive) hardIssues.push('No @media responsive queries found');
    if (hardChecks.sectionCount < 3) hardIssues.push(`Only ${hardChecks.sectionCount} sections visible (need at least 5)`);
    if (hardChecks.pageHeight < 600) hardIssues.push('Page is too short - less than 600px of content');

    if (hardIssues.length >= 3) {
      // Too many hard failures - skip expensive vision call
      const score = Math.max(0.1, 0.5 - (hardIssues.length * 0.1));
      return { score, issues: hardIssues, feedback: hardIssues.join('\n') };
    }

    // === AI Vision Evaluation ===
    const screenshotBase64 = readFileSync(screenshotPath).toString('base64');

    const visionPrompt = `You are a senior web design critic evaluating a screenshot of a locally-generated website.

The screenshot is encoded below in base64. Evaluate it on these STRICT criteria, scoring each 0.0-1.0:

1. TYPOGRAPHY HIERARCHY (0-1): Are headlines large and bold? Is there clear size/weight differentiation between h1, h2, body? Does it use at least 3 distinct text sizes?
2. COLOR USAGE (0-1): Is the palette cohesive? Are accent colors used intentionally for CTAs? Is there enough contrast? Does it avoid the generic blue+orange template look?
3. LAYOUT & ASYMMETRY (0-1): Does it avoid boring symmetric card grids? Are sections visually distinct? Is there creative use of space?
4. DEPTH & SHADOWS (0-1): Are there layered shadows creating depth? Do cards/elements feel elevated? Is there visual hierarchy through z-depth?
5. MOBILE RESPONSIVENESS (0-1): Does the layout structure suggest it would work on mobile? (wide elements, flexible sizing, no fixed pixel widths)
6. CONTENT SPECIFICITY (0-1): Is the content clearly for a REAL business (${prospect.business_name}, ${niche.name})? Not generic lorem ipsum?
7. PREMIUM FEEL (0-1): Does this look like a $5000+ agency site? Or a free Wix template? Would a business owner be impressed?

Business being evaluated: ${prospect.business_name} (${niche.name}) in ${prospect.city}, ${prospect.state_province}

IMPORTANT: Be HARSH. Most AI-generated sites score 0.4-0.6. A score of 0.85+ means genuinely impressive.

Return JSON only:
{
  "scores": {
    "typography": 0.0,
    "color": 0.0,
    "layout": 0.0,
    "depth": 0.0,
    "responsive": 0.0,
    "content": 0.0,
    "premium": 0.0
  },
  "overall": 0.0,
  "top_issues": ["issue1", "issue2", "issue3"],
  "what_works": "brief note on what's good"
}

Screenshot (base64 PNG):
${screenshotBase64}`;

    let visionResult: {
      scores: Record<string, number>;
      overall: number;
      top_issues: string[];
      what_works: string;
    };

    try {
      visionResult = await aiCallJson<typeof visionResult>({ prompt: visionPrompt, timeout: 180000 });
    } catch (err) {
      // Vision call failed - fall back to programmatic scoring only
      log.warn('Vision evaluation failed, using programmatic score', { error: (err as Error).message.substring(0, 100) });
      let score = 0.55;
      if (hardChecks.hasCssReset) score += 0.05;
      if (hardChecks.hasResponsive) score += 0.05;
      if (hardChecks.sectionCount >= 5) score += 0.1;
      if (hardChecks.pageHeight > 2000) score += 0.05;
      if (hardChecks.hasClickablePhone) score += 0.05;
      if (hardChecks.hasBusinessName) score += 0.05;
      score = Math.min(0.80, score); // Cap programmatic-only at 0.80
      const issues = hardIssues.length > 0 ? hardIssues : ['Could not perform visual evaluation - improve typography and layout depth'];
      return { score, issues, feedback: issues.join('\n') };
    }

    // Combine hard check penalties with vision score
    let finalScore = visionResult.overall;
    const allIssues = [...(visionResult.top_issues || [])];

    if (!hardChecks.hasClickablePhone) { allIssues.push('Phone number is not a clickable tel: link'); finalScore -= 0.03; }
    if (!hardChecks.hasBusinessName) { finalScore -= 0.05; }
    if (hardIssues.length > 0) {
      allIssues.push(...hardIssues);
      finalScore -= hardIssues.length * 0.03;
    }

    finalScore = Math.max(0, Math.min(1, finalScore));

    // Build detailed feedback for the improvement pass
    const feedbackParts: string[] = [];
    if (visionResult.scores) {
      const scores = visionResult.scores;
      if (scores.typography < 0.7) feedbackParts.push(`TYPOGRAPHY (${scores.typography.toFixed(1)}): Needs stronger hierarchy - larger headlines, more size differentiation`);
      if (scores.color < 0.7) feedbackParts.push(`COLOR (${scores.color.toFixed(1)}): Improve palette cohesion and accent usage - avoid generic look`);
      if (scores.layout < 0.7) feedbackParts.push(`LAYOUT (${scores.layout.toFixed(1)}): Break up symmetric patterns - use asymmetric layouts, varied section heights`);
      if (scores.depth < 0.7) feedbackParts.push(`DEPTH (${scores.depth.toFixed(1)}): Add layered box-shadows, card elevation, visual z-depth hierarchy`);
      if (scores.responsive < 0.7) feedbackParts.push(`RESPONSIVE (${scores.responsive.toFixed(1)}): Ensure flexible layouts and @media breakpoints`);
      if (scores.content < 0.7) feedbackParts.push(`CONTENT (${scores.content.toFixed(1)}): Make content more specific to this business - use real details`);
      if (scores.premium < 0.7) feedbackParts.push(`PREMIUM (${scores.premium.toFixed(1)}): Elevate overall quality - more whitespace, polish, attention to detail`);
    }
    if (visionResult.top_issues) feedbackParts.push(...visionResult.top_issues.map(i => `- ${i}`));
    if (hardIssues.length > 0) feedbackParts.push('--- Hard failures ---', ...hardIssues);

    return {
      score: finalScore,
      issues: allIssues,
      feedback: feedbackParts.join('\n'),
    };
  } finally {
    if (browser) await browser.close();
    if (existsSync(screenshotPath)) unlinkSync(screenshotPath);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────────────────────────────────────

function cleanHtml(raw: string): string {
  let html = raw;

  // Strip ANSI escape codes
  html = html.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '');

  // Strategy 1: Find the LARGEST html code fence (kiro often has multiple)
  const allFences = [...html.matchAll(/```(?:html)?\s*([\s\S]*?)```/g)];
  if (allFences.length > 0) {
    // Pick the longest fence that looks like HTML
    const htmlFences = allFences
      .map(m => m[1].trim())
      .filter(f => f.includes('<') && f.length > 500);
    if (htmlFences.length > 0) {
      html = htmlFences.reduce((a, b) => a.length > b.length ? a : b);
    }
  }

  // Strategy 2: Find DOCTYPE or <html start
  if (!html.includes('<!DOCTYPE') && !html.includes('<html')) {
    // Maybe the raw output has it outside fences
    const docIdx = raw.indexOf('<!DOCTYPE');
    const htmlIdx = raw.indexOf('<html');
    if (docIdx >= 0) html = raw.substring(docIdx);
    else if (htmlIdx >= 0) html = raw.substring(htmlIdx);
  } else {
    // Strip leading prose before DOCTYPE
    const docIdx = html.indexOf('<!DOCTYPE');
    const htmlIdx = html.indexOf('<html');
    if (docIdx > 0) html = html.substring(docIdx);
    else if (htmlIdx > 0 && docIdx < 0) html = html.substring(htmlIdx);
  }

  // Strategy 3: Trim trailing prose after </html>
  const htmlEnd = html.lastIndexOf('</html>');
  if (htmlEnd > 0) {
    html = html.substring(0, htmlEnd + 7);
  }

  // Fix common kiro output artifacts
  // Fix missing * in CSS reset (kiro strips * as markdown bold)
  html = html.replace(/^(,\s*::before,\s*::after)/m, '*, ::before, ::after');
  html = html.replace(/(\n)(,\s*::before,\s*::after)/g, '$1*, ::before, ::after');

  // Fix broken CSS comments
  html = html.replace(/\/\s+\*/g, '/*');
  html = html.replace(/\*\s+\//g, '*/');

  return html;
}

function injectCta(html: string, prospect: ProspectRow): string {
  const cta = `
<section style="background: linear-gradient(135deg, #1e293b 0%, #334155 100%); padding: 48px 24px; text-align: center; margin-top: 0; border-top: 4px solid #3b82f6;">
  <h2 style="color: #ffffff; font-size: 24px; margin: 0 0 12px; font-family: system-ui, -apple-system, sans-serif;">Like what you see?</h2>
  <p style="color: #94a3b8; font-size: 16px; margin: 0 0 24px; max-width: 500px; margin-left: auto; margin-right: auto; line-height: 1.6;">
    This preview was built specifically for <strong style="color: #ffffff;">${prospect.business_name}</strong>.
    Reply to get this site live in 48 hours.
  </p>
  <a href="mailto:contact@cloudgenz.com?subject=Interested in website for ${encodeURIComponent(prospect.business_name)}"
     style="display: inline-block; background: #3b82f6; color: #ffffff; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px;">
    Get This Site Live &rarr;
  </a>
  <p style="color: #64748b; font-size: 13px; margin-top: 16px;">No obligation &bull; Preview available for a limited time</p>
  <p style="color: #2ecc71; font-size: 15px; font-weight: 600; margin-top: 12px; padding: 8px 16px; background: rgba(46,204,113,0.1); border-radius: 6px; display: inline-block;">Starting from just $50/page</p>
</section>
<img src="https://${config.portfolio.domain}/api/track/open/${prospect.id}.png" width="1" height="1" style="display:none" alt="" />`;

  if (html.includes('</body>')) {
    return html.replace('</body>', `${cta}\n</body>`);
  }
  return html + cta;
}

/**
 * Generate draft email content (subject + HTML body + text body).
 * This is staged for human review — NOT sent automatically.
 */
async function generateDraftEmail(prospect: ProspectRow, niche: NicheRow, portfolioUrl: string): Promise<{
  subject: string; body_html: string; body_text: string;
}> {
  const ownerName = prospect.owner_name || null;
  const greeting = ownerName ? `Hi ${ownerName}` : 'Hi there';
  const features: string[] = JSON.parse(niche.features).slice(0, 3);
  const template = prospect.has_website ? 'redesign' : 'no_website';

  let prompt: string;
  if (template === 'no_website') {
    prompt = `Write a personalized cold email for a ${niche.name} business owner who does NOT have a website. I've built them a sample site.

Business: ${prospect.business_name}
Owner: ${ownerName || 'Unknown'}
Location: ${prospect.city}, ${prospect.state_province}
Rating: ${prospect.google_rating || 'N/A'}★ (${prospect.google_review_count || 0} reviews)
Preview link: ${portfolioUrl}
Features highlighted: ${features.join(', ')}

Requirements:
- Open with "${greeting}"
- Mention the specific preview site I built for them
- Reference something specific about their business (rating, location, services)
- Highlight 2-3 features from their niche: ${features.join(', ')}
- Soft CTA ("take a look when you get a chance")
- Under 150 words, warm but professional tone
- Sign off as "Dhruvil" from CloudGenZ
- Include pricing: "Starting from just $50/page"
- Include at bottom: "dhruvil@cloudgenz.com | Call/WhatsApp: +1 519-778-0245"

Return JSON only: {"subject": "short curiosity-driven subject", "body_html": "<p>HTML email body with inline styles</p>", "body_text": "plain text version"}`;
  } else {
    prompt = `Write a cold email for a ${niche.name} business with an outdated website. I've built a modern redesign preview.

Business: ${prospect.business_name}
Owner: ${ownerName || 'Unknown'}
Current site: ${prospect.website_url}
PageSpeed: ${prospect.pagespeed_mobile}/100
Location: ${prospect.city}, ${prospect.state_province}
Preview link: ${portfolioUrl}

Requirements:
- Reference their current site positively first
- Mention PageSpeed score: "${prospect.pagespeed_mobile}/100 on mobile — the redesign scores 95+"
- Include the preview link
- Under 150 words
- Sign off as "Dhruvil" from CloudGenZ
- Include pricing: "Starting from just $50/page"
- Include at bottom: "dhruvil@cloudgenz.com | Call/WhatsApp: +1 519-778-0245"

Return JSON only: {"subject": "short subject line", "body_html": "<p>HTML body</p>", "body_text": "plain text"}`;
  }

  try {
    return await aiCallJson<{ subject: string; body_html: string; body_text: string }>({ prompt, timeout: 120000 });
  } catch {
    // Fallback draft
    const body = `${greeting},\n\nI came across ${prospect.business_name} and built a sample website preview for you: ${portfolioUrl}\n\nIt includes ${features.join(', ')} — all optimized for mobile.\n\nStarting from just $50/page.\n\nTake a look when you get a chance. No obligation.\n\nBest,\nDhruvil\nCloudGenZ\n\ndhruvil@cloudgenz.com\nCall/WhatsApp: +1 519-778-0245`;
    return {
      subject: `I built a sample website for ${prospect.business_name}`,
      body_html: `<p>${body.replace(/\n/g, '</p><p>')}</p>`,
      body_text: body,
    };
  }
}

function generateSlug(name: string, city: string | null): string {
  const base = `${name}${city ? '-' + city : ''}`
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').substring(0, 60);
  return `${base}-${nanoid(4)}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

import puppeteer, { Browser } from 'puppeteer';
import { bedrockHtml, bedrockCall, bedrockJson } from '../services/bedrock.js';
import { d1Select, d1Execute, d1SelectOne, r2Upload } from '../services/cloudflare.js';
import { createLogger } from '../services/logger.js';
import { lookupDesignSystem } from '../services/design-lookup.js';
import { config } from '../config.js';
import { nanoid } from 'nanoid';
import { writeFileSync, existsSync, unlinkSync, mkdirSync, readFileSync } from 'fs';
import { join } from 'path';

const log = createLogger('generator');

const GEN_DIR = '/tmp/client-scraper-gen';
const STEPS_DIR = '/tmp/client-scraper-gen/steps';

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

interface ValidationResult {
  pass: boolean;
  score: number;
  issues: string[];
}

/**
 * Pipeline-based generator.
 * Step 1: Structure + Content (Gemini Pro - creative heavy lifting)
 * Step 2: Visual Polish (Gemini Flash - add shadows, gradients, depth)
 * Step 3: Typography refinement (Gemini Flash - font hierarchy)
 * Step 4: Responsive check (Puppeteer - programmatic)
 * Step 5: Validation (programmatic - no AI)
 * Fix loop: If validation fails, one targeted fix then re-validate
 */
export async function runGenerator(): Promise<{ generated: number; failed: number }> {
  let generated = 0;
  let failed = 0;

  mkdirSync(GEN_DIR, { recursive: true });
  mkdirSync(STEPS_DIR, { recursive: true });

  // Skip prospects without email
  await d1Execute(
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
        `UPDATE prospects SET locked_until = datetime('now', '+10 minutes'), locked_by = 'generator' WHERE id = ?`,
        [prospect.id]
      );

      const niche = await d1SelectOne<NicheRow>('SELECT * FROM niches WHERE id = ?', [prospect.niche_id || 'plumber']);
      if (!niche) continue;

      log.info('=== Pipeline Start ===', { id: prospect.id, name: prospect.business_name });
      const startTime = Date.now();

      const result = await runPipeline(prospect, niche);

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

      if (result.pass) {
        const slug = generateSlug(prospect.business_name, prospect.city);
        const finalHtml = injectCta(result.html, prospect);

        const siteKey = `portfolio/${slug}/index.html`;
        await r2Upload(siteKey, finalHtml, 'text/html');

        const portfolioUrl = `https://${config.portfolio.domain}/portfolio/${slug}`;

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
        log.info(`=== Pipeline Success (${elapsed}s) ===`, { id: prospect.id, slug, score: result.score });
      } else {
        await d1Execute(
          `UPDATE prospects SET stage = 'qa_failed', qa_score = ?, qa_feedback = ?,
           locked_until = NULL, locked_by = NULL, updated_at = datetime('now') WHERE id = ?`,
          [result.score, result.issues.join('; '), prospect.id]
        );
        failed++;
        log.warn(`=== Pipeline Failed (${elapsed}s) ===`, { id: prospect.id, issues: result.issues });
      }

      // Rate limit between prospects
      await sleep(2000);
    } catch (err: unknown) {
      const error = err as Error;
      failed++;
      log.error('Pipeline error', { id: prospect.id, error: error.message.substring(0, 300) });
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

// ─────────────────────────────────────────────────────────────────────────────
// PIPELINE ORCHESTRATOR
// ─────────────────────────────────────────────────────────────────────────────

async function runPipeline(prospect: ProspectRow, niche: NicheRow): Promise<{
  pass: boolean; html: string; score: number; issues: string[];
}> {
  const designSystem = lookupDesignSystem(niche.name, prospect.city || undefined);

  // === STEP 1: Structure + Content (Pro) ===
  log.info('[Step 1/5] Generating structure + content (Pro)...');
  let html = await step1Structure(prospect, niche, designSystem);
  saveStep(prospect.id, 1, html);
  log.info('[Step 1/5] Done', { length: html.length });

  // === STEP 2: Visual Polish (Flash) ===
  log.info('[Step 2/5] Adding visual polish (Flash)...');
  html = await step2Polish(html, prospect, designSystem);
  saveStep(prospect.id, 2, html);
  log.info('[Step 2/5] Done', { length: html.length });

  // === STEP 3: Typography (Flash) ===
  log.info('[Step 3/5] Refining typography (Flash)...');
  html = await step3Typography(html);
  saveStep(prospect.id, 3, html);
  log.info('[Step 3/5] Done', { length: html.length });

  // === STEP 4: Responsive (Puppeteer check + Flash fix if needed) ===
  log.info('[Step 4/5] Checking responsiveness...');
  html = await step4Responsive(html, prospect.id);
  saveStep(prospect.id, 4, html);
  log.info('[Step 4/5] Done');

  // === STEP 5: Validation (programmatic) ===
  log.info('[Step 5/5] Validating...');
  let validation = await step5Validate(html, prospect);

  // One fix attempt if validation fails
  if (!validation.pass && validation.issues.length <= 3) {
    log.info('[Fix] Attempting targeted fix...', { issues: validation.issues });
    html = await targetedFix(html, validation.issues, prospect);
    saveStep(prospect.id, 6, html); // step 6 = fix
    validation = await step5Validate(html, prospect);
    log.info('[Fix] Re-validated', { pass: validation.pass, score: validation.score });
  }

  return { pass: validation.pass, html, score: validation.score, issues: validation.issues };
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 1: Structure + Content (Gemini Pro)
// ─────────────────────────────────────────────────────────────────────────────

async function step1Structure(prospect: ProspectRow, niche: NicheRow, designSystem: any): Promise<string> {
  const features: string[] = JSON.parse(niche.features);
  let services: string[] = [];
  if (prospect.source_data) {
    try { services = JSON.parse(prospect.source_data).scraped?.services || []; } catch {}
  }

  const prompt = `Create a complete, single-page HTML website for a local business. Output ONLY raw HTML - no explanation, no markdown fences.

## Business
- Name: ${prospect.business_name}
- Type: ${niche.name}
- Phone: ${prospect.phone_raw || 'N/A'}
- Address: ${prospect.address || `${prospect.city}, ${prospect.state_province}`}
- Rating: ${prospect.google_rating || 'N/A'}★ (${prospect.google_review_count || 0} reviews)
- Owner: ${prospect.owner_name || 'the team'}
- Services: ${services.slice(0, 6).join(', ') || features.slice(0, 5).join(', ')}

## Design System
- Style: ${designSystem.style}
- Primary: ${designSystem.colors.primary}
- Accent: ${designSystem.colors.accent}
- Background: ${designSystem.colors.background}
- Typography: ${designSystem.typography || 'system-ui, -apple-system, sans-serif'}

## Requirements
1. Start with <!DOCTYPE html>, end with </html>
2. ALL CSS in a single <style> tag in <head>
3. CSS reset: *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
4. System fonts ONLY: font-family: system-ui, -apple-system, sans-serif
5. NO external dependencies (no CDN, no Google Fonts, no JS libraries)
6. FULLY responsive with @media (max-width: 768px) queries
7. Phone as clickable link: <a href="tel:${prospect.phone_raw}">${prospect.phone_raw}</a>
8. Minimum 6 distinct sections: hero, services, about/trust, features, testimonials/reviews, contact

## Content Rules
- ALL text must be specific to THIS business (no lorem ipsum, no generic placeholder text)
- Hero section: compelling headline specific to their city + niche, subtitle, CTA button
- Services: list 4-6 real services with brief descriptions
- Reviews: use their actual Google rating (${prospect.google_rating}★, ${prospect.google_review_count} reviews)
- Contact: real phone, real address, call-to-action

## Layout Rules
- Use CSS Grid or Flexbox for all layouts
- Generous whitespace (padding: 60px+ on sections)
- Varied section backgrounds (alternate white and light gray)
- At least one section with a colored/gradient background using the primary color
- Cards or feature blocks should use subtle box-shadows

Output the COMPLETE HTML now:`;

  return await bedrockHtml({ prompt, model: 'sonnet', temperature: 0.8 });
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 2: Visual Polish (Gemini Flash)
// ─────────────────────────────────────────────────────────────────────────────

async function step2Polish(html: string, prospect: ProspectRow, designSystem: any): Promise<string> {
  const prompt = `You are a CSS specialist. Take this HTML website and enhance ONLY the visual polish. Output the COMPLETE modified HTML - no explanation, no markdown fences.

## What to ADD (CSS only - do NOT change HTML structure or text content):
1. Layered box-shadows on cards/panels: box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -2px rgba(0,0,0,0.1)
2. Elevated shadows on hover: transition: transform 0.2s, box-shadow 0.2s; and :hover { transform: translateY(-2px); box-shadow: ... }
3. Subtle gradient on the hero section or one accent section
4. Smooth transitions on all interactive elements (buttons, links, cards)
5. Button hover states (darken by 10%, slight scale)
6. A subtle background pattern or gradient on alternating sections
7. Border-radius on cards (8-12px) and buttons (6-8px)

## Rules
- Do NOT change any text content
- Do NOT remove any sections
- Do NOT add external dependencies
- Keep ALL existing CSS, just enhance it
- Output starts with <!DOCTYPE html>, ends with </html>

## Current HTML:
${html}`;

  return await bedrockHtml({ prompt, model: 'haiku', temperature: 0.3 });
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 3: Typography (Gemini Flash)
// ─────────────────────────────────────────────────────────────────────────────

async function step3Typography(html: string): Promise<string> {
  const prompt = `You are a typography specialist. Take this HTML website and enhance ONLY the typography. Output the COMPLETE modified HTML - no explanation, no markdown fences.

## What to IMPROVE (CSS only - do NOT change HTML structure or text content):
1. Hero headline: font-size at least 3.5rem (desktop), font-weight 800 or 900, letter-spacing: -0.02em
2. Section headings (h2): font-size 2.2rem, font-weight 700
3. Body text: font-size 1.1rem, line-height 1.7, color should be soft dark (not pure black)
4. Subheadings/labels: uppercase, letter-spacing: 0.05em, font-size 0.85rem, font-weight 600
5. Ensure at least 4 distinct text sizes are used (hero > h2 > body > small/label)
6. CTA buttons: font-weight 600, font-size 1rem minimum
7. Ensure color contrast ratio is accessible (dark text on light, light on dark backgrounds)

## Rules
- Do NOT change any text content or HTML structure
- Do NOT remove anything
- Do NOT add external fonts - keep system-ui
- Only modify font-size, font-weight, line-height, letter-spacing, color properties
- Output starts with <!DOCTYPE html>, ends with </html>

## Current HTML:
${html}`;

  return await bedrockHtml({ prompt, model: 'haiku', temperature: 0.2 });
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 4: Responsive Check (Puppeteer + Flash fix if needed)
// ─────────────────────────────────────────────────────────────────────────────

async function step4Responsive(html: string, prospectId: string): Promise<string> {
  const htmlPath = join(GEN_DIR, `responsive-check-${prospectId}.html`);
  writeFileSync(htmlPath, html, 'utf-8');

  let browser: Browser | null = null;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 375, height: 812 }); // iPhone viewport
    await page.goto(`file://${htmlPath}`, { waitUntil: 'networkidle0' });

    // Check for horizontal overflow
    const overflowInfo = await page.evaluate(() => {
      const body = document.body;
      const docWidth = document.documentElement.scrollWidth;
      const viewWidth = window.innerWidth;
      const hasOverflow = docWidth > viewWidth + 5;

      // Find overflowing elements
      const overflowing: string[] = [];
      if (hasOverflow) {
        document.querySelectorAll('*').forEach(el => {
          const rect = el.getBoundingClientRect();
          if (rect.right > viewWidth + 5 && el.tagName !== 'HTML' && el.tagName !== 'BODY') {
            overflowing.push(`${el.tagName}.${el.className || 'no-class'} (width: ${Math.round(rect.width)}px)`);
          }
        });
      }

      // Check if @media queries exist
      const hasMediaQueries = Array.from(document.querySelectorAll('style'))
        .some(s => s.textContent?.includes('@media'));

      return { hasOverflow, docWidth, viewWidth, overflowing: overflowing.slice(0, 5), hasMediaQueries };
    });

    await page.close();

    if (!overflowInfo.hasOverflow && overflowInfo.hasMediaQueries) {
      log.info('[Step 4] Responsive - PASS (no overflow, has media queries)');
      return html; // Already responsive
    }

    // Fix needed
    const issues: string[] = [];
    if (overflowInfo.hasOverflow) issues.push(`Horizontal overflow: page is ${overflowInfo.docWidth}px wide on 375px viewport. Overflowing: ${overflowInfo.overflowing.join(', ')}`);
    if (!overflowInfo.hasMediaQueries) issues.push('No @media queries found in CSS');

    log.info('[Step 4] Responsive - FIXING', { issues });

    const fixPrompt = `You are a responsive CSS specialist. Fix the mobile layout issues in this HTML. Output the COMPLETE modified HTML - no explanation, no markdown fences.

## Issues to fix:
${issues.join('\n')}

## Required fixes:
1. Add @media (max-width: 768px) { } block with mobile overrides
2. Ensure no element exceeds viewport width (use max-width: 100%, overflow-x: hidden on body)
3. Stack grid/flex layouts vertically on mobile
4. Reduce font sizes by ~20% on mobile
5. Reduce padding (60px -> 30px on mobile)
6. Make images max-width: 100%

## Rules:
- Do NOT change text content
- Do NOT remove sections
- Output starts with <!DOCTYPE html>

## Current HTML:
${html}`;

    return await bedrockHtml({ prompt: fixPrompt, model: 'haiku', temperature: 0.2 });
  } finally {
    if (browser) await browser.close();
    if (existsSync(htmlPath)) unlinkSync(htmlPath);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 5: Validation (pure programmatic - no AI)
// ─────────────────────────────────────────────────────────────────────────────

async function step5Validate(html: string, prospect: ProspectRow): Promise<ValidationResult> {
  const issues: string[] = [];
  let score = 1.0;

  // Basic HTML checks
  if (!html.includes('<!DOCTYPE html') && !html.includes('<!doctype html')) {
    issues.push('Missing DOCTYPE'); score -= 0.1;
  }
  if (!html.includes('box-sizing')) {
    issues.push('Missing CSS reset (box-sizing)'); score -= 0.1;
  }
  if (!html.includes('@media')) {
    issues.push('Missing responsive @media queries'); score -= 0.15;
  }

  // Content checks
  const bizNameFirst = prospect.business_name.split(' ')[0].toLowerCase();
  if (!html.toLowerCase().includes(bizNameFirst)) {
    issues.push('Business name not found in HTML'); score -= 0.2;
  }
  if (prospect.phone_raw && !html.includes('tel:')) {
    issues.push('Phone not a clickable tel: link'); score -= 0.1;
  }

  // Structure checks via Puppeteer
  const htmlPath = join(GEN_DIR, `validate-${prospect.id}.html`);
  writeFileSync(htmlPath, html, 'utf-8');

  let browser: Browser | null = null;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.goto(`file://${htmlPath}`, { waitUntil: 'networkidle0' });

    const checks = await page.evaluate(() => {
      const body = document.body;
      const text = body.innerText;
      const sections = document.querySelectorAll('section, header, footer, [class*="section"], main > div').length;
      const hasBoxShadow = document.querySelector('style')?.textContent?.includes('box-shadow') || false;
      const pageHeight = body.scrollHeight;
      const hasHoverStates = document.querySelector('style')?.textContent?.includes(':hover') || false;
      const hasBorderRadius = document.querySelector('style')?.textContent?.includes('border-radius') || false;

      return { textLength: text.length, sections, hasBoxShadow, pageHeight, hasHoverStates, hasBorderRadius };
    });

    await page.close();

    if (checks.textLength < 300) {
      issues.push(`Very little text content (${checks.textLength} chars)`); score -= 0.2;
    }
    if (checks.sections < 4) {
      issues.push(`Only ${checks.sections} sections (need 5+)`); score -= 0.15;
    }
    if (!checks.hasBoxShadow) {
      issues.push('No box-shadow depth effects'); score -= 0.05;
    }
    if (checks.pageHeight < 1200) {
      issues.push(`Page too short (${checks.pageHeight}px, need 1200+)`); score -= 0.1;
    }
    if (!checks.hasHoverStates) {
      issues.push('No hover states'); score -= 0.05;
    }
  } finally {
    if (browser) await browser.close();
    if (existsSync(htmlPath)) unlinkSync(htmlPath);
  }

  score = Math.max(0, Math.min(1, score));
  const pass = score >= 0.70 && issues.length <= 2;

  log.info('[Validate]', { pass, score: score.toFixed(2), issues });
  return { pass, score, issues };
}

// ─────────────────────────────────────────────────────────────────────────────
// TARGETED FIX (Flash - one shot to fix specific issues)
// ─────────────────────────────────────────────────────────────────────────────

async function targetedFix(html: string, issues: string[], prospect: ProspectRow): Promise<string> {
  const prompt = `Fix these specific issues in the HTML website. Output the COMPLETE fixed HTML - no explanation, no markdown fences.

## Issues to fix:
${issues.map((i, idx) => `${idx + 1}. ${i}`).join('\n')}

## Business context (for content fixes):
- Name: ${prospect.business_name}
- Phone: ${prospect.phone_raw || 'N/A'}
- City: ${prospect.city}, ${prospect.state_province}

## Rules:
- Fix ONLY the listed issues
- Do NOT remove existing content
- Do NOT change the design style
- Output starts with <!DOCTYPE html>, ends with </html>

## Current HTML:
${html}`;

  return await bedrockHtml({ prompt, model: 'haiku', temperature: 0.2 });
}

// ─────────────────────────────────────────────────────────────────────────────
// UTILITIES
// ─────────────────────────────────────────────────────────────────────────────

function saveStep(prospectId: string, step: number, html: string): void {
  const path = join(STEPS_DIR, `${prospectId}-step${step}.html`);
  writeFileSync(path, html, 'utf-8');
}

function injectCta(html: string, prospect: ProspectRow): string {
  const cta = `
<section style="background: linear-gradient(135deg, #1e293b 0%, #334155 100%); padding: 48px 24px; text-align: center; border-top: 4px solid #3b82f6;">
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

async function generateDraftEmail(prospect: ProspectRow, niche: NicheRow, portfolioUrl: string): Promise<{
  subject: string; body_html: string; body_text: string;
}> {
  const ownerName = prospect.owner_name || null;
  const greeting = ownerName ? `Hi ${ownerName}` : 'Hi there';
  const features: string[] = JSON.parse(niche.features).slice(0, 3);
  const template = prospect.has_website ? 'redesign' : 'no_website';

  const prompt = template === 'no_website'
    ? `Write a personalized cold email for a ${niche.name} business owner without a website. I built them a sample site.

Business: ${prospect.business_name}, Owner: ${ownerName || 'Unknown'}, Location: ${prospect.city}, ${prospect.state_province}
Rating: ${prospect.google_rating || 'N/A'}★ (${prospect.google_review_count || 0} reviews)
Preview: ${portfolioUrl}
Features: ${features.join(', ')}

Rules: Open with "${greeting}", mention their preview site, reference their rating/location, highlight 2-3 features, soft CTA, under 150 words, sign as "Dhruvil" from CloudGenZ, include "Starting from just $50/page", include "dhruvil@cloudgenz.com | Call/WhatsApp: +1 519-778-0245"

Return JSON only: {"subject": "short curiosity subject", "body_html": "<p>HTML email</p>", "body_text": "plain text"}`
    : `Write a cold email for a ${niche.name} with an outdated website. I built a redesign preview.

Business: ${prospect.business_name}, Current site: ${prospect.website_url}, PageSpeed: ${prospect.pagespeed_mobile}/100
Location: ${prospect.city}, ${prospect.state_province}, Preview: ${portfolioUrl}

Rules: Reference current site positively, mention PageSpeed score, include preview link, under 150 words, sign as "Dhruvil" from CloudGenZ, include pricing "$50/page", include contact info.

Return JSON only: {"subject": "short subject", "body_html": "<p>HTML body</p>", "body_text": "plain text"}`;

  try {
    return await bedrockJson<{ subject: string; body_html: string; body_text: string }>({ prompt, model: 'haiku' });
  } catch {
    const body = `${greeting},\n\nI came across ${prospect.business_name} and built a sample website preview for you: ${portfolioUrl}\n\nIt includes ${features.join(', ')} - all optimized for mobile.\n\nStarting from just $50/page.\n\nTake a look when you get a chance.\n\nBest,\nDhruvil\nCloudGenZ\n\ndhruvil@cloudgenz.com\nCall/WhatsApp: +1 519-778-0245`;
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

import puppeteer, { Browser } from 'puppeteer';
import { d1Select, d1Execute, d1SelectOne, r2Upload } from '../services/cloudflare.js';
import { createLogger } from '../services/logger.js';
import { lookupDesignSystem, DesignSystem } from '../services/design-lookup.js';
import { config } from '../config.js';
import { nanoid } from 'nanoid';
import { writeFileSync, existsSync, unlinkSync, mkdirSync, readFileSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const log = createLogger('generator-v3');

const GEN_DIR = '/tmp/client-scraper-gen';
const SKILLS_DIR = join(__dirname, '../prompts/mac-skills');
const FADEKINGZZ_DIR = join(__dirname, '../prompts/fadekingzz-steering');

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

interface StepResult {
  success: boolean;
  fileSize: number;
  reason?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// SKILL LOADER
// ─────────────────────────────────────────────────────────────────────────────

function loadSkill(name: string): string {
  const macPath = join(SKILLS_DIR, name, 'SKILL.md');
  try { return readFileSync(macPath, 'utf-8'); } catch {}
  const fadePath = join(FADEKINGZZ_DIR, name, 'SKILL.md');
  try { return readFileSync(fadePath, 'utf-8'); } catch {}
  return '';
}

function loadReference(name: string): string {
  const refPath = join(SKILLS_DIR, 'frontend-design', 'reference', `${name}.md`);
  try { return readFileSync(refPath, 'utf-8'); } catch {}
  return '';
}

// ─────────────────────────────────────────────────────────────────────────────
// KIRO-CLI INVOCATION
// ─────────────────────────────────────────────────────────────────────────────

function invokeKiro(prompt: string, timeoutSec: number = 300): string {
  try {
    const promptFile = join(GEN_DIR, `prompt-${Date.now()}.txt`);
    writeFileSync(promptFile, prompt, 'utf-8');

    const result = execSync(
      `cat "${promptFile}" | timeout ${timeoutSec} kiro-cli chat --no-interactive --agent website-generator 2>/dev/null`,
      {
        encoding: 'utf-8',
        timeout: (timeoutSec + 30) * 1000,
        maxBuffer: 10 * 1024 * 1024,
        cwd: GEN_DIR,
      }
    );

    try { unlinkSync(promptFile); } catch {}
    return result;
  } catch (err: unknown) {
    const error = err as Error & { stdout?: string; stderr?: string };
    if (error.stdout && error.stdout.length > 100) return error.stdout;
    throw new Error(`kiro-cli invocation failed: ${error.message?.substring(0, 200)}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// TRUNCATION GUARD - ensures kiro didn't destroy the file
// ─────────────────────────────────────────────────────────────────────────────

function checkFileIntegrity(filePath: string, minSize: number, prevSize: number): StepResult {
  if (!existsSync(filePath)) {
    return { success: false, fileSize: 0, reason: 'File does not exist' };
  }
  const content = readFileSync(filePath, 'utf-8');
  const size = content.length;

  if (size < minSize) {
    return { success: false, fileSize: size, reason: `File too small (${size} < ${minSize})` };
  }
  // If kiro truncated more than 40% of the file, reject
  if (prevSize > 0 && size < prevSize * 0.6) {
    return { success: false, fileSize: size, reason: `Truncated (${size} < 60% of ${prevSize})` };
  }
  if (!content.includes('<body') || !content.includes('</html>')) {
    return { success: false, fileSize: size, reason: 'Missing <body> or </html> tags' };
  }
  return { success: true, fileSize: size };
}

// ─────────────────────────────────────────────────────────────────────────────
// UNSPLASH IMAGE HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function getHeroImageUrl(niche: string): string {
  const heroPhotos: Record<string, string> = {
    fence_installer: 'photo-1558618666-fcd25c85f82e',
    plumber: 'photo-1585704032915-c3400ca199e7',
    electrician: 'photo-1565538810643-b5bdb714032a',
    roofer: 'photo-1570129477492-45c003edd2be',
    hvac: 'photo-1631545806609-4ec9e4a7e8c4',
    landscaper: 'photo-1558904541-efa843a96f01',
    painter: 'photo-1562259949-e8e7689d7828',
    dentist: 'photo-1629909613654-28e377c37b09',
    barber: 'photo-1585747860019-024a6d2c8549',
    restaurant: 'photo-1517248135467-4c7edcad34c4',
    mechanic: 'photo-1487754180451-c456f719a1fc',
    general_contractor: 'photo-1600585154340-be6161a56a0c',
  };
  const id = heroPhotos[niche] || heroPhotos.general_contractor;
  return `https://images.unsplash.com/${id}?w=1400&h=700&fit=crop&q=80&auto=format`;
}

function getSectionImages(niche: string): string[] {
  const nicheImages: Record<string, string[]> = {
    fence_installer: [
      'photo-1622993494183-b31be2865ed4', // wood fence
      'photo-1600585154340-be6161a56a0c', // home exterior
      'photo-1600566753190-17f0baa2a6c0', // backyard
      'photo-1600596542815-ffad4c1539a9', // deck/patio
    ],
    plumber: [
      'photo-1585704032915-c3400ca199e7',
      'photo-1552321554-5fefe8c9ef14',
      'photo-1584622650111-993a426fbf0a',
      'photo-1507003211169-0a1dd7228f2d',
    ],
    electrician: [
      'photo-1565538810643-b5bdb714032a',
      'photo-1558618666-fcd25c85f82e',
      'photo-1600585154340-be6161a56a0c',
      'photo-1558002038-1055907df827',
    ],
    general_contractor: [
      'photo-1600585154340-be6161a56a0c',
      'photo-1600566753190-17f0baa2a6c0',
      'photo-1600596542815-ffad4c1539a9',
      'photo-1600607687939-ce8a6c25118c',
    ],
  };
  const photos = nicheImages[niche] || nicheImages.general_contractor;
  return photos.map(id => `https://images.unsplash.com/${id}?w=800&h=500&fit=crop&q=80&auto=format`);
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN ENTRY
// ─────────────────────────────────────────────────────────────────────────────

export async function runGenerator(): Promise<{ generated: number; failed: number }> {
  let generated = 0;
  let failed = 0;

  mkdirSync(GEN_DIR, { recursive: true });

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
        `UPDATE prospects SET locked_until = datetime('now', '+15 minutes'), locked_by = 'generator-v3' WHERE id = ?`,
        [prospect.id]
      );

      const niche = await d1SelectOne<NicheRow>('SELECT * FROM niches WHERE id = ?', [prospect.niche_id || 'plumber']);
      if (!niche) continue;

      log.info('=== Pipeline V3 Start ===', { id: prospect.id, name: prospect.business_name });
      const startTime = Date.now();

      const result = await runPipelineV3(prospect, niche);
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
        log.info(`=== Pipeline V3 Success (${elapsed}s) ===`, { id: prospect.id, slug, score: result.score });
      } else {
        await d1Execute(
          `UPDATE prospects SET stage = 'qa_failed', qa_score = ?, qa_feedback = ?,
           locked_until = NULL, locked_by = NULL, updated_at = datetime('now') WHERE id = ?`,
          [result.score, result.issues.join('; '), prospect.id]
        );
        failed++;
        log.warn(`=== Pipeline V3 Failed (${elapsed}s) ===`, { id: prospect.id, issues: result.issues });
      }

      await sleep(3000);
    } catch (err: unknown) {
      const error = err as Error;
      failed++;
      log.error('Pipeline V3 error', { id: prospect.id, error: error.message.substring(0, 300) });
      await d1Execute(
        `UPDATE prospects SET retry_count = retry_count + 1, last_error = ?,
         locked_until = NULL, locked_by = NULL, updated_at = datetime('now') WHERE id = ?`,
        [error.message.substring(0, 200), prospect.id]
      );
    }
  }

  log.info('Generator V3 run complete', { generated, failed });
  return { generated, failed };
}

// ═══════════════════════════════════════════════════════════════════════════════
// 5-STEP PIPELINE ORCHESTRATOR WITH RETRY LOOP
// ═══════════════════════════════════════════════════════════════════════════════

async function runPipelineV3(prospect: ProspectRow, niche: NicheRow): Promise<{
  pass: boolean; html: string; score: number; issues: string[];
}> {
  const designSystem = lookupDesignSystem(niche.name, prospect.city || undefined);
  const workFile = join(GEN_DIR, `${prospect.id}.html`);
  const nicheId = prospect.niche_id || 'general_contractor';

  // Clean any previous work file
  if (existsSync(workFile)) unlinkSync(workFile);

  const context = { prospect, niche, designSystem, workFile, nicheId };

  // ═══ STEP 1: Structure & Content ═══
  const step1Ok = await runStepWithRetry('1-structure', () => stepStructure(context), workFile, 500, 0);
  if (!step1Ok) throw new Error('Step 1 (Structure) failed after retry');
  const afterStep1 = readFileSync(workFile, 'utf-8').length;
  log.info('[Step 1] Structure done', { size: afterStep1 });

  // ═══ STEP 2: Visual Identity (images, colors, bolder typography) ═══
  const step2Ok = await runStepWithRetry('2-visual', () => stepVisualIdentity(context), workFile, 500, afterStep1);
  if (!step2Ok) log.warn('[Step 2] Visual identity failed, continuing with step 1 output');
  log.info('[Step 2] Visual identity done', { size: readFileSync(workFile, 'utf-8').length });

  // ═══ STEP 3: Motion & Delight (animations, micro-interactions) ═══
  const afterStep2 = readFileSync(workFile, 'utf-8').length;
  const step3Ok = await runStepWithRetry('3-motion', () => stepMotionDelight(context), workFile, 500, afterStep2);
  if (!step3Ok) log.warn('[Step 3] Motion failed, continuing');
  log.info('[Step 3] Motion done', { size: readFileSync(workFile, 'utf-8').length });

  // ═══ STEP 4: Polish & Responsive ═══
  const afterStep3 = readFileSync(workFile, 'utf-8').length;
  const step4Ok = await runStepWithRetry('4-polish', () => stepPolishResponsive(context), workFile, 500, afterStep3);
  if (!step4Ok) log.warn('[Step 4] Polish failed, continuing');
  log.info('[Step 4] Polish done', { size: readFileSync(workFile, 'utf-8').length });

  // ═══ STEP 5: Validate & Fix ═══
  const html = readFileSync(workFile, 'utf-8');
  log.info('[Step 5] Validating...');
  let validation = await validateWithPuppeteer(html, prospect);

  // If validation fails, one targeted fix attempt
  if (!validation.pass && validation.issues.length <= 5) {
    log.info('[Step 5] Issues found, running fix pass', { issues: validation.issues });
    await stepTargetedFix(context, validation.issues);
    const integrity = checkFileIntegrity(workFile, 500, html.length);
    if (integrity.success) {
      const fixedHtml = readFileSync(workFile, 'utf-8');
      validation = await validateWithPuppeteer(fixedHtml, prospect);
      log.info('[Step 5] Re-validated after fix', { pass: validation.pass, score: validation.score });
    }
  }

  const finalHtml = readFileSync(workFile, 'utf-8');
  return { pass: validation.pass, html: finalHtml, score: validation.score, issues: validation.issues };
}

// ─────────────────────────────────────────────────────────────────────────────
// RETRY ORCHESTRATOR - runs a step, checks integrity, retries once on failure
// ─────────────────────────────────────────────────────────────────────────────

async function runStepWithRetry(
  stepName: string,
  stepFn: () => void,
  workFile: string,
  minSize: number,
  prevSize: number,
): Promise<boolean> {
  // Backup current file before step (for rollback on truncation)
  const backup = existsSync(workFile) ? readFileSync(workFile, 'utf-8') : null;

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      log.info(`[${stepName}] attempt ${attempt}...`);
      stepFn();

      const integrity = checkFileIntegrity(workFile, minSize, prevSize);
      if (integrity.success) {
        return true;
      }

      // Truncation detected - restore backup and retry
      log.warn(`[${stepName}] integrity check failed`, { reason: integrity.reason, attempt });
      if (backup && attempt < 2) {
        writeFileSync(workFile, backup, 'utf-8');
      }
    } catch (err: unknown) {
      log.warn(`[${stepName}] error`, { error: (err as Error).message.substring(0, 150), attempt });
      if (backup && attempt < 2) {
        writeFileSync(workFile, backup, 'utf-8');
      }
    }
  }

  // Both attempts failed - restore backup if exists
  if (backup) writeFileSync(workFile, backup, 'utf-8');
  return false;
}

// ═══════════════════════════════════════════════════════════════════════════════
// STEP 1: STRUCTURE & CONTENT
// Skills: frontend-design + ui-ux-pro-max design system
// Creates the full HTML from scratch with proper layout, real content, images
// ═══════════════════════════════════════════════════════════════════════════════

function stepStructure(ctx: {
  prospect: ProspectRow; niche: NicheRow; designSystem: DesignSystem; workFile: string; nicheId: string;
}): void {
  const { prospect, niche, designSystem, workFile, nicheId } = ctx;
  const features: string[] = JSON.parse(niche.features);
  let services: string[] = [];
  let headings: string[] = [];

  if (prospect.source_data) {
    try {
      const data = JSON.parse(prospect.source_data);
      services = Array.isArray(data.scraped?.services) ? data.scraped.services
        : Array.isArray(data.services) ? data.services : [];
      headings = Array.isArray(data.scraped?.headings) ? data.scraped.headings
        : Array.isArray(data.headings) ? data.headings : [];
    } catch {}
  }

  const frontendDesignSkill = loadSkill('frontend-design');
  const heroImage = getHeroImageUrl(nicheId);
  const sectionImages = getSectionImages(nicheId);

  const prompt = `You are a world-class web designer. Create a STUNNING single-page website and WRITE it to: ${workFile}

Use the write/fs_write tool to write the COMPLETE HTML to that exact path. Start with <!DOCTYPE html>, end with </html>.

=== DESIGN SKILL (follow strictly - this is from impeccable.style) ===
${frontendDesignSkill.substring(0, 4500)}
=== END SKILL ===

=== CRITICAL ANTI-PATTERNS (NEVER do these) ===
- ❌ NO identical card grids (same-sized cards with icon + heading + text repeated)
- ❌ NO Inter, Roboto, Arial as display font - use a DISTINCTIVE Google Font
- ❌ NO centering everything - left-align text, use asymmetric layouts
- ❌ NO wrapping everything in cards - vary container treatments
- ❌ NO same padding/spacing everywhere - create VISUAL RHYTHM
- ❌ NO rounded rectangles with generic shadows (AI slop look)
- ❌ NO big colored icons above headings (the #1 AI tell)
=== END ===

=== DESIGN SYSTEM (from ui-ux-pro-max) ===
${designSystem.raw.substring(0, 1500)}
=== END ===

=== REAL IMAGES (Unsplash - use these in your HTML) ===
Hero: ${heroImage}
Service 1: ${sectionImages[0]}
Service 2: ${sectionImages[1]}
About/Trust: ${sectionImages[2]}
Features: ${sectionImages[3]}
Use as <img src="URL" alt="description" style="width:100%;height:auto;object-fit:cover;border-radius:12px">
Or as background: background: url('URL') center/cover;
=== END IMAGES ===

=== BUSINESS DATA ===
Name: ${prospect.business_name}
Industry: ${niche.name}
Phone: ${prospect.phone_raw || 'N/A'}
Address: ${prospect.address || `${prospect.city || ''}, ${prospect.state_province || ''}`}
Rating: ${prospect.google_rating || 'N/A'}★ (${prospect.google_review_count || 0} reviews)
Owner: ${prospect.owner_name || 'the team'}
Services: ${services.slice(0, 8).join(', ') || features.slice(0, 6).join(', ')}
Headings from their current site: ${headings.slice(0, 5).join(' | ') || 'N/A'}
=== END DATA ===

=== STRUCTURE (6+ sections, each with DIFFERENT layout) ===
1. HERO: Full-viewport, Unsplash background with gradient overlay, HUGE headline (clamp(2.5rem,7vw,5rem)), CTA button with tel: link
2. SERVICES: Alternating layout (text+image side-by-side, flip direction each row). Use the service images. NOT a card grid.
3. TRUST/STATS: Bold oversized numbers (4-6rem) for rating, years, projects. Horizontal strip.
4. WHY CHOOSE US: Split-screen or offset layout with checklist + image. NOT 3 cards.
5. TESTIMONIALS: Full-width editorial quote with large quotation mark, customer name
6. CONTACT CTA: Dark full-width section, phone number prominent as tel: link, simple CTA
7. FOOTER: Minimal - business name, address, phone, copyright

REQUIREMENTS:
- Google Font via <link> (choose: Sora, Space Grotesk, DM Sans, Outfit, or Manrope)
- Phone clickable: <a href="tel:${prospect.phone_raw}">${prospect.phone_raw}</a>
- ALL images from the URLs above (copy them exactly)
- Page 2000px+ tall
- Responsive with @media (max-width: 768px)
- CSS reset with box-sizing: border-box
- NO placeholder text, NO lorem ipsum

WRITE THE COMPLETE HTML TO: ${workFile}`;

  invokeKiro(prompt, 240);
}

// ═══════════════════════════════════════════════════════════════════════════════
// STEP 2: VISUAL IDENTITY
// Skills: bolder + colorize
// Enhances: adds more images, bolder typography, deeper colors, stronger brand
// ═══════════════════════════════════════════════════════════════════════════════

function stepVisualIdentity(ctx: {
  prospect: ProspectRow; niche: NicheRow; designSystem: DesignSystem; workFile: string; nicheId: string;
}): void {
  const { prospect, designSystem, workFile, nicheId } = ctx;
  const bolderSkill = loadSkill('bolder');
  const colorizeSkill = loadSkill('colorize');
  const sectionImages = getSectionImages(nicheId);

  const prompt = `You are a visual identity specialist. READ the HTML file at ${workFile}, enhance its visual impact, and WRITE the improved version BACK to the same file: ${workFile}

Use the read tool to read the file, then use write/fs_write to write the enhanced version back.

=== BOLDER SKILL (make it more impactful) ===
${bolderSkill.substring(0, 2500)}
=== END ===

=== COLORIZE SKILL (strategic color usage) ===
${colorizeSkill.substring(0, 2000)}
=== END ===

=== YOUR TASKS ===
1. IMAGES: Ensure EVERY section has at least one image. If a section is missing an image, add one from these Unsplash URLs:
   - ${sectionImages[0]}
   - ${sectionImages[1]}
   - ${sectionImages[2]}
   - ${sectionImages[3]}
   Use: <img src="URL" alt="descriptive text" style="width:100%;height:300px;object-fit:cover;border-radius:12px">

2. TYPOGRAPHY: Make headings dramatically larger. h1 should be clamp(3rem,8vw,6rem). h2 should be clamp(2rem,5vw,3.5rem). Add font-weight: 800 or 900 for display headings.

3. COLOR DEPTH: Add color accents beyond just the primary. Use gradients on accent sections. Add colored underlines or highlights on key words.

4. VISUAL WEIGHT: Add background color blocks behind sections (alternating light/dark). No section should be plain white with just text.

5. LOGO: If there's no proper logo, add a CSS text-logo using the first letter in a colored circle:
   <div style="display:inline-flex;align-items:center;gap:12px">
     <span style="background:${designSystem.colors.primary};color:#fff;width:40px;height:40px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:18px">${prospect.business_name.charAt(0)}</span>
     <span style="font-weight:700;font-size:20px">${prospect.business_name.split(' ').slice(0, 2).join(' ')}</span>
   </div>

=== CRITICAL RULES ===
- Do NOT remove any sections or text content
- Do NOT change the business name, phone, or address
- Do NOT remove existing images - only ADD more
- KEEP all existing HTML structure - you are ENHANCING, not rewriting
- The file MUST still have <!DOCTYPE html> and </html>
- WRITE the full enhanced HTML back to: ${workFile}`;

  invokeKiro(prompt, 180);
}

// ═══════════════════════════════════════════════════════════════════════════════
// STEP 3: MOTION & DELIGHT
// Skills: animate + delight
// Adds: scroll animations, hover effects, entrance sequences
// ═══════════════════════════════════════════════════════════════════════════════

function stepMotionDelight(ctx: {
  prospect: ProspectRow; niche: NicheRow; designSystem: DesignSystem; workFile: string; nicheId: string;
}): void {
  const { workFile, designSystem } = ctx;
  const animateSkill = loadSkill('animate');
  const motionRef = loadReference('motion-design');

  const prompt = `You are an animation specialist. READ the HTML file at ${workFile}, add purposeful motion/animations, and WRITE back to: ${workFile}

=== ANIMATE SKILL ===
${animateSkill.substring(0, 2500)}
=== END ===

=== MOTION DESIGN REFERENCE ===
${motionRef.substring(0, 1500)}
=== END ===

=== ADD THESE SPECIFIC ENHANCEMENTS (CSS only, in a new <style id="v3-motion"> block) ===

1. ENTRANCE ANIMATIONS:
@keyframes fadeInUp { from { opacity:0; transform:translateY(40px) } to { opacity:1; transform:translateY(0) } }
@keyframes slideInLeft { from { opacity:0; transform:translateX(-40px) } to { opacity:1; transform:translateX(0) } }
@keyframes slideInRight { from { opacity:0; transform:translateX(40px) } to { opacity:1; transform:translateX(0) } }
@keyframes scaleIn { from { opacity:0; transform:scale(0.9) } to { opacity:1; transform:scale(1) } }

section { animation: fadeInUp 0.7s ease-out both; }
section:nth-child(odd) img { animation: slideInLeft 0.8s ease-out both; animation-delay: 0.2s; }
section:nth-child(even) img { animation: slideInRight 0.8s ease-out both; animation-delay: 0.2s; }

2. HOVER MICRO-INTERACTIONS:
a, button { transition: all 0.3s cubic-bezier(0.4,0,0.2,1); }
button:hover, a[href^="tel"]:hover { transform: translateY(-2px); box-shadow: 0 8px 25px ${designSystem.colors.primary}33; }
img:hover { transform: scale(1.02); transition: transform 0.4s ease; }

3. STAGGER DELAY for child elements:
section > *:nth-child(1) { animation-delay: 0s; }
section > *:nth-child(2) { animation-delay: 0.1s; }
section > *:nth-child(3) { animation-delay: 0.2s; }
section > *:nth-child(4) { animation-delay: 0.3s; }

4. SMOOTH SCROLL: html { scroll-behavior: smooth; }

5. REDUCED MOTION RESPECT:
@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; } }

=== RULES ===
- ADD a new <style id="v3-motion"> block before </head>. Do NOT modify existing CSS.
- Do NOT change text content or HTML structure
- Do NOT remove anything
- WRITE the complete file back to: ${workFile}`;

  invokeKiro(prompt, 120);
}

// ═══════════════════════════════════════════════════════════════════════════════
// STEP 4: POLISH & RESPONSIVE
// Skills: polish + responsive reference
// Final quality pass: spacing, alignment, mobile breakpoints
// ═══════════════════════════════════════════════════════════════════════════════

function stepPolishResponsive(ctx: {
  prospect: ProspectRow; niche: NicheRow; designSystem: DesignSystem; workFile: string; nicheId: string;
}): void {
  const { workFile } = ctx;
  const polishSkill = loadSkill('polish');
  const responsiveRef = loadReference('responsive-design');

  const prompt = `You are a frontend polish specialist. READ the HTML file at ${workFile}, apply final polish, and WRITE back to: ${workFile}

=== POLISH SKILL ===
${polishSkill.substring(0, 2500)}
=== END ===

=== RESPONSIVE REFERENCE ===
${responsiveRef.substring(0, 1500)}
=== END ===

=== YOUR TASKS ===

1. MOBILE RESPONSIVE (add/enhance @media queries):
@media (max-width: 768px) {
  - Stack all side-by-side layouts vertically
  - Reduce heading sizes by ~30%
  - Reduce section padding to 40px 20px
  - Make images full-width
  - Stack navigation items or use hamburger
  - Ensure no horizontal overflow (max-width: 100vw; overflow-x: hidden on body)
}

2. SPACING CONSISTENCY:
  - Section padding should have RHYTHM (alternate 80px/100px/120px, not same everywhere)
  - Consistent gap between heading and paragraph (1rem)
  - Generous whitespace around stat numbers

3. ALIGNMENT:
  - Text containers max-width: 700px for readability
  - Images should have consistent border-radius (12px)
  - Buttons should have consistent padding (16px 32px) and font-size

4. DETAILS:
  - All links should have hover opacity or color change
  - Phone numbers must have cursor: pointer
  - Images need alt text
  - Smooth transitions on interactive elements (0.3s ease)

=== RULES ===
- ADD/MODIFY CSS only. Do NOT remove content or sections.
- KEEP all images and text intact
- WRITE the complete polished file back to: ${workFile}`;

  invokeKiro(prompt, 120);
}

// ═══════════════════════════════════════════════════════════════════════════════
// STEP 5: TARGETED FIX (only runs if validation fails)
// Fixes specific issues identified by Puppeteer validation
// ═══════════════════════════════════════════════════════════════════════════════

function stepTargetedFix(ctx: {
  prospect: ProspectRow; niche: NicheRow; designSystem: DesignSystem; workFile: string; nicheId: string;
}, issues: string[]): void {
  const { prospect, workFile } = ctx;

  const prompt = `READ the HTML file at ${workFile} and fix these specific issues. WRITE the fixed version back to: ${workFile}

=== ISSUES TO FIX ===
${issues.map((i, idx) => `${idx + 1}. ${i}`).join('\n')}

=== CONTEXT ===
Business: ${prospect.business_name}
Phone: ${prospect.phone_raw || 'N/A'}
City: ${prospect.city}, ${prospect.state_province}

=== RULES ===
- Fix ONLY the listed issues
- Do NOT remove existing content or sections
- Do NOT change the overall design
- Preserve all images and their URLs
- File must have <!DOCTYPE html> and </html>
- WRITE the complete fixed HTML to: ${workFile}`;

  invokeKiro(prompt, 120);
}

// ─────────────────────────────────────────────────────────────────────────────
// PUPPETEER VALIDATION
// ─────────────────────────────────────────────────────────────────────────────

async function validateWithPuppeteer(html: string, prospect: ProspectRow): Promise<ValidationResult> {
  const issues: string[] = [];
  let score = 1.0;

  // Basic HTML checks
  if (!html.includes('<!DOCTYPE html') && !html.includes('<!doctype html')) {
    issues.push('Missing DOCTYPE'); score -= 0.1;
  }
  if (!html.includes('box-sizing')) {
    issues.push('Missing CSS reset (box-sizing)'); score -= 0.05;
  }
  if (!html.includes('@media')) {
    issues.push('Missing responsive @media queries'); score -= 0.15;
  }
  const bizNameFirst = prospect.business_name.split(' ')[0].toLowerCase();
  if (!html.toLowerCase().includes(bizNameFirst)) {
    issues.push('Business name not found in HTML'); score -= 0.2;
  }
  if (prospect.phone_raw && !html.includes('tel:')) {
    issues.push('Phone not a clickable tel: link'); score -= 0.1;
  }
  if (!html.includes('unsplash.com')) {
    issues.push('No Unsplash images found'); score -= 0.1;
  }

  // Puppeteer structure checks
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
    await page.goto(`file://${htmlPath}`, { waitUntil: 'domcontentloaded', timeout: 10000 });

    const checks = await page.evaluate(() => {
      const body = document.body;
      const sections = document.querySelectorAll('section, header, footer, [class*="section"], main > div').length;
      const images = document.querySelectorAll('img').length;
      const hasBoxShadow = !!document.querySelector('style')?.textContent?.includes('box-shadow');
      const pageHeight = body.scrollHeight;
      const textLength = body.innerText.length;
      const hasAnimations = !!document.querySelector('style')?.textContent?.includes('@keyframes');
      const hasGoogleFont = !!document.querySelector('link[href*="fonts.googleapis"]');

      return { sections, images, hasBoxShadow, pageHeight, textLength, hasAnimations, hasGoogleFont };
    });

    await page.close();

    if (checks.textLength < 1000) {
      issues.push(`Insufficient content (${checks.textLength} chars, need 1000+)`); score -= 0.15;
    }
    if (checks.sections < 4) {
      issues.push(`Only ${checks.sections} sections (need 4+)`); score -= 0.15;
    }
    if (checks.images < 2) {
      issues.push(`Only ${checks.images} images (need 2+)`); score -= 0.1;
    }
    if (checks.pageHeight < 1500) {
      issues.push(`Page too short (${checks.pageHeight}px, need 1500+)`); score -= 0.1;
    }
    if (!checks.hasGoogleFont) {
      issues.push('No Google Font loaded'); score -= 0.05;
    }
  } finally {
    if (browser) await browser.close();
    if (existsSync(htmlPath)) unlinkSync(htmlPath);
  }

  score = Math.max(0, Math.min(1, score));
  const pass = score >= 0.70 && issues.length <= 3;

  log.info('[Validate]', { pass, score: score.toFixed(2), issues });
  return { pass, score, issues };
}

// ─────────────────────────────────────────────────────────────────────────────
// UTILITIES
// ─────────────────────────────────────────────────────────────────────────────

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

  const emailFile = join(GEN_DIR, `${prospect.id}-email.json`);

  const prompt = template === 'no_website'
    ? `Write a personalized cold email for a ${niche.name} business owner without a website. I built them a sample site.

Business: ${prospect.business_name}, Owner: ${ownerName || 'Unknown'}, Location: ${prospect.city}, ${prospect.state_province}
Rating: ${prospect.google_rating || 'N/A'}★ (${prospect.google_review_count || 0} reviews)
Preview: ${portfolioUrl}
Features: ${features.join(', ')}

Rules: Open with "${greeting}", mention their preview site, reference their rating/location, highlight 2-3 features, soft CTA, under 150 words, sign as "Dhruvil" from CloudGenZ, include "Starting from just $50/page", include "dhruvil@cloudgenz.com | Call/WhatsApp: +1 519-778-0245"

Write ONLY valid JSON to ${emailFile}: {"subject": "short curiosity subject", "body_html": "<p>HTML email</p>", "body_text": "plain text"}`
    : `Write a cold email for a ${niche.name} with an outdated website. I built a redesign preview.

Business: ${prospect.business_name}, Current site: ${prospect.website_url}, PageSpeed: ${prospect.pagespeed_mobile}/100
Location: ${prospect.city}, ${prospect.state_province}, Preview: ${portfolioUrl}

Rules: Reference current site positively, mention PageSpeed score, include preview link, under 150 words, sign as "Dhruvil" from CloudGenZ, include pricing "$50/page", include contact info.

Write ONLY valid JSON to ${emailFile}: {"subject": "short subject", "body_html": "<p>HTML body</p>", "body_text": "plain text"}`;

  try {
    invokeKiro(prompt, 60);
    if (existsSync(emailFile)) {
      let jsonStr = readFileSync(emailFile, 'utf-8').trim();
      if (jsonStr.startsWith('```')) jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
      const parsed = JSON.parse(jsonStr);
      if (parsed.subject && parsed.body_html && parsed.body_text) {
        try { unlinkSync(emailFile); } catch {}
        return parsed;
      }
    }
  } catch (err) {
    log.warn('Email generation failed, using template', { error: (err as Error).message.substring(0, 100) });
  }

  const body = `${greeting},\n\nI came across ${prospect.business_name} and built a sample website preview for you: ${portfolioUrl}\n\nIt includes ${features.join(', ')} - all optimized for mobile.\n\nStarting from just $50/page.\n\nTake a look when you get a chance.\n\nBest,\nDhruvil\nCloudGenZ\n\ndhruvil@cloudgenz.com\nCall/WhatsApp: +1 519-778-0245`;
  return {
    subject: `I built a sample website for ${prospect.business_name}`,
    body_html: `<p>${body.replace(/\n/g, '</p><p>')}</p>`,
    body_text: body,
  };
}

function generateSlug(name: string, city: string | null): string {
  const base = `${name}${city ? '-' + city : ''}`
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').substring(0, 60);
  return `${base}-${nanoid(4)}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

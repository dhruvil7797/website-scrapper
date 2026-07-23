import puppeteer from 'puppeteer';
import * as cheerio from 'cheerio';
import { d1Select, d1Execute, r2Upload } from '../services/cloudflare.js';
import { detectEmailType, normalizePhone } from '../services/scoring.js';
import { createLogger } from '../services/logger.js';
import { config } from '../config.js';

const log = createLogger('scraper');

interface ProspectRow {
  id: string;
  business_name: string;
  website_url: string | null;
  city: string | null;
  state_province: string | null;
  niche_id: string | null;
  has_website: number;
}

interface ScrapedData {
  emails: string[];
  phones: string[];
  services: string[];
  ownerName: string | null;
  socialLinks: Record<string, string>;
  pageTitle: string | null;
  metaDescription: string | null;
  headings: string[];
  bodyText: string;
}

/**
 * Run the scraper stage - take screenshots and extract content from prospect websites.
 */
export async function runScraper(): Promise<{ scraped: number; failed: number; skipped: number }> {
  let scraped = 0;
  let failed = 0;
  let skipped = 0;

  // Get prospects at 'discovered' stage that have websites
  const prospects = await d1Select<ProspectRow>(
    `SELECT id, business_name, website_url, city, state_province, niche_id, has_website
     FROM prospects 
     WHERE stage = 'discovered' AND has_website = 1 AND website_url IS NOT NULL
     AND (locked_until IS NULL OR locked_until < datetime('now'))
     ORDER BY quality_score DESC
     LIMIT ?`,
    [config.worker.concurrency * 5]
  );

  // Also get no-website prospects (skip scraping, move directly to 'scraped')
  const noWebsiteProspects = await d1Select<ProspectRow>(
    `SELECT id, business_name, website_url, city, state_province, niche_id, has_website
     FROM prospects 
     WHERE stage = 'discovered' AND has_website = 0
     AND (locked_until IS NULL OR locked_until < datetime('now'))
     ORDER BY quality_score DESC
     LIMIT ?`,
    [20]
  );

  // Move no-website prospects directly to scraped (nothing to scrape)
  for (const p of noWebsiteProspects) {
    await d1Execute(
      `UPDATE prospects SET stage = 'scraped', updated_at = datetime('now') WHERE id = ?`,
      [p.id]
    );
    skipped++;
  }

  if (prospects.length === 0) {
    log.info('No prospects to scrape', { skippedNoWebsite: skipped });
    return { scraped: 0, failed: 0, skipped };
  }

  // Launch browser
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });

  try {
    for (const prospect of prospects) {
      try {
        // Lock the prospect
        await d1Execute(
          `UPDATE prospects SET locked_until = datetime('now', '+10 minutes'), locked_by = 'scraper' WHERE id = ?`,
          [prospect.id]
        );

        log.info('Scraping', { id: prospect.id, name: prospect.business_name, url: prospect.website_url });

        const page = await browser.newPage();
        await page.setViewport({ width: 1440, height: 900 });
        await page.setUserAgent(getRandomUserAgent());

        // Navigate with timeout
        try {
          await page.goto(prospect.website_url!, { waitUntil: 'networkidle2', timeout: 30000 });
        } catch (navErr) {
          // Try with just domcontentloaded if networkidle times out
          await page.goto(prospect.website_url!, { waitUntil: 'domcontentloaded', timeout: 15000 });
        }

        // Wait a bit for lazy-loaded content
        await page.evaluate(() => new Promise(r => setTimeout(r, 2000)));

        // Take screenshot
        const screenshotBuffer = await page.screenshot({ 
          type: 'png', 
          fullPage: true,
          captureBeyondViewport: true,
        }) as Buffer;

        // Upload screenshot to R2
        const screenshotKey = `screenshots/${prospect.id}.png`;
        await r2Upload(screenshotKey, screenshotBuffer, 'image/png');

        // Extract page content
        const html = await page.content();
        const scrapedData = extractContent(html);

        // Find email on the page
        const foundEmail = scrapedData.emails[0] || null;
        const emailType = detectEmailType(foundEmail);

        // Detect owner name from About page or content
        const ownerName = scrapedData.ownerName;

        // Update prospect with scraped data
        await d1Execute(
          `UPDATE prospects SET 
            stage = 'scraped',
            email = COALESCE(email, ?),
            email_type = CASE WHEN email IS NULL THEN ? ELSE email_type END,
            owner_name = COALESCE(owner_name, ?),
            screenshot_key = ?,
            source_data = json_patch(COALESCE(source_data, '{}'), ?),
            locked_until = NULL,
            locked_by = NULL,
            updated_at = datetime('now')
          WHERE id = ?`,
          [
            foundEmail,
            emailType,
            ownerName,
            screenshotKey,
            JSON.stringify({
              scraped: {
                emails: scrapedData.emails,
                phones: scrapedData.phones,
                services: scrapedData.services.slice(0, 10),
                socialLinks: scrapedData.socialLinks,
                pageTitle: scrapedData.pageTitle,
                metaDescription: scrapedData.metaDescription,
                headings: scrapedData.headings.slice(0, 10),
                bodyTextPreview: scrapedData.bodyText.substring(0, 500),
              }
            }),
            prospect.id,
          ]
        );

        await page.close();
        scraped++;
        log.info('Scraped successfully', { id: prospect.id, email: foundEmail, owner: ownerName });

        // Rate limit delay
        await sleep(config.worker.scraperDelayMs);

      } catch (err: unknown) {
        const error = err as Error;
        failed++;
        log.error('Scrape failed', { id: prospect.id, url: prospect.website_url, error: error.message });

        // Update retry count
        await d1Execute(
          `UPDATE prospects SET 
            retry_count = retry_count + 1, 
            last_error = ?,
            stage = CASE WHEN retry_count >= 2 THEN 'scrape_failed' ELSE stage END,
            locked_until = NULL,
            locked_by = NULL,
            updated_at = datetime('now')
          WHERE id = ?`,
          [error.message.substring(0, 200), prospect.id]
        );
      }
    }
  } finally {
    await browser.close();
  }

  log.info('Scraper run complete', { scraped, failed, skipped });
  return { scraped, failed, skipped };
}

function extractContent(html: string): ScrapedData {
  const $ = cheerio.load(html);

  // Extract emails
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  const bodyText = $('body').text();
  const emails = [...new Set(bodyText.match(emailRegex) || [])].filter(
    e => !e.includes('example.com') && !e.includes('wixpress') && !e.includes('sentry')
  );

  // Extract phones
  const phoneRegex = /(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)?\d{3}[-.\s]?\d{4}/g;
  const phones = [...new Set(bodyText.match(phoneRegex) || [])].slice(0, 5);

  // Extract services from headings and list items
  const services: string[] = [];
  $('h2, h3, h4').each((_, el) => {
    const text = $(el).text().trim();
    if (text.length > 3 && text.length < 100) services.push(text);
  });

  // Try to find owner name
  let ownerName: string | null = null;
  const aboutText = $('[class*="about"], [id*="about"], [class*="team"], [id*="team"]').text();
  const nameMatch = aboutText.match(/(?:owned by|operated by|founded by|meet|hi,? i'?m)\s+([A-Z][a-z]+ [A-Z][a-z]+)/i);
  if (nameMatch) ownerName = nameMatch[1];

  // Social links
  const socialLinks: Record<string, string> = {};
  $('a[href*="facebook.com"]').first().each((_, el) => { socialLinks.facebook = $(el).attr('href') || ''; });
  $('a[href*="instagram.com"]').first().each((_, el) => { socialLinks.instagram = $(el).attr('href') || ''; });
  $('a[href*="twitter.com"], a[href*="x.com"]').first().each((_, el) => { socialLinks.twitter = $(el).attr('href') || ''; });
  $('a[href*="linkedin.com"]').first().each((_, el) => { socialLinks.linkedin = $(el).attr('href') || ''; });
  $('a[href*="youtube.com"]').first().each((_, el) => { socialLinks.youtube = $(el).attr('href') || ''; });
  $('a[href*="yelp.com"]').first().each((_, el) => { socialLinks.yelp = $(el).attr('href') || ''; });

  // Page metadata
  const pageTitle = $('title').text().trim() || null;
  const metaDescription = $('meta[name="description"]').attr('content') || null;

  // Headings
  const headings: string[] = [];
  $('h1, h2, h3').each((_, el) => {
    const t = $(el).text().trim();
    if (t.length > 2 && t.length < 100) headings.push(t);
  });

  return {
    emails,
    phones,
    services,
    ownerName,
    socialLinks,
    pageTitle,
    metaDescription,
    headings,
    bodyText: bodyText.replace(/\s+/g, ' ').trim().substring(0, 2000),
  };
}

function getRandomUserAgent(): string {
  const agents = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:126.0) Gecko/20100101 Firefox/126.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  ];
  return agents[Math.floor(Math.random() * agents.length)];
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

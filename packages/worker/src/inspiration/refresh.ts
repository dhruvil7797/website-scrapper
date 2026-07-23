import puppeteer from 'puppeteer';
import { d1Select } from '../services/cloudflare.js';
import { r2Upload } from '../services/cloudflare.js';
import { createLogger } from '../services/logger.js';

const log = createLogger('inspiration-refresh');

interface Niche {
  id: string;
  name: string;
}

interface InspirationResult {
  niche: string;
  screenshots: number;
  errors: string[];
}

/**
 * Weekly worker: refresh design inspiration screenshots for each niche.
 * Searches Google for best websites in each niche, screenshots top results,
 * and uploads to R2 for the AI generator to reference.
 */
export async function runInspirationRefresh(): Promise<{ results: InspirationResult[] }> {
  log.info('Starting inspiration refresh...');

  const niches = await d1Select<Niche>('SELECT id, name FROM niches WHERE active = 1');

  if (niches.length === 0) {
    log.info('No active niches found');
    return { results: [] };
  }

  const currentYear = new Date().getFullYear();
  const results: InspirationResult[] = [];

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });

  try {
    for (const niche of niches) {
      const result: InspirationResult = { niche: niche.name, screenshots: 0, errors: [] };

      try {
        log.info(`Refreshing inspiration for: ${niche.name}`);
        const screenshots = await scrapeInspirationForNiche(browser, niche, currentYear);
        result.screenshots = screenshots;
      } catch (err: unknown) {
        const error = err as Error;
        result.errors.push(error.message);
        log.error(`Inspiration refresh failed for ${niche.name}`, { error: error.message });
      }

      results.push(result);

      // Pause between niches to avoid rate limits
      await new Promise(r => setTimeout(r, 5000));
    }
  } finally {
    await browser.close();
  }

  const totalScreenshots = results.reduce((sum, r) => sum + r.screenshots, 0);
  const totalErrors = results.reduce((sum, r) => sum + r.errors.length, 0);

  log.info('Inspiration refresh complete', {
    niches: niches.length,
    totalScreenshots,
    totalErrors,
    results: results.map(r => ({ niche: r.niche, screenshots: r.screenshots, errors: r.errors.length })),
  });

  return { results };
}

async function scrapeInspirationForNiche(
  browser: puppeteer.Browser,
  niche: Niche,
  year: number,
): Promise<number> {
  const page = await browser.newPage();
  let screenshotCount = 0;

  try {
    await page.setViewport({ width: 1440, height: 900 });
    await page.setUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    );

    // Search Google for best websites in this niche
    const query = `best ${niche.name} websites ${year}`;
    const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}`;

    await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise(r => setTimeout(r, 2000));

    // Extract organic result URLs from Google search
    const urls = await page.evaluate(() => {
      const links = document.querySelectorAll('div.g a[href^="http"]');
      const results: string[] = [];
      links.forEach(link => {
        const href = (link as HTMLAnchorElement).href;
        if (
          href &&
          !href.includes('google.com') &&
          !href.includes('youtube.com') &&
          !href.includes('wikipedia.org') &&
          !href.includes('yelp.com')
        ) {
          results.push(href);
        }
      });
      return results.slice(0, 8);
    });

    if (urls.length === 0) {
      log.warn(`No URLs found for niche: ${niche.name}`);
      return 0;
    }

    log.info(`Found ${urls.length} URLs for ${niche.name}`, { urls: urls.slice(0, 5) });

    // Visit each URL and take a screenshot
    for (let i = 0; i < Math.min(urls.length, 8); i++) {
      try {
        await page.goto(urls[i], { waitUntil: 'networkidle2', timeout: 20000 });
        await new Promise(r => setTimeout(r, 1500));

        // Take full-page screenshot
        const screenshotBuffer = await page.screenshot({
          type: 'png',
          fullPage: false, // viewport only for consistency
        });

        // Upload to R2
        const key = `inspiration/${niche.id}/${i + 1}.png`;
        await r2Upload(key, Buffer.from(screenshotBuffer), 'image/png');

        screenshotCount++;
        log.debug(`Screenshot ${i + 1} uploaded for ${niche.name}`, { url: urls[i], key });
      } catch (err: unknown) {
        log.warn(`Failed to screenshot ${urls[i]}`, { error: (err as Error).message });
      }

      // Brief pause between page loads
      await new Promise(r => setTimeout(r, 2000));
    }
  } finally {
    await page.close();
  }

  return screenshotCount;
}

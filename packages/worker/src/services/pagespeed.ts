import { config } from '../config.js';
import { createLogger } from './logger.js';

const log = createLogger('pagespeed');

interface PageSpeedResult {
  mobile: number | null;
  desktop: number | null;
}

let keyIndex = 0;

function getApiKey(): string {
  const key = config.google.apiKeys[keyIndex % config.google.apiKeys.length];
  keyIndex++;
  return key;
}

/**
 * Get PageSpeed scores for a URL.
 * Returns mobile and desktop scores (0-100).
 */
export async function getPageSpeedScores(url: string): Promise<PageSpeedResult> {
  const result: PageSpeedResult = { mobile: null, desktop: null };

  try {
    // Mobile score
    const mobileUrl = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}&strategy=mobile&key=${getApiKey()}`;
    const mobileRes = await fetch(mobileUrl);
    
    if (mobileRes.ok) {
      const mobileData = await mobileRes.json() as { lighthouseResult?: { categories?: { performance?: { score?: number } } } };
      const score = mobileData.lighthouseResult?.categories?.performance?.score;
      if (score !== undefined) {
        result.mobile = Math.round(score * 100);
      }
    }

    // Desktop score
    const desktopUrl = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}&strategy=desktop&key=${getApiKey()}`;
    const desktopRes = await fetch(desktopUrl);
    
    if (desktopRes.ok) {
      const desktopData = await desktopRes.json() as { lighthouseResult?: { categories?: { performance?: { score?: number } } } };
      const score = desktopData.lighthouseResult?.categories?.performance?.score;
      if (score !== undefined) {
        result.desktop = Math.round(score * 100);
      }
    }

    log.info('PageSpeed scores', { url, mobile: result.mobile, desktop: result.desktop });
  } catch (err: unknown) {
    const error = err as Error;
    log.error('PageSpeed API failed', { url, error: error.message });
  }

  return result;
}

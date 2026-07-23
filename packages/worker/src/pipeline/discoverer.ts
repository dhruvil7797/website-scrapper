import { config } from '../config.js';
import { d1Select, d1Execute, d1SelectOne, getSetting } from '../services/cloudflare.js';
import { normalizePhone, detectEmailType, calculateQualityScore, shouldSkipProspect } from '../services/scoring.js';
import { detectTimezone } from '../services/timezone.js';
import { getPageSpeedScores } from '../services/pagespeed.js';
import { createLogger } from '../services/logger.js';
import { nanoid } from 'nanoid';

const log = createLogger('discoverer');

let keyIndex = 0;
function getApiKey(): string {
  const key = config.google.apiKeys[keyIndex % config.google.apiKeys.length];
  keyIndex++;
  return key;
}

interface PlaceResult {
  id: string;
  displayName: { text: string };
  formattedAddress?: string;
  nationalPhoneNumber?: string;
  internationalPhoneNumber?: string;
  websiteUri?: string;
  googleMapsUri?: string;
  rating?: number;
  userRatingCount?: number;
  businessStatus?: string;
  primaryType?: string;
  regularOpeningHours?: { weekdayDescriptions?: string[] };
}

interface Campaign {
  id: string;
  name: string;
  niche_id: string;
  postal_codes: string;
  country: string;
  radius_km: number;
  daily_limit: number;
  status: string;
  total_discovered: number;
}

interface NicheRow {
  id: string;
  search_terms: string;
}

/**
 * Run discovery for all active campaigns.
 * Queries Google Places API and inserts new prospects into D1.
 */
export async function runDiscovery(): Promise<{ discovered: number; skipped: number }> {
  let totalDiscovered = 0;
  let totalSkipped = 0;

  // Get active campaigns that haven't completed bulk discovery yet
  const campaigns = await d1Select<Campaign>(
    "SELECT * FROM campaigns WHERE status = 'active' AND discovery_completed_at IS NULL"
  );

  if (campaigns.length === 0) {
    log.info('No active campaigns');
    return { discovered: 0, skipped: 0 };
  }

  const MAX_PROSPECTS_PER_CAMPAIGN = 500;

  for (const campaign of campaigns) {
    let campaignDiscovered = 0;
    const postalCodes: string[] = JSON.parse(campaign.postal_codes);
    const niche = await d1SelectOne<NicheRow>(
      'SELECT id, search_terms FROM niches WHERE id = ?',
      [campaign.niche_id]
    );

    if (!niche) {
      log.warn('Niche not found for campaign', { campaignId: campaign.id, nicheId: campaign.niche_id });
      continue;
    }

    const searchTerms: string[] = JSON.parse(niche.search_terms);
    const primaryTerm = searchTerms[0];

    for (const postalCode of postalCodes) {
      // Check 7-day cache
      const cacheKey = `discovery_cache_${campaign.niche_id}_${postalCode}`;
      const lastRun = await getSetting(cacheKey);
      if (lastRun) {
        const daysSince = (Date.now() - new Date(lastRun).getTime()) / (1000 * 60 * 60 * 24);
        if (daysSince < 7) {
          log.debug('Skipping cached postal code', { postalCode, daysSince: Math.round(daysSince) });
          continue;
        }
      }

      // Search Google Places
      const results = await searchPlaces(primaryTerm, postalCode, campaign.country, campaign.radius_km);
      
      for (const place of results) {
        const phone = place.nationalPhoneNumber || place.internationalPhoneNumber || null;
        const phoneNormalized = normalizePhone(phone);
        const city = extractCity(place.formattedAddress || '');

        // Dedup check
        if (phoneNormalized && city) {
          const existing = await d1SelectOne(
            'SELECT id FROM prospects WHERE phone_normalized = ? AND city = ?',
            [phoneNormalized, city]
          );
          if (existing) {
            totalSkipped++;
            continue;
          }
        }

        // Detect email type
        const emailType = detectEmailType(null); // Will be populated during scraping

        // PageSpeed deferred to scraper stage (too slow for bulk discovery)
        let pagespeedMobile: number | null = null;
        let pagespeedDesktop: number | null = null;

        // Detect timezone
        const state = extractState(place.formattedAddress || '');
        const timezone = detectTimezone(city, state, campaign.country);

        // Calculate quality score
        const { score, breakdown } = calculateQualityScore({
          has_website: !!place.websiteUri,
          website_url: place.websiteUri,
          pagespeed_mobile: pagespeedMobile,
          google_rating: place.rating || null,
          google_review_count: place.userRatingCount || null,
          business_age_months: null,
          email: null,
          email_type: null,
          has_social_media: false,
          multiple_locations: false,
          is_franchise: false,
        });

        // Skip if website is already good (no point reaching out)
        const skipCheck = shouldSkipProspect({
          has_website: !!place.websiteUri,
          pagespeed_mobile: pagespeedMobile,
          design_score: null, // Not available at discovery stage
        });

        if (skipCheck.skip) {
          log.debug('Skipping - website already good', { name: place.displayName.text, reason: skipCheck.reason });
          totalSkipped++;
          continue;
        }

        // Insert prospect
        const id = nanoid(16);
        await d1Execute(
          `INSERT OR IGNORE INTO prospects (
            id, business_name, phone_raw, phone_normalized, website_url,
            address, city, state_province, postal_code, country, timezone,
            campaign_id, niche_id, source, source_data,
            google_rating, google_review_count, has_website,
            pagespeed_mobile, pagespeed_desktop,
            quality_score, score_breakdown, stage, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'discovered', datetime('now'), datetime('now'))`,
          [
            id, place.displayName.text, phone, phoneNormalized, place.websiteUri || null,
            place.formattedAddress || null, city, state, postalCode, campaign.country, timezone,
            campaign.id, campaign.niche_id, 'google_maps', JSON.stringify({ placeId: place.id, rating: place.rating }),
            place.rating || null, place.userRatingCount || null, place.websiteUri ? 1 : 0,
            pagespeedMobile, pagespeedDesktop,
            score, JSON.stringify(breakdown),
          ]
        );

        totalDiscovered++;
        campaignDiscovered++;
      }

      // Stop if we've hit the cap for this campaign
      if (campaignDiscovered >= MAX_PROSPECTS_PER_CAMPAIGN) {
        log.info('Campaign hit discovery cap', { campaignId: campaign.id, cap: MAX_PROSPECTS_PER_CAMPAIGN });
        break;
      }

      // Update cache
      await d1Execute(
        `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
         ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = datetime('now')`,
        [cacheKey, new Date().toISOString(), new Date().toISOString()]
      );

      // Rate limit between postal codes
      await sleep(2000);
    }

    // Update campaign total + mark discovery as complete
    await d1Execute(
      `UPDATE campaigns SET 
        total_discovered = ?, 
        discovery_completed_at = datetime('now'),
        updated_at = datetime('now') 
      WHERE id = ?`,
      [campaignDiscovered, campaign.id]
    );
    log.info('Campaign discovery complete', { campaignId: campaign.id, name: campaign.name, discovered: campaignDiscovered });
  }

  log.info('Discovery complete', { discovered: totalDiscovered, skipped: totalSkipped });
  return { discovered: totalDiscovered, skipped: totalSkipped };
}

async function searchPlaces(query: string, postalCode: string, country: string, radiusKm: number): Promise<PlaceResult[]> {
  const textQuery = `${query} near ${postalCode} ${country}`;
  const apiKey = getApiKey();
  
  const url = 'https://places.googleapis.com/v1/places:searchText';
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.internationalPhoneNumber,places.websiteUri,places.rating,places.userRatingCount,places.businessStatus',
    },
    body: JSON.stringify({
      textQuery,
      maxResultCount: 20,
      languageCode: 'en',
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    log.error('Places API failed', { status: res.status, error: err, query: textQuery });
    return [];
  }

  const data = await res.json() as { places?: PlaceResult[] };
  return data.places || [];
}

function extractCity(address: string): string | null {
  // Format: "123 Main St, Austin, TX 78701, USA"
  const parts = address.split(',').map(p => p.trim());
  if (parts.length >= 3) return parts[parts.length - 3] || null;
  if (parts.length >= 2) return parts[0] || null;
  return null;
}

function extractState(address: string): string | null {
  // Look for 2-letter state code
  const match = address.match(/\b([A-Z]{2})\s+\d{5}/);
  return match ? match[1] : null;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

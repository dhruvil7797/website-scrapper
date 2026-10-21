import { json, error, requireAuth, nanoid } from '../_shared';
import type { Env } from '../_shared';
import { scoreProspect } from './score';

// ─── Types ───────────────────────────────────────────────────────────────────

interface PlaceResult {
  id: string;
  displayName?: { text: string };
  formattedAddress?: string;
  nationalPhoneNumber?: string;
  websiteUri?: string;
  rating?: number;
  userRatingCount?: number;
  types?: string[];
  addressComponents?: Array<{
    longText: string;
    types: string[];
  }>;
}

interface DiscoveryResult {
  discovered: number;
  duplicates: number;
  skipped_chains: number;
  skipped_types: number;
  hot_leads: number;
  unenriched: number;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const CHAIN_REVIEW_THRESHOLD = 500;

const SKIP_GOOGLE_TYPES = new Set([
  'department_store', 'shopping_mall', 'supermarket', 'gas_station',
  'convenience_store', 'grocery_or_supermarket',
]);

// ─── Helpers ─────────────────────────────────────────────────────────────────

function extractAddress(components: PlaceResult['addressComponents']): { city: string; state: string; postal: string } {
  let city = '', state = '', postal = '';
  if (!components) return { city, state, postal };
  for (const c of components) {
    if (!c.types) continue;
    if (c.types.includes('locality')) city = c.longText;
    if (c.types.includes('administrative_area_level_1')) state = c.longText;
    if (c.types.includes('postal_code')) postal = c.longText;
  }
  return { city, state, postal };
}

function shouldSkipPlace(place: PlaceResult): 'chain' | 'type' | null {
  if (place.userRatingCount && place.userRatingCount >= CHAIN_REVIEW_THRESHOLD) return 'chain';
  if (place.types) {
    for (const t of place.types) {
      if (SKIP_GOOGLE_TYPES.has(t)) return 'type';
    }
  }
  return null;
}

// ─── Google Places Search (single query, handles pagination) ─────────────────

async function searchPlaces(
  query: string,
  apiKey: string,
  maxResults: number,
): Promise<PlaceResult[]> {
  const allPlaces: PlaceResult[] = [];
  let pageToken: string | undefined;

  while (allPlaces.length < maxResults) {
    const batchSize = Math.min(20, maxResults - allPlaces.length);
    const body: Record<string, unknown> = {
      textQuery: query,
      maxResultCount: batchSize,
      languageCode: 'en',
    };
    if (pageToken) body.pageToken = pageToken;

    const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.websiteUri,places.rating,places.userRatingCount,places.types,places.addressComponents,nextPageToken',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      console.error('Places API error:', await res.text());
      break;
    }

    const data = await res.json() as { places?: PlaceResult[]; nextPageToken?: string };
    if (!data.places || data.places.length === 0) break;

    allPlaces.push(...data.places);
    pageToken = data.nextPageToken;
    if (!pageToken) break;
  }

  return allPlaces;
}

// ─── Main Handler ────────────────────────────────────────────────────────────
// Phase 1: FAST discovery — Google Places search + scoring + insert.
// No email scraping, no website audit (those happen in /api/enrich).

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const authErr = requireAuth(context);
  if (authErr) return authErr;

  const { campaign_id } = await context.request.json() as { campaign_id: string };
  if (!campaign_id) return error('campaign_id required');

  const campaign = await context.env.DB.prepare(
    `SELECT c.*, n.search_terms, n.name as niche_name
     FROM campaigns c JOIN niches n ON c.niche_id = n.id WHERE c.id = ?`
  ).bind(campaign_id).first<{
    id: string; niche_id: string; location: string;
    requested_count: number; search_terms: string; niche_name: string;
  }>();

  if (!campaign) return error('Campaign not found', 404);

  const searchTerms: string[] = (() => {
    try { return JSON.parse(campaign.search_terms); }
    catch { return campaign.search_terms.split(',').map((s: string) => s.trim()).filter(Boolean); }
  })();
  if (!searchTerms.length) return error('Niche has no search terms');

  await context.env.DB.prepare(
    `UPDATE campaigns SET status = 'running' WHERE id = ?`
  ).bind(campaign_id).run();

  const result: DiscoveryResult = {
    discovered: 0,
    duplicates: 0,
    skipped_chains: 0,
    skipped_types: 0,
    hot_leads: 0,
    unenriched: 0,
  };

  const seenPlaceIds = new Set<string>();

  try {
    // ── MULTI-TERM SEARCH: iterate ALL niche search terms ──
    for (const term of searchTerms) {
      if (result.discovered >= campaign.requested_count) break;

      const query = `${term} in ${campaign.location}`;
      const remaining = campaign.requested_count - result.discovered;
      const places = await searchPlaces(query, context.env.GOOGLE_API_KEY, remaining);

      for (const place of places) {
        if (result.discovered >= campaign.requested_count) break;

        // Cross-term dedup
        if (seenPlaceIds.has(place.id)) continue;
        seenPlaceIds.add(place.id);

        // Smart filtering
        const skipReason = shouldSkipPlace(place);
        if (skipReason === 'chain') { result.skipped_chains++; continue; }
        if (skipReason === 'type') { result.skipped_types++; continue; }

        const addr = extractAddress(place.addressComponents);
        const websiteUrl = place.websiteUri || null;
        const typesJson = place.types ? JSON.stringify(place.types) : null;

        // Score with what we have (no email, no pagespeed, no audit yet)
        const { score, breakdown, tier, reasons } = scoreProspect({
          website_url: websiteUrl,
          phone: place.nationalPhoneNumber || null,
          google_rating: place.rating || null,
          google_review_count: place.userRatingCount || null,
          email: null,
          pagespeed_mobile: null,
          website_issues: null,
          google_types: typesJson,
        });

        if (tier === 'hot') result.hot_leads++;
        if (websiteUrl) result.unenriched++; // has website = can be enriched later

        try {
          await context.env.DB.prepare(
            `INSERT INTO prospects
             (id, business_name, phone, website_url, address, city, state_province, postal_code,
              campaign_id, niche_id, google_place_id, google_rating, google_review_count,
              google_types, quality_score, score_breakdown, has_website,
              tier, reasons)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          ).bind(
            nanoid(),
            place.displayName?.text || 'Unknown',
            place.nationalPhoneNumber || null,
            websiteUrl,
            place.formattedAddress || null,
            addr.city,
            addr.state,
            addr.postal,
            campaign_id,
            campaign.niche_id,
            place.id,
            place.rating || null,
            place.userRatingCount || null,
            typesJson,
            score,
            JSON.stringify(breakdown),
            websiteUrl ? 1 : 0,
            tier,
            reasons.length > 0 ? JSON.stringify(reasons) : null,
          ).run();
          result.discovered++;
        } catch (e: unknown) {
          if (e instanceof Error && e.message.includes('UNIQUE')) {
            result.duplicates++;
            continue;
          }
          throw e;
        }
      }
    }

    await context.env.DB.prepare(
      `UPDATE campaigns SET status = 'completed', discovered_count = discovered_count + ? WHERE id = ?`
    ).bind(result.discovered, campaign_id).run();

    return json(result);
  } catch (e) {
    await context.env.DB.prepare(
      `UPDATE campaigns SET status = 'failed' WHERE id = ?`
    ).bind(campaign_id).run();
    return error(e instanceof Error ? e.message : 'Discovery failed', 500);
  }
};

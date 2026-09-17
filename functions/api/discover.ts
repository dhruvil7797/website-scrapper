import { json, error, requireAuth, nanoid } from '../_shared';
import type { Env } from '../_shared';

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

function scoreProspect(p: { website_url: string | null; google_rating: number | null; google_review_count: number | null; email: string | null; pagespeed_mobile: number | null }): { score: number; breakdown: Record<string, number> } {
  const b: Record<string, number> = {};

  if (!p.website_url) b.no_website = 30;
  if (p.google_rating && p.google_rating >= 4.0) b.high_rating = 10;
  if (p.google_review_count && p.google_review_count >= 10) b.active_reviews = 5;
  if (p.google_review_count && p.google_review_count < 200) b.local_business = 5;
  if (p.google_review_count && p.google_review_count > 500) b.likely_chain = -15;
  if (p.google_rating && p.google_rating < 3.0) b.low_rating = -10;

  // Base score for having data
  b.base = 20;

  const score = Math.max(0, Math.min(100, Object.values(b).reduce((a, c) => a + c, 0)));
  return { score, breakdown: b };
}

function extractAddress(components: PlaceResult['addressComponents']): { city: string; state: string; postal: string } {
  let city = '', state = '', postal = '';
  if (!components) return { city, state, postal };
  for (const c of components) {
    if (c.types.includes('locality')) city = c.longText;
    if (c.types.includes('administrative_area_level_1')) state = c.longText;
    if (c.types.includes('postal_code')) postal = c.longText;
  }
  return { city, state, postal };
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const authErr = requireAuth(context);
  if (authErr) return authErr;

  const { campaign_id } = await context.request.json() as { campaign_id: string };
  if (!campaign_id) return error('campaign_id required');

  const campaign = await context.env.DB.prepare(
    `SELECT c.*, n.search_terms, n.name as niche_name FROM campaigns c JOIN niches n ON c.niche_id = n.id WHERE c.id = ?`
  ).bind(campaign_id).first<{ id: string; niche_id: string; location: string; requested_count: number; search_terms: string; niche_name: string }>();

  if (!campaign) return error('Campaign not found', 404);

  const searchTerms: string[] = JSON.parse(campaign.search_terms);
  const query = `${searchTerms[0]} in ${campaign.location}`;

  // Update campaign status
  await context.env.DB.prepare(`UPDATE campaigns SET status = 'running' WHERE id = ?`).bind(campaign_id).run();

  let discovered = 0;
  let duplicates = 0;
  let pageToken: string | undefined;

  try {
    // Fetch up to requested_count using pagination
    while (discovered < campaign.requested_count) {
      const maxResults = Math.min(20, campaign.requested_count - discovered);
      const body: Record<string, unknown> = { textQuery: query, maxResultCount: maxResults, languageCode: 'en' };
      if (pageToken) body.pageToken = pageToken;

      const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': context.env.GOOGLE_API_KEY,
          'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.websiteUri,places.rating,places.userRatingCount,places.types,places.addressComponents,nextPageToken',
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errText = await res.text();
        console.error('Places API error:', errText);
        break;
      }

      const data = await res.json() as { places?: PlaceResult[]; nextPageToken?: string };
      if (!data.places || data.places.length === 0) break;

      for (const place of data.places) {
        const addr = extractAddress(place.addressComponents);
        const websiteUrl = place.websiteUri || null;
        const { score, breakdown } = scoreProspect({
          website_url: websiteUrl,
          google_rating: place.rating || null,
          google_review_count: place.userRatingCount || null,
          email: null,
          pagespeed_mobile: null,
        });

        try {
          await context.env.DB.prepare(
            `INSERT INTO prospects (id, business_name, phone, website_url, address, city, state_province, postal_code, campaign_id, niche_id, google_place_id, google_rating, google_review_count, google_types, quality_score, score_breakdown, has_website)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          ).bind(
            nanoid(), place.displayName?.text || 'Unknown', place.nationalPhoneNumber || null,
            websiteUrl, place.formattedAddress || null, addr.city, addr.state, addr.postal,
            campaign_id, campaign.niche_id, place.id,
            place.rating || null, place.userRatingCount || null,
            place.types ? JSON.stringify(place.types) : null,
            score, JSON.stringify(breakdown), websiteUrl ? 1 : 0,
          ).run();
          discovered++;
        } catch (e: unknown) {
          // Duplicate google_place_id — skip
          if (e instanceof Error && e.message.includes('UNIQUE')) { duplicates++; continue; }
          throw e;
        }
      }

      pageToken = data.nextPageToken;
      if (!pageToken) break;
    }

    // Update campaign
    await context.env.DB.prepare(
      `UPDATE campaigns SET status = 'completed', discovered_count = discovered_count + ? WHERE id = ?`
    ).bind(discovered, campaign_id).run();

    return json({ discovered, duplicates });
  } catch (e) {
    await context.env.DB.prepare(`UPDATE campaigns SET status = 'failed' WHERE id = ?`).bind(campaign_id).run();
    return error(e instanceof Error ? e.message : 'Discovery failed', 500);
  }
};

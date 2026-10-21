/**
 * Prospect scoring engine for client-scraper.
 * Scores 0-100 based on how likely a business needs web services.
 */

const CHAIN_TYPE_INDICATORS = [
  'fast_food_restaurant', 'gas_station', 'convenience_store',
  'department_store', 'supermarket', 'drugstore', 'bank',
  'car_rental', 'insurance_agency', 'car_dealer',
];

const FREE_BUILDER_PATTERNS = [
  /\.wixsite\.com/i, /\.weebly\.com/i, /\.godaddysites\.com/i,
  /\.square\.site/i, /\.carrd\.co/i, /\.wordpress\.com/i,
  /\.blogspot\.com/i, /\.jimdo\.com/i, /\.site123\.com/i,
  /\.webnode\.com/i, /\.strikingly\.com/i,
];

interface ProspectInput {
  website_url: string | null;
  phone?: string | null;
  google_rating: number | null;
  google_review_count: number | null;
  email: string | null;
  pagespeed_mobile: number | null;
  website_issues: string[] | null;
  google_types: string | null;
}

interface ScoreResult {
  score: number;
  breakdown: Record<string, number>;
  tier: 'hot' | 'warm' | 'cold' | 'skip';
  reasons: string[];
}

export function scoreProspect(p: ProspectInput): ScoreResult {
  const b: Record<string, number> = {};
  const reasons: string[] = [];

  const hasWebsite = !!p.website_url;
  const rating = p.google_rating ?? 0;
  const reviews = p.google_review_count ?? 0;
  const types: string[] = parseTypes(p.google_types);

  // ── NO WEBSITE signals (max 40) ──────────────────────────────────
  if (!hasWebsite) {
    b.no_website = 35;
    reasons.push('No website — needs one built from scratch');
    if (p.phone) {
      b.has_phone = 5;
      reasons.push('Has phone number — easy to reach');
    }
  }

  // ── WEBSITE QUALITY signals (max 35) ─────────────────────────────
  if (hasWebsite) {
    const issues = p.website_issues ?? [];

    if (issues.length > 0) {
      b.website_issues = 15;
      const issueStr = issues.slice(0, 3).join(', ');
      reasons.push(`Website has issues: ${issueStr}`);
    }

    if (p.pagespeed_mobile !== null && p.pagespeed_mobile < 50) {
      b.slow_website = 10;
      reasons.push(`Website is very slow (PageSpeed ${p.pagespeed_mobile}/100)`);
    } else if (p.pagespeed_mobile !== null && p.pagespeed_mobile < 70) {
      b.mediocre_speed = 5;
      reasons.push(`Website is mediocre (PageSpeed ${p.pagespeed_mobile}/100)`);
    }

    if (isFreeBuilder(p.website_url!)) {
      b.free_builder = 5;
      reasons.push('Website is on a free-tier builder — needs a real site');
    }
  }

  // ── BUSINESS VIABILITY signals (max 25) ──────────────────────────
  if (rating >= 4.0 && reviews >= 10) {
    b.strong_business = 10;
    reasons.push(`High-rated local business (${rating}★, ${reviews} reviews) — likely to invest`);
  } else if (rating >= 3.5) {
    b.decent_business = 5;
    reasons.push(`Decent rating (${rating}★) — potential client`);
  }

  if (reviews >= 10 && reviews <= 200) {
    b.local_size = 5;
    reasons.push('Local business size (not a chain)');
  }

  if (p.email) {
    b.has_email = 5;
    reasons.push('Has email — direct outreach possible');
  }

  // ── PENALTIES ────────────────────────────────────────────────────
  if (reviews > 500) {
    b.likely_chain_reviews = -30;
    reasons.push(`Likely a chain (${reviews} reviews) — skip`);
  }

  if (hasChainTypes(types)) {
    b.chain_type = -20;
    reasons.push('Business type indicates franchise/chain');
  }

  if (rating > 0 && rating < 2.5) {
    b.bad_rating = -15;
    reasons.push(`Low rating (${rating}★) — unlikely to invest in a website`);
  }

  if (!p.phone && !p.email) {
    b.unreachable = -10;
    reasons.push('No phone or email — hard to contact');
  }

  // ── COMPUTE ──────────────────────────────────────────────────────
  const raw = Object.values(b).reduce((a, c) => a + c, 0);
  const score = Math.max(0, Math.min(100, raw));

  const tier = assignTier(score, hasWebsite, rating);

  return { score, breakdown: b, tier, reasons };
}

function assignTier(
  score: number,
  hasWebsite: boolean,
  rating: number,
): 'hot' | 'warm' | 'cold' | 'skip' {
  if (score >= 60 || (!hasWebsite && rating >= 3.5)) return 'hot';
  if (score >= 35) return 'warm';
  if (score >= 15) return 'cold';
  return 'skip';
}

function isFreeBuilder(url: string): boolean {
  return FREE_BUILDER_PATTERNS.some((re) => re.test(url));
}

function hasChainTypes(types: string[]): boolean {
  return types.some((t) => CHAIN_TYPE_INDICATORS.includes(t));
}

function parseTypes(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

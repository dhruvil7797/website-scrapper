import { createLogger } from './logger.js';
import type { QualityScoreBreakdown } from '../../../shared/types.js';

const log = createLogger('scoring');

interface ScoringInput {
  has_website: boolean;
  website_url?: string | null;
  pagespeed_mobile?: number | null;
  google_rating?: number | null;
  google_review_count?: number | null;
  business_age_months?: number | null;
  email?: string | null;
  email_type?: string | null;
  has_social_media?: boolean;
  multiple_locations?: boolean;
  is_franchise?: boolean;
  design_score?: number | null; // 0-100 from AI vision (0 = very outdated)
}

export function calculateQualityScore(input: ScoringInput): { score: number; breakdown: QualityScoreBreakdown } {
  const breakdown: QualityScoreBreakdown = {
    no_website: 0,
    outdated_design: 0,
    mobile_unfriendly: 0,
    slow_site: 0,
    recently_opened: 0,
    high_rating: 0,
    has_email: 0,
    free_email: 0,
    custom_domain_email: 0,
    low_review_active: 0,
    social_media: 0,
    no_email: 0,
    multiple_locations: 0,
    franchise: 0,
  };

  // No website = biggest opportunity
  if (!input.has_website) {
    breakdown.no_website = 30;
  } else {
    // Has website but outdated
    if (input.design_score !== null && input.design_score !== undefined && input.design_score < 40) {
      breakdown.outdated_design = 25;
    }
    // Mobile unfriendly
    if (input.pagespeed_mobile !== null && input.pagespeed_mobile !== undefined && input.pagespeed_mobile < 50) {
      breakdown.mobile_unfriendly = 15;
    }
    // Slow site
    if (input.pagespeed_mobile !== null && input.pagespeed_mobile !== undefined && input.pagespeed_mobile < 40) {
      breakdown.slow_site = 10;
    }
  }

  // Recently opened
  if (input.business_age_months !== null && input.business_age_months !== undefined && input.business_age_months < 24) {
    breakdown.recently_opened = 10;
  }

  // High Google rating
  if (input.google_rating !== null && input.google_rating !== undefined && input.google_rating >= 4.0) {
    breakdown.high_rating = 10;
  }

  // Email signals
  if (input.email) {
    breakdown.has_email = 10;
    if (input.email_type === 'free_provider') {
      breakdown.free_email = 10;
    } else if (input.email_type === 'custom_domain') {
      breakdown.custom_domain_email = 5;
    }
  } else {
    breakdown.no_email = -5;
  }

  // Low review count but active
  if (input.google_review_count !== null && input.google_review_count !== undefined 
      && input.google_review_count < 20 && input.google_review_count > 0) {
    breakdown.low_review_active = 5;
  }

  // Social media
  if (input.has_social_media) {
    breakdown.social_media = 5;
  }

  // Negative signals
  if (input.multiple_locations) {
    breakdown.multiple_locations = -10;
  }
  if (input.is_franchise) {
    breakdown.franchise = -20;
  }

  const score = Math.max(0, Math.min(100, Object.values(breakdown).reduce((a, b) => a + b, 0)));
  
  log.debug('Score calculated', { score, breakdown });
  return { score, breakdown };
}

/**
 * Determine if a prospect should be SKIPPED (their website is already good enough).
 * Called after scraping when we have PageSpeed data.
 * 
 * Skip if ALL of these are true:
 * - Has a website
 * - PageSpeed mobile score >= 70 (fast + modern)
 * - Design score >= 60 (from AI vision, if available)
 * 
 * These businesses don't need us — reaching out would be a waste.
 */
export function shouldSkipProspect(input: {
  has_website: boolean;
  pagespeed_mobile: number | null;
  design_score?: number | null;
}): { skip: boolean; reason: string } {
  if (!input.has_website) {
    return { skip: false, reason: '' }; // No website = always a prospect
  }

  const hasGoodSpeed = input.pagespeed_mobile !== null && input.pagespeed_mobile >= 70;
  const hasGoodDesign = input.design_score !== null && input.design_score !== undefined && input.design_score >= 60;

  // Skip if fast AND (looks good OR we don't have design data but speed is excellent)
  if (hasGoodSpeed && (hasGoodDesign || (input.pagespeed_mobile !== null && input.pagespeed_mobile >= 85))) {
    return { 
      skip: true, 
      reason: `Website already good: PageSpeed ${input.pagespeed_mobile}/100${hasGoodDesign ? `, design ${input.design_score}/100` : ''}` 
    };
  }

  return { skip: false, reason: '' };
}

/**
 * Detect email type from email address
 */
export function detectEmailType(email: string | null | undefined): 'custom_domain' | 'free_provider' | 'none' {
  if (!email) return 'none';
  
  const freeProviders = [
    'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'aol.com',
    'icloud.com', 'mail.com', 'protonmail.com', 'zoho.com', 'yandex.com',
    'live.com', 'msn.com', 'comcast.net', 'att.net', 'verizon.net',
  ];
  
  const domain = email.split('@')[1]?.toLowerCase();
  if (!domain) return 'none';
  
  return freeProviders.includes(domain) ? 'free_provider' : 'custom_domain';
}

/**
 * Normalize phone number to digits only
 */
export function normalizePhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 7) return null; // too short to be valid
  // Remove leading country code 1 for US/CA if 11 digits
  if (digits.length === 11 && digits.startsWith('1')) {
    return digits.substring(1);
  }
  return digits;
}

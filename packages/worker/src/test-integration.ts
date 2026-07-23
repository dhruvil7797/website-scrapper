import { d1Execute, d1Select } from './services/cloudflare.js';
import { normalizePhone, calculateQualityScore } from './services/scoring.js';
import { detectTimezone } from './services/timezone.js';
import { createLogger } from './services/logger.js';
import { nanoid } from 'nanoid';

const log = createLogger('test-integration');

async function main() {
  log.info('=== Integration Test ===');
  
  // Test 1: Phone normalization
  const phone = '(512) 690-4935';
  const norm = normalizePhone(phone);
  log.info('Phone normalization', { raw: phone, normalized: norm });
  
  // Test 2: Timezone detection
  const tz = detectTimezone('Austin', 'TX', 'US');
  log.info('Timezone detection', { city: 'Austin', state: 'TX', timezone: tz });
  
  // Test 3: Quality scoring
  const { score, breakdown } = calculateQualityScore({
    has_website: true,
    pagespeed_mobile: 45,
    google_rating: 4.8,
    google_review_count: 17401,
    email: null,
    email_type: null,
  });
  log.info('Quality scoring', { score, breakdown });
  
  // Test 4: D1 insert
  const id = nanoid(16);
  await d1Execute(
    `INSERT OR IGNORE INTO prospects (
      id, business_name, phone_raw, phone_normalized, website_url,
      address, city, state_province, postal_code, country, timezone,
      campaign_id, niche_id, source, google_rating, google_review_count,
      has_website, pagespeed_mobile, quality_score, score_breakdown,
      stage, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'discovered', datetime('now'), datetime('now'))`,
    [id, 'Radiant Plumbing', phone, norm, 'https://radiantplumbing.com',
     '901 Reinli St, Austin, TX 78751', 'Austin', 'TX', '78701', 'US', tz,
     'test-campaign-1', 'plumber', 'google_maps', 4.8, 17401,
     1, 45, score, JSON.stringify(breakdown)]
  );
  log.info('D1 insert success', { id });
  
  // Test 5: D1 read back
  const rows = await d1Select<{id: string; business_name: string; quality_score: number; stage: string}>(
    'SELECT id, business_name, quality_score, stage FROM prospects LIMIT 5'
  );
  log.info('D1 prospects', { count: rows.length, rows });
  
  // Test 6: Verify niches
  const niches = await d1Select<{id: string; name: string}>(
    'SELECT id, name FROM niches'
  );
  log.info('Niches loaded', { count: niches.length });
  
  // Test 7: Verify campaign
  const campaigns = await d1Select<{id: string; name: string; status: string}>(
    'SELECT id, name, status FROM campaigns'
  );
  log.info('Campaigns', { campaigns });
  
  log.info('=== All tests passed! ===');
}

main().catch(e => {
  console.error('TEST FAILED:', e.message);
  process.exit(1);
});

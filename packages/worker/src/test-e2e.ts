/**
 * End-to-end test with manual approval flow:
 * 1. Insert test prospect
 * 2. Run generator (produces site + draft email → pending_approval)
 * 3. Auto-approve the prospect (simulating dashboard click)
 * 4. Set scheduled_send_at to NOW (so mailer picks it up immediately)
 * 5. Run mailer (sends to cloudgenz.it@gmail.com)
 * 
 * Usage: npx tsx src/test-e2e.ts
 */
import { config } from './config.js';
import { d1Execute, d1SelectOne, d1Select } from './services/cloudflare.js';
import { runGenerator } from './pipeline/generator.js';
import { runMailer, testSmtp } from './pipeline/mailer.js';
import { createLogger } from './services/logger.js';
import { nanoid } from 'nanoid';

const log = createLogger('e2e-test');

const TEST_ID = `test-${nanoid(8)}`;

const TEST_PROSPECT = {
  id: TEST_ID,
  business_name: "Joe's Premium Plumbing",
  phone_raw: '(512) 555-0199',
  phone_normalized: '5125550199',
  email: 'cloudgenz.it@gmail.com',
  email_type: 'free_provider',
  website_url: null,
  address: '123 Main St',
  city: 'Austin',
  state_province: 'TX',
  postal_code: '78701',
  country: 'US',
  timezone: 'America/Chicago',
  campaign_id: 'test-campaign',
  niche_id: 'plumber',
  source: 'manual_test',
  google_rating: 4.7,
  google_review_count: 12,
  has_website: 0,
  quality_score: 85,
  stage: 'scraped',
  owner_name: 'Joe Martinez',
};

async function runE2E() {
  const startTime = Date.now();
  log.info('=== E2E TEST START ===');
  log.info('Target email: cloudgenz.it@gmail.com (BCC: dhruvil@cloudgenz.com)');

  // Step 1: Verify SMTP
  log.info('[1/5] Testing SMTP...');
  const smtpOk = await testSmtp('cloudgenz.it@gmail.com');
  if (!smtpOk) {
    log.error('SMTP failed — check Purelymail credentials');
    process.exit(1);
  }
  log.info('[1/5] SMTP OK ✓');

  // Step 2: Insert test data
  log.info('[2/5] Setting up test data in D1...');
  await d1Execute(
    `INSERT OR IGNORE INTO niches (id, name, search_terms, features, ui_guidance, color_palette)
     VALUES ('plumber', 'Plumber', '["plumber","plumbing service","plumbing repair"]', 
     '["Online booking","Emergency contact button","Service areas map","Instant quote form","24/7 availability badge"]',
     'Use bold blues and whites. Hero should have emergency phone prominently. Trust badges for licensing and insurance.',
     '{"primary":"#1e40af","accent":"#ea580c","bg":"#f8fafc","text":"#1e293b"}')`,
    []
  );
  await d1Execute(
    `INSERT OR IGNORE INTO campaigns (id, name, niche_id, postal_codes, country, status)
     VALUES ('test-campaign', 'E2E Test', 'plumber', '["78701"]', 'US', 'active')`,
    []
  );
  await d1Execute(
    `INSERT OR REPLACE INTO prospects (
      id, business_name, phone_raw, phone_normalized, email, email_type,
      website_url, address, city, state_province, postal_code, country, timezone,
      campaign_id, niche_id, source, google_rating, google_review_count,
      has_website, quality_score, stage, owner_name, source_data, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
    [
      TEST_ID, TEST_PROSPECT.business_name, TEST_PROSPECT.phone_raw,
      TEST_PROSPECT.phone_normalized, TEST_PROSPECT.email, TEST_PROSPECT.email_type,
      TEST_PROSPECT.website_url, TEST_PROSPECT.address, TEST_PROSPECT.city,
      TEST_PROSPECT.state_province, TEST_PROSPECT.postal_code, TEST_PROSPECT.country,
      TEST_PROSPECT.timezone, TEST_PROSPECT.campaign_id, TEST_PROSPECT.niche_id,
      TEST_PROSPECT.source, TEST_PROSPECT.google_rating, TEST_PROSPECT.google_review_count,
      TEST_PROSPECT.has_website, TEST_PROSPECT.quality_score, TEST_PROSPECT.stage,
      TEST_PROSPECT.owner_name,
      JSON.stringify({ scraped: { services: ['Drain cleaning', 'Water heater repair', 'Pipe repair', 'Emergency plumbing', 'Bathroom remodel', 'Sewer line repair'] } }),
    ]
  );
  log.info('[2/5] Test data inserted ✓');

  // Step 3: Run generator (5-10 min)
  log.info('[3/5] Running generator — this takes 5-10 minutes...');
  log.info('[3/5] The generator will: plan structure → generate HTML → screenshot → AI QA → iterate until quality ≥ 0.65');
  const genResult = await runGenerator();
  log.info('[3/5] Generator result:', genResult);

  // Check prospect stage
  const afterGen = await d1SelectOne<{ stage: string; qa_score: number; generated_site_url: string; draft_email_subject: string }>(
    'SELECT stage, qa_score, generated_site_url, draft_email_subject FROM prospects WHERE id = ?',
    [TEST_ID]
  );

  if (!afterGen || afterGen.stage !== 'pending_approval') {
    log.error('[3/5] Generation did not reach pending_approval', { stage: afterGen?.stage, score: afterGen?.qa_score });
    log.info('The QA was too strict or HTML extraction failed. Check logs above for details.');
    process.exit(1);
  }

  log.info('[3/5] Generation succeeded! ✓', {
    stage: afterGen.stage,
    score: afterGen.qa_score,
    url: afterGen.generated_site_url,
    subject: afterGen.draft_email_subject,
  });

  // Step 4: Auto-approve (simulate dashboard approval)
  log.info('[4/5] Auto-approving for test (simulating dashboard click)...');
  await d1Execute(
    `UPDATE prospects SET 
      stage = 'approved',
      approval_status = 'approved',
      approved_at = datetime('now'),
      scheduled_send_at = datetime('now')
    WHERE id = ?`,
    [TEST_ID]
  );
  log.info('[4/5] Approved and scheduled for immediate send ✓');

  // Step 5: Run mailer
  log.info('[5/5] Sending email...');
  // Need to init the ramp settings first
  await d1Execute(
    `INSERT OR IGNORE INTO settings (key, value) VALUES ('ramp_level', '0'), ('ramp_steps', '[10,25,50,100,200,300]'), ('ramp_last_step_date', ?)`,
    [new Date().toISOString()]
  );

  const emailResult = await runMailer();
  log.info('[5/5] Mailer result:', emailResult);

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
  log.info(`=== E2E TEST COMPLETE (${elapsed}s) ===`);
  log.info('');
  log.info('📧 Check cloudgenz.it@gmail.com for the email');
  log.info('📧 Check dhruvil@cloudgenz.com for BCC copy');
  if (afterGen.generated_site_url) {
    log.info(`🌐 Generated site: ${afterGen.generated_site_url}`);
  }
}

runE2E().catch(err => {
  log.error('E2E FAILED', { error: (err as Error).message, stack: (err as Error).stack?.substring(0, 500) });
  process.exit(1);
});

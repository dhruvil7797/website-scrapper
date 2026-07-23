import { runDeployer } from './pipeline/deployer.js';
import { d1Execute, d1Select } from './services/cloudflare.js';
import { createLogger } from './services/logger.js';

const log = createLogger('test-email-flow');

async function main() {
  // Step 1: Deploy (move qa_passed -> deployed)
  log.info('Running deployer...');
  const deploy = await runDeployer();
  log.info('Deploy result', deploy);

  // Step 2: Override the email to our test address before sending
  await d1Execute(
    `UPDATE prospects SET email = 'cloudgenz.it@gmail.com' WHERE id = 'zoO6R3v75K6wjW_8'`
  );
  log.info('Set test email address');

  // Step 3: Verify prospect state
  const prospect = await d1Select<any>(
    `SELECT id, business_name, stage, email, generated_site_url, portfolio_slug FROM prospects WHERE id = 'zoO6R3v75K6wjW_8'`
  );
  log.info('Prospect state', { prospect: prospect[0] });
}

main().catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});

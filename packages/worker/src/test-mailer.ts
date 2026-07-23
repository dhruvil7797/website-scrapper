import { runMailer } from './pipeline/mailer.js';
import { createLogger } from './services/logger.js';

const log = createLogger('test-mailer');

async function main() {
  log.info('Testing mailer (will call AI for email copy + send via SMTP)...');
  const result = await runMailer();
  log.info('Mailer result', result);
}

main().catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});

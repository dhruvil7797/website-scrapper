import { runQa } from './pipeline/qa.js';
import { createLogger } from './services/logger.js';

const log = createLogger('test-qa');

async function main() {
  log.info('Testing QA (will screenshot generated site + AI eval)...');
  const result = await runQa();
  log.info('QA result', result);
}

main().catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});

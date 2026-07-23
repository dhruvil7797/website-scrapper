import { runScraper } from './pipeline/scraper.js';
import { createLogger } from './services/logger.js';

const log = createLogger('test-scraper');

async function main() {
  log.info('Testing scraper...');
  const result = await runScraper();
  log.info('Scraper result', result);
}

main().catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});

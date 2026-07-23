import { runDiscovery } from './pipeline/discoverer.js';
import { createLogger } from './services/logger.js';

const log = createLogger('test');

async function main() {
  log.info('Testing discovery pipeline...');
  const result = await runDiscovery();
  log.info('Discovery complete', result);
}

main().catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});

import { runGenerator } from './pipeline/generator.js';
import { createLogger } from './services/logger.js';

const log = createLogger('test-generator');

async function main() {
  log.info('Testing generator (this will call kiro-cli - may take 2-3 min)...');
  const result = await runGenerator();
  log.info('Generator result', result);
}

main().catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});

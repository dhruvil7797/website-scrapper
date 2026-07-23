import { d1Select, d1Execute } from '../services/cloudflare.js';
import { createLogger } from '../services/logger.js';

const log = createLogger('deployer');

/**
 * Move QA-passed prospects to 'deployed' stage.
 * Since generation already uploads to R2, this stage just marks them ready for email.
 * In the future, this could do additional steps (custom domain setup, CDN cache warm, etc.)
 */
export async function runDeployer(): Promise<{ deployed: number }> {
  // QA-passed prospects are already in R2 - just move to deployed stage
  const result = await d1Execute(
    `UPDATE prospects SET stage = 'deployed', updated_at = datetime('now')
     WHERE stage = 'qa_passed'`
  );

  const deployed = result.changes;
  if (deployed > 0) {
    log.info('Deployed', { count: deployed });
  }
  return { deployed };
}

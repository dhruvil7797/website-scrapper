import { runFollowUpQueue } from './follow-up-queue.js';
import { runFollowUpSender } from './follow-up-sender.js';
import { createLogger } from '../services/logger.js';

const log = createLogger('scheduler');

export { runFollowUpQueue } from './follow-up-queue.js';
export { runFollowUpSender } from './follow-up-sender.js';

/**
 * Run all scheduled tasks in sequence.
 * Called from main index.ts on a daily schedule.
 */
export async function runScheduledTasks(): Promise<void> {
  log.info('=== Running scheduled tasks ===');

  // 1. Queue follow-up candidates (prospects who opened but didn't reply)
  const queueResult = await runFollowUpQueue();
  log.info('Follow-up queue complete', queueResult);

  // 2. Send approved follow-ups
  const sendResult = await runFollowUpSender();
  log.info('Follow-up sender complete', sendResult);

  log.info('=== Scheduled tasks complete ===', {
    queued: queueResult.queued,
    sent: sendResult.sent,
    failed: sendResult.failed,
  });
}

import { d1Select, d1Execute } from '../services/cloudflare.js';
import { createLogger } from '../services/logger.js';

const log = createLogger('follow-up-queue');

interface FollowUpCandidate {
  id: string;
  business_name: string;
  email: string;
}

/**
 * Daily job: scan for prospects who opened the initial email but haven't replied
 * after 4 days. Queue them for follow-up approval.
 */
export async function runFollowUpQueue(): Promise<{ queued: number }> {
  log.info('Scanning for follow-up candidates...');

  // Find prospects who:
  // - Were emailed (stage = 'emailed')
  // - Email was sent more than 4 days ago
  // - They opened the email (opened = 1)
  // - They haven't replied (replied = 0)
  const candidates = await d1Select<FollowUpCandidate>(
    `SELECT id, business_name, email
     FROM prospects
     WHERE stage = 'emailed'
       AND email_sent_at < datetime('now', '-4 days')
       AND opened = 1
       AND replied = 0`,
  );

  if (candidates.length === 0) {
    log.info('No follow-up candidates found');
    return { queued: 0 };
  }

  // Batch update all candidates to follow_up_due
  const ids = candidates.map(c => c.id);
  const placeholders = ids.map(() => '?').join(',');

  await d1Execute(
    `UPDATE prospects
     SET stage = 'follow_up_due', updated_at = datetime('now')
     WHERE id IN (${placeholders})`,
    ids,
  );

  log.info('Follow-up candidates queued', {
    queued: candidates.length,
    prospects: candidates.map(c => ({ id: c.id, name: c.business_name })),
  });

  return { queued: candidates.length };
}

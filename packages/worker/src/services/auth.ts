import { execSync } from 'child_process';
import { createLogger } from './logger.js';

const log = createLogger('auth');

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function checkAuth(): boolean {
  try {
    // Check Kerberos ticket validity
    const result = execSync('klist -s', { stdio: 'pipe', timeout: 10000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Auth gate - blocks until midway auth is valid.
 * Sleeps 30 min between retries, max 3 attempts (90 min total).
 * Throws if auth remains expired.
 */
export async function authGate(): Promise<void> {
  if (checkAuth()) return;

  const MAX_RETRIES = 3;
  const SLEEP_MS = 30 * 60 * 1000; // 30 minutes

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    log.warn(`Auth expired. Sleeping 30 min (attempt ${attempt}/${MAX_RETRIES})...`);
    await sleep(SLEEP_MS);

    if (checkAuth()) {
      log.info('Auth restored after sleep');
      return;
    }
  }

  log.error('Auth expired for 90+ min. Worker halted. Run mwinit to resume.');
  throw new Error('AUTH_EXPIRED: Run mwinit to resume worker');
}

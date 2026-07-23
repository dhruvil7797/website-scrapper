import { config } from './config.js';
import { createLogger } from './services/logger.js';
import { runDiscovery } from './pipeline/discoverer.js';
import { runScraper } from './pipeline/scraper.js';
import { runGenerator } from './pipeline/generator-v3.js';
import { runMailer, testSmtp } from './pipeline/mailer.js';
import { runScheduledTasks, runFollowUpQueue, runFollowUpSender } from './scheduler/index.js';
import { runInspirationRefresh } from './inspiration/refresh.js';

const log = createLogger('main');

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runPipeline() {
  log.info('=== Pipeline run starting ===');

  // Discovery runs ONLY for campaigns that haven't been fully discovered yet
  log.info('[1/4] Discovery (new campaigns only)...');
  const discovery = await runDiscovery();
  log.info('[1/4] Discovery done', discovery);

  // Run scraper, generator, and mailer in PARALLEL
  // Each stage picks up prospects at its own input stage independently
  log.info('[2-4] Running scraper + generator + mailer in parallel...');
  const [scraping, generation, emails] = await Promise.allSettled([
    runScraper().then(r => { log.info('Scraper done', r); return r; }),
    runGenerator().then(r => { log.info('Generator done', r); return r; }),
    runMailer().then(r => { log.info('Mailer done', r); return r; }),
  ]);

  const scraped = scraping.status === 'fulfilled' ? scraping.value.scraped : 0;
  const generated = generation.status === 'fulfilled' ? generation.value.generated : 0;
  const emailed = emails.status === 'fulfilled' ? emails.value.sent : 0;

  // Log any failures
  if (scraping.status === 'rejected') log.error('Scraper failed', { error: scraping.reason?.message });
  if (generation.status === 'rejected') log.error('Generator failed', { error: generation.reason?.message });
  if (emails.status === 'rejected') log.error('Mailer failed', { error: emails.reason?.message });

  log.info('=== Pipeline run complete ===', {
    discovered: discovery.discovered,
    scraped,
    generated,
    emailed,
  });
}

async function main() {
  log.info('Client Scraper Worker starting', {
    portfolio: config.portfolio.domain,
    concurrency: config.worker.concurrency,
  });

  // Parse CLI arguments
  const args = process.argv.slice(2);
  
  if (args.includes('--test-smtp')) {
    const testEmail = args[args.indexOf('--test-smtp') + 1] || 'cloudgenz.it@gmail.com';
    log.info('Running SMTP test...', { to: testEmail });
    const success = await testSmtp(testEmail);
    process.exit(success ? 0 : 1);
  }

  if (args.includes('--test-discovery')) {
    log.info('Running discovery test...');
    const result = await runDiscovery();
    log.info('Discovery test result', result);
    process.exit(0);
  }

  if (args.includes('--test-scraper')) {
    log.info('Running scraper test...');
    const result = await runScraper();
    log.info('Scraper test result', result);
    process.exit(0);
  }

  if (args.includes('--test-generator')) {
    log.info('Running generator test...');
    const result = await runGenerator();
    log.info('Generator test result', result);
    process.exit(0);
  }

  if (args.includes('--test-qa')) {
    log.info('Running QA test...');
    const result = await runQa();
    log.info('QA test result', result);
    process.exit(0);
  }

  if (args.includes('--once')) {
    await runPipeline();
    process.exit(0);
  }

  if (args.includes('--follow-up-queue')) {
    log.info('Running follow-up queue...');
    const result = await runFollowUpQueue();
    log.info('Follow-up queue result', result);
    process.exit(0);
  }

  if (args.includes('--follow-up-send')) {
    log.info('Running follow-up sender...');
    const result = await runFollowUpSender();
    log.info('Follow-up sender result', result);
    process.exit(0);
  }

  if (args.includes('--scheduled-tasks')) {
    log.info('Running all scheduled tasks...');
    await runScheduledTasks();
    process.exit(0);
  }

  if (args.includes('--refresh-inspiration')) {
    log.info('Running inspiration refresh...');
    const result = await runInspirationRefresh();
    log.info('Inspiration refresh result', { niches: result.results.length });
    process.exit(0);
  }

  // Daemon mode: run pipeline every 2 hours
  log.info('Starting daemon mode (runs every 2 hours)');
  
  while (true) {
    try {
      await runPipeline();
    } catch (err: unknown) {
      const error = err as Error;
      log.error('Pipeline error', { error: error.message, stack: error.stack?.substring(0, 500) });
    }

    log.info('Sleeping 2 hours until next run...');
    await sleep(2 * 60 * 60 * 1000);
  }
}

main().catch(err => {
  log.error('Fatal error', { error: err.message });
  process.exit(1);
});

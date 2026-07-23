import { config as dotenvConfig } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenvConfig({ path: resolve(__dirname, '../../../.env') });

function required(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
}

export const config = {
  cloudflare: {
    accountId: required('CLOUDFLARE_ACCOUNT_ID'),
    apiToken: required('CLOUDFLARE_API_TOKEN'),
    d1DatabaseId: required('CLOUDFLARE_D1_DATABASE_ID'),
    r2Bucket: required('CLOUDFLARE_R2_BUCKET'),
  },
  google: {
    apiKeys: required('GOOGLE_API_KEYS').split(',').map(k => k.trim()),
  },
  email: {
    smtpHost: required('PURELYMAIL_SMTP_HOST'),
    smtpPort: parseInt(process.env.PURELYMAIL_SMTP_PORT || '465'),
    smtpUser: required('PURELYMAIL_SMTP_USER'),
    smtpPass: required('PURELYMAIL_SMTP_PASS'),
    sendingEmail: required('SENDING_EMAIL'),
    replyToEmail: required('REPLY_TO_EMAIL'),
    bccEmail: process.env.BCC_EMAIL || '',
    sendingDomain: required('SENDING_DOMAIN'),
  },
  portfolio: {
    domain: required('PORTFOLIO_DOMAIN'),
  },
  worker: {
    concurrency: 3,
    scraperDelayMs: 4000,
    discoveryMaxPerRun: 50,
    generationMaxPerRun: 10,
    emailMaxPerRun: 30,
  },
} as const;

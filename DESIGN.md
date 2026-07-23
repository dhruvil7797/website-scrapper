# Client Scraper Pipeline - Design Document

## Overview

An automated, AI-powered web agency pipeline that acquires local service clients by generating custom, high-converting website redesigns and pitching them directly via email. Instead of cold pitching with generic templates, the pipeline builds a fully functional, live preview of what the client's modernized website could look like before ever making contact.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│  DEV DESK (Worker Daemon - Node.js/TypeScript)                          │
│                                                                          │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────┐       │
│  │ Discoverer │→ │  Scraper   │→ │ Generator  │→ │  QA Agent  │       │
│  └────────────┘  └────────────┘  └────────────┘  └────────────┘       │
│        ↓                                                ↓               │
│  ┌────────────┐                                  ┌────────────┐        │
│  │ Inspiration│ (scheduled)                      │  Deployer  │→ R2    │
│  │   Worker   │                                  └────────────┘        │
│  └────────────┘                                        ↓               │
│                                                  ┌────────────┐        │
│                                                  │   Mailer   │        │
│                                                  └────────────┘        │
│                                                                          │
│  All workers read/write D1 via Cloudflare REST API                      │
└──────────────────────────────────────────────────┬──────────────────────┘
                                                   │
                                                   ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  CLOUDFLARE (Free Tier)                                                   │
│                                                                           │
│  ┌─────────────────┐  ┌───────────────────┐  ┌─────────────┐           │
│  │ Pages (React+   │  │ Pages Functions   │  │     D1      │           │
│  │ Vite SPA)       │←→│ (API endpoints)   │←→│  (Database) │           │
│  └─────────────────┘  └───────────────────┘  └─────────────┘           │
│         │                                                                │
│         ├── /admin/*  → Dashboard (protected)                           │
│         ├── /portfolio/[slug] → Prospect preview pages                  │
│         │                                                                │
│  ┌─────────────┐  ┌──────────────┐                                     │
│  │     R2      │  │  Tracking    │                                      │
│  │  (Storage)  │  │  (Functions) │                                      │
│  └─────────────┘  └──────────────┘                                     │
└──────────────────────────────────────────────────────────────────────────┘
```

## Tech Stack

| Layer | Technology | Cost |
|-------|-----------|------|
| Frontend | React (Vite) → Cloudflare Pages | Free |
| Backend API | Cloudflare Pages Functions | Free (100K req/day) |
| Database | Cloudflare D1 (SQLite-at-edge) | Free (5M reads, 100K writes/day) |
| Object Storage | Cloudflare R2 | Free (10GB, 10M reads, 1M writes/month) |
| Worker Daemon | Node.js on dev desk | Free |
| AI | kiro-cli on dev desk | Free |
| Scraping | Puppeteer + Cheerio | Free |
| Email | Purelymail SMTP | ~$10/year |
| Discovery | Google Maps Places API | Free ($200/month credit) |
| Page Speed | Google PageSpeed Insights API | Free (25K/day) |

**Total monthly cost: $0-5**

## Core Design Decisions

### 1. Decoupled Pipeline Stages
Each stage operates independently with its own queue. The "queue" is a status column in D1 - no message broker needed. Stages:

```
discovered → scraped → generated → qa_passed → deployed → emailed → follow_up_due
```

Each worker queries for prospects at its target stage and processes them independently. The crawler can fill 1000 records while the generator processes 50/day - no blocking.

### 2. Deduplication
- **Key**: Normalized phone number (digits only) + city
- Store both raw phone (as entered) and normalized (digits only) for matching
- On conflict: merge data from multiple sources into one record

### 3. AI Generation
- Freeform HTML generation via kiro-cli (Claude model)
- Each site is unique - not template-based
- AI receives: business info + current site screenshot + niche inspiration references + niche-specific UI guidance
- Output: single self-contained HTML file (inline CSS, no external deps)
- Post-processing injects a fixed CTA footer before upload

### 4. Inspiration Library
- Dedicated "Inspiration Worker" runs on a schedule (weekly)
- Finds and screenshots top-performing sites per niche
- Stores to R2 under `/inspiration/{niche}/`
- Main generation pipeline reads from R2 (fast, no scraping during generation)

### 5. Quality Scoring (0-100)
| Signal | Points |
|--------|--------|
| No website at all | +30 |
| Has website but outdated design | +25 |
| Mobile-unfriendly (PageSpeed mobile < 50) | +15 |
| Slow site (PageSpeed < 40) | +10 |
| Recently opened (< 2 years) | +10 |
| High Google rating (4.0+) | +10 |
| Has email contact visible | +10 |
| Free email provider (gmail/yahoo) | +10 |
| Custom domain email | +5 |
| Low review count but active | +5 |
| Has social media presence | +5 |
| No email found | -5 |
| Multiple locations | -10 |
| Brand/franchise detected | -20 |

### 6. Email Strategy
- **Timing**: Smart per-timezone (8-9am prospect's local time), fallback to weighted windows
- **Drip**: Random jitter within windows, never batch-send
- **Warm-up ramp**: `[10, 25, 50, 100, 200, 300]` daily, step every 3 days if bounce < 2%
- **Auto-pause**: If bounce rate > 5%
- **Content**: Personalized (owner name, specific detail about their business, PageSpeed score)
- **Two templates**: "No website" vs "Website redesign"
- **Features**: Niche-specific feature list included (booking, gallery, etc.)
- **CTA**: Implied time limit ("preview available for the next 2 weeks")
- **No unsubscribe**: One-time outreach, not a mailing list
- **Contact info**: Included in footer

### 7. Follow-up System
- System auto-queues prospects: `stage = 'emailed'` AND `days > 4` AND `clicked = true`
- Dashboard shows "Follow-up Queue" for manual approve/reject
- Single follow-up only per prospect

### 8. Tracking
- **Opens**: 1x1 tracking pixel via Cloudflare Function
- **Clicks**: Portfolio link redirects through tracking endpoint
- Both log timestamps to D1
- Dashboard shows funnel: sent → opened → clicked → replied

### 9. Generated Site Delivery
- Pages never expire (R2 storage is cheap)
- Email implies limited availability for urgency
- Manual delete from admin dashboard if needed
- CTA footer injected post-generation: "Like this? Reply to get it live in 48 hours"

### 10. Worker ↔ Cloudflare Auth
- Direct D1/R2 API calls using Cloudflare API token
- Token stored in worker `.env` file on dev desk
- No middleware Functions needed for worker writes

## Database Schema (D1)

See `schema.sql` for full DDL.

Key tables:
- `prospects` - main pipeline table with stage tracking
- `campaigns` - discovery campaign configs (niche + locations)
- `niches` - pre-loaded niche categories with features and UI guidance
- `emails` - sent email log with tracking data
- `generated_sites` - metadata for generated pages
- `settings` - runtime config (rate limits, ramp level, API keys)
- `tracking_events` - open/click event log

## Cloudflare Free Tier Budget

| Resource | Free Limit | Our Usage (300/day) | Headroom |
|----------|-----------|---------------------|----------|
| Pages Functions | 100K req/day | ~5K | 95% free |
| D1 reads | 5M/day | ~10K | 99% free |
| D1 writes | 100K/day | ~2K | 98% free |
| D1 storage | 5GB | ~100MB | 98% free |
| R2 reads | 10M/month | ~10K | 99% free |
| R2 writes | 1M/month | ~9K | 99% free |
| R2 storage | 10GB | ~3GB | 70% free |

## Safe Generation Limits

| Stage | Daily Limit | Bottleneck |
|-------|-------------|------------|
| Discovery | 500 | Google Maps daily budget cap ($6/day in Cloud Console) |
| Scraping | 500 | Dev desk CPU (15s/site) |
| AI Generation | **50-100** | kiro-cli response time (60-120s/site), sequential |
| QA Scoring | 100-150 | kiro-cli (30s/score) |
| R2 Upload | Unlimited | API limit not a factor |
| Email | 300 (after ramp) | Domain reputation |

**Real bottleneck: AI generation at 50-100/day** (kiro-cli only, no external AI services). Crawler fills queue ahead; generation catches up over days. Yields 1,500-3,000 prospects/month.

**Google Maps budget protection**: Set $6/day cap in Google Cloud Console + 500 calls/day hard limit in worker config.

**All AI via kiro-cli**: No Jules, no external API keys. All generation, QA, extraction, and email composition runs through kiro-cli on dev desk (free, already authenticated).

## Cost Risks

| Item | Risk | Mitigation |
|------|------|------------|
| Google Maps API | Medium - close to free tier at scale | Cache results 7 days per postal code+niche |
| Email reputation | Medium - 300 cold/day will eventually decay | Rotate sending aliases, consider 2nd domain at month 2 |
| AI quality variance | Medium - some sites will be ugly | QA threshold 0.85+; failures go to manual review queue |
| IP blocking during scrape | Low - WAFs may block dev desk IP | Respect robots.txt, 3-5s delays, rotate User-Agent |

## Auth Gate (Dev Desk Worker)

The worker daemon runs on the dev desk which requires Midway authentication for kiro-cli. If auth expires mid-run, the worker must not spam retries.

**Behavior:**
1. Before each pipeline batch, check auth: `mwinit --check` (exit code 0 = valid)
2. If auth invalid: log warning, enter sleep mode (30 minutes)
3. After sleep: re-check auth
4. If still invalid: sleep again (max 3 cycles = 90 min total)
5. After 3 failed cycles: halt worker, send alert (dashboard notification or log)
6. On next manual `mwinit` by user, worker resumes automatically (health check loop)

**Implementation:**
```typescript
async function checkAuth(): Promise<boolean> {
  const result = await exec('mwinit --check');
  return result.exitCode === 0;
}

async function authGate(): Promise<void> {
  let retries = 0;
  while (!await checkAuth()) {
    retries++;
    if (retries > 3) {
      logger.error('Auth expired for 90+ min. Worker halted. Run mwinit to resume.');
      // Update D1 settings: worker_status = 'auth_halted'
      throw new AuthExpiredError();
    }
    logger.warn(`Auth expired. Sleeping 30 min (attempt ${retries}/3)...`);
    await sleep(30 * 60 * 1000);
  }
}
```

**Dashboard shows**: Worker status badge (running / auth_halted / paused).

## Legal Considerations

- Google Maps API ToS: use for discovery only, get emails from business websites not Google
- CAN-SPAM: one-time outreach (not mailing list) doesn't require unsubscribe, but include physical address
- CASL (Canada): implied consent exists for commercial electronic messages to publicly available addresses for relevant services

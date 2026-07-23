# Implementation Task Breakdown

## Phase 1: Foundation (Day 1-2)

### 1.1 Project Scaffold
- [ ] Initialize pnpm monorepo at `/home/dhruvill/Desktop/Projects/client-scraper`
- [ ] Create `packages/web` - React + Vite + Tailwind + React Router
- [ ] Create `packages/worker` - Node.js + TypeScript
- [ ] Create `shared/` - shared types
- [ ] Set up `wrangler.toml` with D1 + R2 bindings
- [ ] Configure TypeScript paths and aliases

### 1.2 Cloudflare Setup
- [ ] Create Cloudflare account (if not exists) or use existing
- [ ] Create D1 database: `client-scraper-db`
- [ ] Create R2 bucket: `client-scraper-assets`
- [ ] Run `schema.sql` migration on D1
- [ ] Create API token for worker (D1 + R2 permissions)
- [ ] Deploy empty Pages project to confirm pipeline works

### 1.3 Environment Config
- [ ] Worker `.env`: Cloudflare API token, D1 database ID, R2 bucket name, Purelymail SMTP creds
- [ ] Store API keys in D1 `settings` table for runtime config
- [ ] Set up `.env.example` template

---

## Phase 2: Worker - Discovery Module (Day 3-4)

### 2.1 Google Maps Discovery
- [ ] Implement Places API (New) search by niche + postal code
- [ ] Extract: name, phone, website, address, rating, review count, business age
- [ ] Implement 7-day cache (don't re-query same postal code + niche)
- [ ] Rate limiting: 1-2s between API calls
- [ ] Write results to D1 `prospects` table at stage='discovered'

### 2.2 Deduplication
- [ ] Normalize phone: strip all non-digits, store raw + normalized
- [ ] On insert: check `phone_normalized + city` unique constraint
- [ ] On conflict: merge source data (JSON merge of source_data column)

### 2.3 Quality Scoring
- [ ] Implement scoring function with all 12 signals
- [ ] PageSpeed API integration (mobile + desktop scores)
- [ ] Email type detection (custom domain vs free provider)
- [ ] Timezone detection from city/state (use a timezone lookup library)
- [ ] Write composite score to `quality_score` column

---

## Phase 3: Worker - Scraper Module (Day 5-6)

### 3.1 Puppeteer Scraping
- [ ] Launch headless browser, navigate to business website
- [ ] Take full-page screenshot → save to R2
- [ ] Extract page content (Cheerio): text, headings, images, links
- [ ] Detect email addresses on the page
- [ ] Detect owner name (About page, footer)
- [ ] Respect robots.txt
- [ ] 3-5s delay between sites
- [ ] Rotate User-Agent strings (5-10 variants)

### 3.2 Content Extraction via AI
- [ ] Pass screenshot + HTML to kiro-cli with Prompt 1
- [ ] Parse JSON response: services, hours, unique selling points
- [ ] Store extracted data in D1 `source_data` JSON column
- [ ] Update stage to 'scraped'

### 3.3 Error Handling
- [ ] If site is down/blocked: mark `last_error`, increment `retry_count`
- [ ] If no email found: flag `email_type = 'none'`, still continue pipeline
- [ ] Max 3 retries per prospect, then mark as 'scrape_failed'

---

## Phase 4: Worker - Generator Module (Day 7-9)

### 4.1 AI Site Generation
- [ ] Load niche inspiration screenshots from R2
- [ ] Load niche UI guidance + features from D1
- [ ] Select prompt: Prompt 2 (no website) or Prompt 3 (redesign)
- [ ] Call kiro-cli with full context (business info + inspiration + prompt)
- [ ] Receive HTML output
- [ ] Validate HTML (basic checks: has <html>, has business name, no Lorem ipsum)

### 4.2 Post-Processing
- [ ] Inject CTA footer HTML before closing </body>
- [ ] Inject tracking pixel: `<img src="https://{domain}/api/track/open/{prospect_id}.png" width="1" height="1" />`
- [ ] Replace portfolio link with tracking redirect URL
- [ ] Generate unique portfolio slug from business name

### 4.3 QA Scoring
- [ ] Take screenshot of generated HTML (Puppeteer on local file)
- [ ] Pass to kiro-cli with Prompt 4
- [ ] If score >= 0.85: update stage to 'qa_passed'
- [ ] If score < 0.85: update stage to 'qa_failed', store feedback
- [ ] QA failures go to admin dashboard "Manual Review" queue

---

## Phase 5: Worker - Deploy + Email Module (Day 10-12)

### 5.1 Deployment to R2
- [ ] Upload generated HTML to R2: `portfolio/{slug}/index.html`
- [ ] Upload screenshot to R2: `screenshots/{prospect_id}.png`
- [ ] Construct public URL: `https://{domain}/portfolio/{slug}`
- [ ] Update D1: `generated_site_url`, `portfolio_slug`
- [ ] Update stage to 'deployed'

### 5.2 Email Composition
- [ ] Call kiro-cli with Prompt 5 or 6 (based on has_website flag)
- [ ] Inject personalization: owner name, specific detail, PageSpeed score
- [ ] Include niche-specific features in body
- [ ] Select subject line (A/B: alternate between option 1 and 2)
- [ ] Replace `{portfolio_url}` with tracking redirect link

### 5.3 Email Sending
- [ ] Configure Nodemailer with Purelymail SMTP
- [ ] Implement warm-up ramp logic (check current level from D1 settings)
- [ ] Implement timezone-aware scheduling (send at 8-9am prospect's local time)
- [ ] Fallback: weighted time windows if timezone unknown
- [ ] Random jitter (1-6 min between sends)
- [ ] Log to `email_log` table
- [ ] Update stage to 'emailed', record `email_sent_at`

### 5.4 Bounce Handling
- [ ] Monitor SMTP response codes
- [ ] Hard bounce: mark prospect, don't retry
- [ ] Soft bounce: retry once after 24h
- [ ] If daily bounce rate > 5%: auto-pause pipeline, alert in dashboard

---

## Phase 6: Cloudflare Functions - API Layer (Day 13-14)

### 6.1 Tracking Endpoints
- [ ] `GET /api/track/open/[id].png` - serve 1x1 pixel, log event to D1
- [ ] `GET /api/track/click/[id]` - log click, 302 redirect to actual portfolio URL
- [ ] Rate limit: max 1 event per prospect per 5 minutes (prevent inflated counts)

### 6.2 Portfolio Serving
- [ ] `GET /portfolio/[slug]` - fetch HTML from R2, serve with proper headers
- [ ] Cache-Control headers for CDN caching
- [ ] 404 page for invalid slugs

### 6.3 Admin API (protected)
- [ ] Auth middleware: check Bearer token from settings
- [ ] `GET /api/prospects` - list with filters (stage, campaign, score range)
- [ ] `GET /api/prospects/[id]` - detail view
- [ ] `POST /api/prospects` - manual add
- [ ] `PATCH /api/prospects/[id]` - update (approve follow-up, change stage)
- [ ] `GET /api/campaigns` - list campaigns
- [ ] `POST /api/campaigns` - create campaign
- [ ] `PATCH /api/campaigns/[id]` - update (pause/resume)
- [ ] `GET /api/stats` - dashboard metrics (funnel, daily counts, conversion rates)
- [ ] `GET /api/settings` - runtime settings
- [ ] `PATCH /api/settings` - update settings
- [ ] `POST /api/follow-up/approve` - batch approve follow-ups

---

## Phase 7: Admin Dashboard - React UI (Day 15-18)

### 7.1 Layout & Auth
- [ ] Simple password login (single user)
- [ ] Sidebar navigation: Dashboard, Prospects, Campaigns, Email Log, Settings
- [ ] Top bar: pipeline stage counts as badges

### 7.2 Dashboard Page
- [ ] Funnel visualization: discovered → scraped → generated → deployed → emailed
- [ ] Today's stats: emails sent, opens, clicks, bounces
- [ ] Ramp status indicator
- [ ] Active campaigns summary
- [ ] Quality score distribution chart

### 7.3 Prospects Page
- [ ] Table: name, niche, stage, score, email status, actions
- [ ] Filters: stage, campaign, score range, has_email
- [ ] Bulk actions: approve follow-up, retry generation, delete
- [ ] Detail modal: full prospect info, generated site preview (iframe), email copy
- [ ] "Manual Add" form: add a business URL + niche manually

### 7.4 Campaigns Page
- [ ] Create campaign form: name, niche dropdown, postal codes input, radius, daily limit
- [ ] Campaign list with status, discovered count, active/paused toggle
- [ ] Campaign detail: prospects discovered by this campaign

### 7.5 Email Log Page
- [ ] Sent emails table: date, recipient, subject, status (sent/opened/clicked/bounced)
- [ ] Filter by status, date range
- [ ] Open/click rate metrics

### 7.6 Follow-up Queue
- [ ] List: prospects where stage='follow_up_due'
- [ ] Select all / individual select
- [ ] "Approve Selected" button → triggers follow-up worker

### 7.7 Settings Page
- [ ] Ramp configuration (current level, manual override)
- [ ] Rate limits (scraper delay, daily email cap)
- [ ] QA threshold slider
- [ ] API keys display (masked)
- [ ] Purelymail config

---

## Phase 8: Inspiration Worker (Day 19-20)

### 8.1 Scheduled Niche Research
- [ ] For each niche: call kiro-cli with Prompt 7 to find best sites
- [ ] Puppeteer: screenshot each URL (full page + mobile viewport)
- [ ] Upload screenshots to R2: `inspiration/{niche_id}/{filename}.png`
- [ ] Update `inspiration_sites` table with metadata
- [ ] Schedule: weekly cron (Saturday night)

---

## Phase 9: Follow-up Worker (Day 21)

### 9.1 Auto-Queue Logic
- [ ] Cron: daily check for prospects where:
  - stage = 'emailed'
  - days since email > 4
  - click_count > 0 OR open_count > 2
  - follow_up_sent_at IS NULL
- [ ] Move matching prospects to stage='follow_up_due'

### 9.2 Follow-up Sender
- [ ] After admin approves batch: generate follow-up email
- [ ] Short, reference the original preview
- [ ] "Just checking if you had a chance to see the preview I sent"
- [ ] Same timezone-aware sending logic
- [ ] Update stage to 'follow_up_sent'

---

## Phase 10: Polish & Go-Live (Day 22-25)

### 10.1 Testing
- [ ] End-to-end test: one real business through full pipeline
- [ ] Email deliverability test (mail-tester.com score)
- [ ] Mobile test generated sites on real phone
- [ ] Load test D1 with 10K records

### 10.2 Monitoring
- [ ] Worker logs: structured JSON logging
- [ ] Daily summary log: emails sent, bounces, opens, pipeline depth per stage
- [ ] Error alerting: if bounce > 5%, if worker crashes

### 10.3 Deployment
- [ ] Deploy React app to Cloudflare Pages (GitHub/Git push)
- [ ] Set up custom domain for portfolio URLs
- [ ] Configure DNS for tracking domain
- [ ] Start warm-up ramp (10 emails/day for first 3 days)

---

## Estimated Timeline

| Phase | Days | Description |
|-------|------|-------------|
| 1 | 2 | Foundation & scaffold |
| 2 | 2 | Discovery module |
| 3 | 2 | Scraper module |
| 4 | 3 | Generator + QA |
| 5 | 3 | Deploy + Email |
| 6 | 2 | API layer |
| 7 | 4 | Admin dashboard |
| 8 | 2 | Inspiration worker |
| 9 | 1 | Follow-up worker |
| 10 | 4 | Polish & go-live |
| **Total** | **~25 days** | |

With vibe coding + AI assistance, realistically compress to **10-15 days**.

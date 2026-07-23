# Client Scraper - Master Build Orchestrator

## Status: ✅ BUILD COMPLETE - READY TO DEPLOY
## Updated: 2026-07-22 23:32 UTC
## Project: /home/dhruvill/Desktop/Projects/client-scraper

## Verified Credentials
- ✅ Cloudflare D1: client-scraper-db (96e7e0f0-300f-4de6-80db-eb4872872a7a)
- ✅ Cloudflare R2: client-scraper-assets
- ✅ Google Places API: working (test query returned results)
- ✅ Purelymail SMTP: configured (admin@cloudgenz.com)
- ✅ Portfolio domain: preview.cloudgenz.com

## Build Verification
- ✅ Web app: Vite build passes (213KB JS + 22KB CSS)
- ✅ Worker: tsx starts successfully, all imports resolve
- ✅ Design database: search.py tested (returns niche-specific palettes)
- ✅ Skills: 19 mac-skills + 7 fadekingzz-steering skills + ui-ux-pro-max database loaded

## Phase Completion

### ✅ Phase 1: Scaffold & Infrastructure
- [x] pnpm monorepo (root + web + worker + shared)
- [x] TypeScript configs
- [x] .gitignore, .env
- [x] wrangler.toml with D1 + R2 bindings
- [x] deploy.sh script
- [x] Root package.json with all scripts

### ✅ Phase 2: Worker - Core Services
- [x] Cloudflare API client (D1 read/write, R2 upload/download)
- [x] AI service (kiro-cli wrapper - aiCall, aiCallJson, aiGenerateHtml)
- [x] Auth gate (mwinit check + 30min sleep)
- [x] Logger (structured JSON)
- [x] Config loader (.env)
- [x] Quality scoring engine (10 signals, 0-100)
- [x] Design lookup (Python-based ui-ux-pro-max database)

### ✅ Phase 3: Worker - Discovery
- [x] Google Places API integration (key rotation)
- [x] 7-day cache logic
- [x] Phone normalization + dedup (phone + city key)
- [x] PageSpeed API integration
- [x] Timezone detection (city-timezones)
- [x] Write to D1 at stage='discovered'

### ✅ Phase 4: Worker - Scraper
- [x] Puppeteer screenshot
- [x] Cheerio content extraction
- [x] AI content extraction (kiro-cli)
- [x] Email detection + type classification
- [x] R2 screenshot upload
- [x] Error handling + retries
- [x] Rate limiting (3-5s delay)

### ✅ Phase 5: Worker - Generator (REWRITTEN - Vision QA Loop)
- [x] Plan site structure with database-driven design system
- [x] Load ALL 26 design skills dynamically
- [x] Query ui-ux-pro-max database per niche for exact colors/fonts/patterns
- [x] AI generation via aiCall() (not unreliable file write)
- [x] Puppeteer screenshot + base64 encoding
- [x] AI VISION evaluation (7-axis rubric, 0.85 threshold)
- [x] Iterative improvement (up to 5 passes, full HTML rewrite each time)
- [x] CTA footer injection with tracking pixel
- [x] Portfolio slug generation + R2 upload

### ✅ Phase 6: Worker - Deploy + Email (REWRITTEN - HTML Emails)
- [x] R2 upload for generated sites
- [x] Email composition via AI (returns HTML body natively)
- [x] Proper HTML email template (inline CSS, table layout, MSO conditionals)
- [x] Nodemailer + Purelymail SMTP
- [x] Copy to Sent folder via IMAP APPEND
- [x] List-Unsubscribe + List-Unsubscribe-Post headers
- [x] Warm-up ramp logic (auto-advance with bounce monitoring)
- [x] Smart per-timezone send scheduling with jitter
- [x] Bounce rate monitoring + auto-pause

### ✅ Phase 7: Cloudflare Functions (API)
- [x] Auth middleware (Bearer token, JWT-like)
- [x] Tracking: open pixel (1x1 PNG) + click redirect
- [x] Portfolio serving from R2 (dynamic [slug] route)
- [x] CRUD: prospects (list with pagination, create, update)
- [x] CRUD: campaigns (list, create, update, delete)
- [x] Stats endpoint (pipeline counts, open/click rates)
- [x] Follow-up approval endpoint
- [x] Email log endpoint
- [x] Settings endpoint (get/save)
- [x] _shared.ts (Env types, CORS, auth verification)

### ✅ Phase 8: Admin Dashboard (React + Tailwind)
- [x] Login page (password auth)
- [x] Layout + Sidebar navigation
- [x] Dashboard (pipeline funnel, stats cards, campaign overview)
- [x] Prospects table (sort, filter, expand detail, batch actions)
- [x] Campaigns CRUD (niche dropdown, postal codes, radius, limits)
- [x] Email log (table with status, opened/clicked indicators)
- [x] Follow-up queue (approve/reject batch)
- [x] Settings page
- [x] PipelineFunnel component (visual stage counts)
- [x] StatsCard, ProspectTable, CampaignForm components

### ✅ Phase 9: Supporting Workers
- [x] Follow-up auto-queue (daily scan for follow_up_due)
- [x] Follow-up sender (sends approved follow-ups)
- [x] Inspiration refresh worker (Puppeteer screenshots of top niche sites)
- [x] Scheduler index.ts (exports all schedulers)

### ⏳ Phase 10: Go Live Steps
- [ ] Deploy D1 schema: `pnpm db:schema` (or `wrangler d1 execute client-scraper-db --file=./schema.sql`)
- [ ] Deploy web to Cloudflare Pages: `pnpm deploy:web`
- [ ] Set up custom domain: preview.cloudgenz.com -> CF Pages
- [ ] Set ADMIN_PASSWORD as Cloudflare secret (not default 'changeme')
- [ ] Run first discovery: `pnpm start:worker` with a test campaign
- [ ] Verify generated site quality before enabling email
- [ ] Start ramp: initial volume 10/day

## Design Skills Loaded (Generation Prompt)
1. frontend-design (anti-patterns, philosophy)
2. bolder (amplify safe designs)
3. colorize (color intensification)
4. animate (motion & transitions)
5. polish (refinement & craft)
6. delight (joy & personality)
7. critique (quality evaluation)
8. audit (accessibility & compliance)
9. adapt, clarify, distill, extract, harden, normalize, optimize, quieter
10. beautiful-shadows (depth & elevation)
11. landing-page (conversion structure)
12. ui-styling (Tailwind + Shadcn reference)
13. design-system (token architecture)
14. ui-ux-pro-max (67 styles, 161 palettes, 57 fonts, 99 UX rules - searchable DB)

## Architecture Summary
```
DEV DESK WORKER                    CLOUDFLARE (free tier)
┌─────────────────────┐           ┌──────────────────────────┐
│ Discovery (Maps API)│           │ D1 Database              │
│ Scraper (Puppeteer) │──D1/R2──→│ R2 Storage               │
│ Generator (kiro-cli)│   API     │ Pages (React dashboard)  │
│ QA (Vision + Puppr) │           │ Functions (API + tracking)│
│ Mailer (Purelymail) │           │ Portfolio (generated HTML)│
└─────────────────────┘           └──────────────────────────┘
```

## Key Files
- `packages/worker/src/index.ts` - Worker entry point
- `packages/worker/src/pipeline/generator.ts` - Multi-pass generation with vision QA
- `packages/worker/src/services/design-lookup.ts` - ui-ux-pro-max database wrapper
- `packages/worker/src/prompts/load-skills.ts` - Dynamic skill loader (26 skills)
- `packages/web/functions/` - Cloudflare Functions API
- `packages/web/src/` - React admin dashboard
- `schema.sql` - D1 database schema
- `deploy.sh` - One-command deployment
- `.env` - All credentials (gitignored)

# Project Structure & Coding Instructions

## Monorepo Structure

```
client-scraper/
├── packages/
│   ├── web/                          # React SPA → Cloudflare Pages
│   │   ├── src/
│   │   │   ├── pages/
│   │   │   │   ├── admin/
│   │   │   │   │   ├── Dashboard.tsx
│   │   │   │   │   ├── Prospects.tsx
│   │   │   │   │   ├── ProspectDetail.tsx
│   │   │   │   │   ├── Campaigns.tsx
│   │   │   │   │   ├── CampaignCreate.tsx
│   │   │   │   │   ├── EmailLog.tsx
│   │   │   │   │   ├── FollowUpQueue.tsx
│   │   │   │   │   ├── Settings.tsx
│   │   │   │   │   └── ManualReview.tsx
│   │   │   │   ├── portfolio/
│   │   │   │   │   └── [slug].tsx     # Dynamic route for portfolio pages
│   │   │   │   └── Login.tsx
│   │   │   ├── components/
│   │   │   │   ├── Layout.tsx
│   │   │   │   ├── Sidebar.tsx
│   │   │   │   ├── StageBar.tsx        # Pipeline stage progress
│   │   │   │   ├── ProspectTable.tsx
│   │   │   │   ├── ScoreBar.tsx        # Quality score visual
│   │   │   │   ├── FunnelChart.tsx
│   │   │   │   └── CampaignForm.tsx
│   │   │   ├── lib/
│   │   │   │   ├── api.ts              # Fetch wrapper for CF Functions
│   │   │   │   ├── auth.ts             # Simple token auth
│   │   │   │   └── types.ts            # Shared types
│   │   │   ├── App.tsx
│   │   │   └── main.tsx
│   │   ├── functions/                  # Cloudflare Pages Functions
│   │   │   └── api/
│   │   │       ├── prospects/
│   │   │       │   ├── index.ts        # GET (list), POST (create)
│   │   │       │   └── [id].ts         # GET (detail), PATCH (update)
│   │   │       ├── campaigns/
│   │   │       │   ├── index.ts
│   │   │       │   └── [id].ts
│   │   │       ├── stats.ts
│   │   │       ├── settings.ts
│   │   │       ├── follow-up/
│   │   │       │   └── approve.ts
│   │   │       └── track/
│   │   │           ├── open/
│   │   │           │   └── [id].ts     # Tracking pixel
│   │   │           └── click/
│   │   │               └── [id].ts     # Click redirect
│   │   ├── public/
│   │   ├── index.html
│   │   ├── vite.config.ts
│   │   ├── tailwind.config.js
│   │   ├── tsconfig.json
│   │   └── package.json
│   │
│   └── worker/                         # Dev desk daemon
│       ├── src/
│       │   ├── pipeline/
│       │   │   ├── discoverer.ts       # Google Maps API discovery
│       │   │   ├── scraper.ts          # Puppeteer + content extraction
│       │   │   ├── generator.ts        # AI site generation via kiro-cli
│       │   │   ├── qa.ts               # QA scoring via kiro-cli
│       │   │   ├── deployer.ts         # Upload to R2
│       │   │   ├── mailer.ts           # Purelymail SMTP
│       │   │   └── follow-up.ts        # Follow-up email sender
│       │   ├── services/
│       │   │   ├── cloudflare.ts       # D1 + R2 API client
│       │   │   ├── ai.ts              # kiro-cli wrapper
│       │   │   ├── pagespeed.ts       # Google PageSpeed API
│       │   │   ├── timezone.ts        # City → timezone lookup
│       │   │   └── scoring.ts         # Quality score calculator
│       │   ├── scheduler/
│       │   │   ├── index.ts           # Main scheduler loop
│       │   │   ├── ramp.ts            # Email warm-up ramp logic
│       │   │   └── timing.ts          # Timezone-aware send timing
│       │   ├── inspiration/
│       │   │   └── worker.ts          # Inspiration refresh worker
│       │   ├── config.ts              # Load .env + runtime settings
│       │   ├── logger.ts              # Structured JSON logging
│       │   └── index.ts               # Entry point
│       ├── .env                        # API keys (gitignored)
│       ├── .env.example
│       ├── tsconfig.json
│       └── package.json
│
├── shared/
│   └── types.ts                        # Shared TypeScript types
│
├── d1/
│   └── schema.sql                      # D1 migrations
│
├── docs/
│   ├── DESIGN.md                       # This design doc
│   ├── AI_PROMPTS.md                   # All AI prompts
│   ├── TASKS.md                        # Task breakdown
│   └── STRUCTURE.md                    # This file
│
├── wrangler.toml                       # Cloudflare config
├── pnpm-workspace.yaml
├── package.json
├── tsconfig.base.json
└── .gitignore
```

## Key Dependencies

### packages/web
```json
{
  "dependencies": {
    "react": "^18",
    "react-dom": "^18",
    "react-router-dom": "^6",
    "recharts": "^2",             // Dashboard charts
    "@tanstack/react-query": "^5" // Data fetching + caching
  },
  "devDependencies": {
    "vite": "^5",
    "tailwindcss": "^3",
    "typescript": "^5",
    "wrangler": "^3",             // CF Pages dev server
    "@cloudflare/workers-types": "^4"
  }
}
```

### packages/worker
```json
{
  "dependencies": {
    "puppeteer": "^22",
    "cheerio": "^1",
    "nodemailer": "^6",
    "p-queue": "^8",              // Concurrency control
    "city-timezones": "^1",       // City → timezone
    "nanoid": "^5",               // ID generation
    "dotenv": "^16"
  },
  "devDependencies": {
    "typescript": "^5",
    "tsx": "^4",                   // TS execution
    "@types/node": "^20"
  }
}
```

## Vibe Coding Instructions

When using AI tools (Cursor, Copilot, kiro-cli, etc.) to build this project, provide these context instructions:

### Global Context (paste at start of every session)
```
I'm building a client scraper pipeline. Architecture:
- React (Vite) frontend on Cloudflare Pages with Pages Functions as API
- Node.js worker daemon on my dev machine
- Cloudflare D1 (SQLite) for data, R2 for file storage
- Worker talks to D1/R2 via Cloudflare REST API
- AI generation via kiro-cli (Claude model, free)
- Email via Purelymail SMTP
- Solo operator, no multi-tenancy

See DESIGN.md for full architecture, schema.sql for database, AI_PROMPTS.md for generation prompts.
```

### Per-module prompts:

**For Discovery module:**
```
Build the discoverer module. It uses Google Places API (New) to find businesses by niche + postal code. Write results to D1 via Cloudflare API. Implement 7-day caching (don't re-query same postal+niche within 7 days). Include quality scoring using the signals in DESIGN.md. Normalize phone numbers to digits-only for dedup.
```

**For Scraper module:**
```
Build the scraper module. Uses Puppeteer to screenshot business websites and Cheerio to extract content. AI (kiro-cli) does structured extraction. 3-5s delay between sites. Stores screenshots to R2. Handles errors gracefully (max 3 retries). Respects robots.txt.
```

**For Generator module:**
```
Build the generator module. Takes prospect data + niche inspiration images from R2 + niche UI guidance from D1. Calls kiro-cli with the appropriate prompt (no-website vs redesign). Post-processes: injects CTA footer + tracking pixel. Then QA scores the result. Threshold 0.85 to pass.
```

**For Email module:**
```
Build the email module. Uses Nodemailer + Purelymail SMTP. Implements warm-up ramp (configurable steps). Timezone-aware sending (8-9am local). Random jitter between sends. Two templates: no-website vs redesign. Includes niche-specific features. Tracks bounces and auto-pauses on high bounce rate.
```

**For Admin Dashboard:**
```
Build the admin dashboard React pages. Tailwind CSS styling. React Router for navigation. Tanstack Query for data fetching from Cloudflare Functions API. Pages: Dashboard (funnel chart, stats), Prospects (table with filters + bulk actions), Campaigns (CRUD), Email Log, Follow-up Queue (approve/reject), Settings. Simple password auth.
```

## Cloudflare Wrangler Config

```toml
# wrangler.toml
name = "client-scraper"
compatibility_date = "2024-01-01"
pages_build_output_dir = "packages/web/dist"

[[d1_databases]]
binding = "DB"
database_name = "client-scraper-db"
database_id = "<your-d1-id>"

[[r2_buckets]]
binding = "ASSETS"
bucket_name = "client-scraper-assets"

[vars]
ADMIN_TOKEN = "<generate-a-strong-token>"
TRACKING_DOMAIN = "<your-domain>"
```

## Running Locally

```bash
# Web (dashboard + functions)
cd packages/web
pnpm dev                    # Vite dev server + wrangler pages dev

# Worker (pipeline)
cd packages/worker
cp .env.example .env        # Fill in API keys
pnpm dev                    # tsx watch mode
```

## Deployment

```bash
# Web → Cloudflare Pages
cd packages/web
pnpm build                  # Vite builds to dist/
wrangler pages deploy dist  # Or connect to Git for auto-deploy

# Worker → just runs on dev desk
cd packages/worker
pnpm start                  # Production mode with pm2 or similar
```

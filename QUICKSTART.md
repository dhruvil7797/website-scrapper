# Quick Start & Next Steps

## What's in this folder

| File | Purpose |
|------|---------|
| `DESIGN.md` | Complete architecture & design decisions |
| `TASKS.md` | Full implementation checklist with phases |
| `STRUCTURE.md` | Project folder structure + vibe coding prompts |
| `AI_PROMPTS.md` | All AI prompts for generation, QA, emails |
| `schema.sql` | Complete D1 database schema (ready to run) |
| `QUICKSTART.md` | This file - what to do next |

## Next Steps (in order)

### Step 1: Set up Cloudflare (15 min)
1. Log into Cloudflare dashboard
2. Create a D1 database: `client-scraper-db`
3. Create an R2 bucket: `client-scraper-assets`
4. Run `schema.sql` on D1: `wrangler d1 execute client-scraper-db --file=./schema.sql`
5. Create API token with D1 + R2 read/write permissions
6. Note down: D1 database ID, R2 bucket name, API token

### Step 2: Initialize the project (30 min)
```bash
cd /home/dhruvill/Desktop/Projects/client-scraper
pnpm init
# Create pnpm-workspace.yaml:
# packages:
#   - 'packages/*'
#   - 'shared'

mkdir -p packages/web packages/worker shared

# Web app
cd packages/web
pnpm create vite . --template react-ts
pnpm add react-router-dom @tanstack/react-query recharts
pnpm add -D tailwindcss postcss autoprefixer wrangler @cloudflare/workers-types
npx tailwindcss init -p

# Worker
cd ../worker
pnpm init
pnpm add puppeteer cheerio nodemailer p-queue city-timezones nanoid dotenv
pnpm add -D typescript tsx @types/node
npx tsc --init
```

### Step 3: Build the first pipeline stage (2 hours)
Start with Discovery - it's the simplest and fills the queue for everything else:
1. Copy the discoverer module structure from `STRUCTURE.md`
2. Implement Google Maps Places API search
3. Write results to D1
4. Test with one postal code + one niche

### Step 4: End-to-end proof of concept (4 hours)
Pick ONE real business and manually run through:
1. Discover it (or manually add to D1)
2. Screenshot its site
3. Generate a redesign with kiro-cli
4. Upload to R2
5. Send yourself the email

This validates the entire pipeline works before building automation.

### Step 5: Build the dashboard (parallel track)
While worker modules are being built, start the admin UI:
1. Layout + routing
2. Read-only Dashboard page (query D1 stats)
3. Prospects table view
4. Campaign creation form

---

## How to Vibe Code This Efficiently

### Strategy: Build vertically, not horizontally
Don't build all of stage 1, then all of stage 2. Instead:
1. Build ONE complete path (discover 1 business → generate 1 site → send 1 email)
2. Then add breadth (handle errors, add batch processing, add dashboard views)

### Using AI tools effectively
1. Open a new AI session
2. Paste the "Global Context" from STRUCTURE.md
3. Paste the relevant per-module prompt
4. Point it at schema.sql for type reference
5. Let it generate the module, then review/adjust

### Key files to reference in every AI session
- `schema.sql` - for database types and column names
- `AI_PROMPTS.md` - for exact prompt text to use in generator/QA/email
- `DESIGN.md` - for architecture decisions and constraints
- `shared/types.ts` - once created, for TypeScript interfaces

---

## Domain/DNS Setup (do early)

You need a domain for:
1. **Portfolio URLs**: `yourdomain.com/portfolio/joes-plumbing`
2. **Tracking pixel/clicks**: `yourdomain.com/api/track/...`
3. **Sending email**: Already done (Purelymail domain)

Options:
- Use your existing Purelymail domain for portfolio too (simplest)
- Buy a separate professional-sounding domain ($10/year)
  - Example: `webpreview.pro`, `sitecraft.dev`, `yourname-studio.com`

The domain for portfolio/tracking must be different from (or a subdomain of) your email sending domain to avoid email reputation affecting site availability.

---

## Estimated Costs at Scale

| 300 prospects/day | Monthly Cost |
|-------------------|-------------|
| Cloudflare (all services) | $0 |
| Purelymail | $0.83 |
| Google Maps API | $0 (under $200 credit) |
| Domain (if buying new) | $0.83 |
| Dev desk electricity | ~$5 |
| **Total** | **~$7/month** |

First paying client covers 1+ years of operation costs.

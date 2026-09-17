# Client Scraper V2 — Simplified Discovery + Manual Outreach Tool

**Date:** 2026-09-03
**Goal:** Rebuild from scratch as a Cloudflare-only app. No AI, no Puppeteer, no worker daemon. Pure discovery + scoring + manual email outreach with template management.

---

## Architecture

```
Cloudflare Pages + Functions + D1
├── React SPA (Vite + Tailwind CSS)
├── Pages Functions (TypeScript API)
└── D1 (SQLite database)
```

**Stack:** TypeScript, React, Vite, Tailwind CSS, Cloudflare Pages/Functions/D1
**Email:** Resend HTTP API (free 100/day). Swappable later with self-hosted SMTP bridge.
**Discovery:** Google Maps Places API (New)
**Cost:** $0/month (all free tiers)
**Deploy:** `npx wrangler pages deploy dist`

---

## Step 1: Project Setup

Delete ALL existing files except `.git/` and `.gitignore`. Create fresh structure:

```
client-scraper/
├── .gitignore
├── package.json            (single package, NOT monorepo)
├── tsconfig.json
├── vite.config.ts
├── tailwind.config.js
├── postcss.config.js
├── wrangler.toml           (D1 binding, env vars)
├── schema.sql
├── seed-niches.sql         (50 niche categories INSERT statements)
├── seed-templates.sql      (6 pre-built email templates)
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── index.css
│   ├── types.ts
│   ├── lib/
│   │   └── api.ts          (fetch wrapper for all API calls)
│   ├── components/
│   │   ├── Layout.tsx
│   │   ├── StatsCard.tsx
│   │   ├── ProspectTable.tsx
│   │   ├── TemplateEditor.tsx
│   │   └── EmailComposer.tsx
│   └── pages/
│       ├── Dashboard.tsx
│       ├── Campaigns.tsx
│       ├── Prospects.tsx
│       ├── Compose.tsx         (email composer with template + placeholders)
│       ├── Templates.tsx       (CRUD template management)
│       ├── Settings.tsx
│       └── Login.tsx
├── functions/
│   ├── _shared.ts          (D1 helpers, auth middleware, types)
│   └── api/
│       ├── auth.ts
│       ├── discover.ts     (Google Maps → score → D1)
│       ├── prospects.ts    (list, get, update, delete, bulk actions)
│       ├── campaigns.ts    (CRUD)
│       ├── templates.ts    (CRUD email templates)
│       ├── send-email.ts   (Resend HTTP API)
│       ├── settings.ts     (get/set)
│       └── stats.ts        (dashboard metrics)
└── index.html
```

### package.json

```json
{
  "name": "client-scraper",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "wrangler pages dev dist",
    "deploy": "npm run build && npx wrangler pages deploy dist",
    "db:init": "wrangler d1 execute client-scraper-db --file=./schema.sql",
    "db:seed-niches": "wrangler d1 execute client-scraper-db --file=./seed-niches.sql",
    "db:seed-templates": "wrangler d1 execute client-scraper-db --file=./seed-templates.sql",
    "db:reset": "npm run db:init && npm run db:seed-niches && npm run db:seed-templates"
  },
  "dependencies": {
    "react": "^18",
    "react-dom": "^18",
    "react-router-dom": "^6"
  },
  "devDependencies": {
    "@cloudflare/workers-types": "^4",
    "@types/react": "^18",
    "@types/react-dom": "^18",
    "autoprefixer": "^10",
    "postcss": "^8",
    "tailwindcss": "^3",
    "typescript": "^5",
    "vite": "^5",
    "@vitejs/plugin-react": "^4",
    "wrangler": "^3"
  }
}
```

### wrangler.toml

```toml
name = "client-scraper"
compatibility_date = "2024-09-01"
pages_build_output_dir = "dist"

[[d1_databases]]
binding = "DB"
database_name = "client-scraper-db"
database_id = "96e7e0f0-300f-4de6-80db-eb4872872a7a"

[vars]
ADMIN_PASSWORD = "Cloud@Dhruvil"
```

Secrets (set via `wrangler pages secret put`):
- `RESEND_API_KEY`
- `GOOGLE_API_KEY`

---

## Step 2: Database Schema

```sql
-- schema.sql

-- Niches (50 pre-loaded categories)
CREATE TABLE IF NOT EXISTS niches (
  id TEXT PRIMARY KEY,                    -- slug: "plumber", "dentist"
  name TEXT NOT NULL,                     -- "Plumber", "Dentist"
  category TEXT NOT NULL,                 -- "Home Services", "Healthcare", etc.
  search_terms TEXT NOT NULL,             -- JSON array: ["plumber", "plumbing service"]
  typical_features TEXT,                  -- JSON array: features a good site should have
  created_at TEXT DEFAULT (datetime('now'))
);

-- Campaigns (discovery runs)
CREATE TABLE IF NOT EXISTS campaigns (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  niche_id TEXT NOT NULL REFERENCES niches(id),
  location TEXT NOT NULL,                 -- "Austin, TX" or postal code
  country TEXT DEFAULT 'US',
  radius_km INTEGER DEFAULT 40,
  requested_count INTEGER DEFAULT 50,
  discovered_count INTEGER DEFAULT 0,
  status TEXT DEFAULT 'pending',          -- pending, running, completed, failed
  created_at TEXT DEFAULT (datetime('now'))
);

-- Prospects
CREATE TABLE IF NOT EXISTS prospects (
  id TEXT PRIMARY KEY,

  -- Business info
  business_name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  website_url TEXT,
  address TEXT,
  city TEXT,
  state_province TEXT,
  postal_code TEXT,
  country TEXT DEFAULT 'US',
  owner_name TEXT,

  -- Discovery metadata
  campaign_id TEXT REFERENCES campaigns(id),
  niche_id TEXT REFERENCES niches(id),
  google_place_id TEXT UNIQUE,
  google_rating REAL,
  google_review_count INTEGER,
  google_types TEXT,                      -- JSON array of Google place types

  -- Scoring
  quality_score INTEGER DEFAULT 0,        -- 0-100
  score_breakdown TEXT,                   -- JSON object

  -- Website analysis (from PageSpeed API — free, no Puppeteer)
  has_website INTEGER DEFAULT 0,
  pagespeed_mobile INTEGER,
  pagespeed_desktop INTEGER,
  is_mobile_friendly INTEGER,

  -- Status
  status TEXT DEFAULT 'new',              -- new, contacted, replied, won, lost, skipped
  notes TEXT,

  -- Email tracking
  last_emailed_at TEXT,
  email_count INTEGER DEFAULT 0,
  template_used TEXT,

  -- Timestamps
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_prospects_status ON prospects(status);
CREATE INDEX IF NOT EXISTS idx_prospects_score ON prospects(quality_score DESC);
CREATE INDEX IF NOT EXISTS idx_prospects_campaign ON prospects(campaign_id);
CREATE INDEX IF NOT EXISTS idx_prospects_niche ON prospects(niche_id);
CREATE INDEX IF NOT EXISTS idx_prospects_place_id ON prospects(google_place_id);

-- Email Templates
CREATE TABLE IF NOT EXISTS email_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,                     -- "No Website Pitch"
  category TEXT NOT NULL,                 -- "no_website", "outdated", "missing_features", "slow", "general"
  subject TEXT NOT NULL,                  -- "{{business_name}} — Quick question about your online presence"
  body_html TEXT NOT NULL,                -- Full HTML with {{placeholders}}
  body_text TEXT NOT NULL,                -- Plain text fallback
  placeholders TEXT NOT NULL,             -- JSON array of placeholder names used
  usage_count INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Email Log
CREATE TABLE IF NOT EXISTS email_log (
  id TEXT PRIMARY KEY,
  prospect_id TEXT NOT NULL REFERENCES prospects(id),
  template_id TEXT REFERENCES email_templates(id),
  to_address TEXT NOT NULL,
  subject TEXT NOT NULL,
  body_preview TEXT,
  sent_at TEXT DEFAULT (datetime('now')),
  status TEXT DEFAULT 'sent',             -- sent, failed
  error_message TEXT,
  resend_id TEXT                          -- Resend API message ID
);

CREATE INDEX IF NOT EXISTS idx_email_log_prospect ON email_log(prospect_id);

-- Settings
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO settings (key, value) VALUES
  ('sending_email', 'hello@cloudgenz.com'),
  ('reply_to_email', 'contact@cloudgenz.com'),
  ('sending_domain', 'cloudgenz.com'),
  ('portfolio_link', 'https://cloudgenz.com/portfolio'),
  ('company_name', 'CloudGenZ'),
  ('company_phone', ''),
  ('company_address', ''),
  ('resend_api_key', ''),
  ('google_api_key', '');
```

---

## Step 3: 50 Niche Categories

Seed data in `seed-niches.sql`. Categories grouped by sector:

### Home Services (12)
1. plumber — Plumber
2. electrician — Electrician
3. hvac — HVAC / Heating & Cooling
4. roofer — Roofer
5. landscaper — Landscaper / Lawn Care
6. painter — House Painter
7. pest_control — Pest Control
8. cleaning — Cleaning Service
9. handyman — Handyman
10. garage_door — Garage Door Repair
11. fence — Fence Installer
12. concrete — Concrete / Paving

### Healthcare & Wellness (8)
13. dentist — Dentist
14. chiropractor — Chiropractor
15. physical_therapist — Physical Therapist
16. optometrist — Optometrist
17. med_spa — Medical Spa / Aesthetics
18. mental_health — Therapist / Counselor
19. veterinarian — Veterinarian
20. urgent_care — Urgent Care Clinic

### Beauty & Personal Care (5)
21. hair_salon — Hair Salon
22. barber — Barber Shop
23. nail_salon — Nail Salon
24. spa — Day Spa / Massage
25. tattoo — Tattoo & Piercing Studio

### Automotive (4)
26. auto_mechanic — Auto Repair / Mechanic
27. auto_body — Auto Body / Collision Repair
28. auto_detailing — Auto Detailing
29. tire_shop — Tire Shop

### Food & Beverage (5)
30. restaurant — Restaurant
31. cafe — Café / Coffee Shop
32. bakery — Bakery
33. food_truck — Food Truck
34. catering — Catering Service

### Fitness & Recreation (4)
35. personal_trainer — Personal Trainer / Gym
36. yoga — Yoga / Pilates Studio
37. martial_arts — Martial Arts School
38. dance — Dance Studio

### Professional Services (6)
39. accountant — Accountant / Tax Prep
40. insurance — Insurance Agency
41. financial_advisor — Financial Advisor
42. real_estate — Real Estate Agent
43. photographer — Photographer / Videographer
44. notary — Notary / Legal Document Prep

### Pet Services (3)
45. pet_groomer — Pet Groomer
46. dog_trainer — Dog Trainer
47. pet_boarding — Pet Boarding / Daycare

### Education & Childcare (2)
48. daycare — Daycare / Preschool
49. tutoring — Tutoring / Learning Center

### Construction & Trade (1)
50. general_contractor — General Contractor

Each niche has `search_terms` (JSON array of Google Maps search queries) and `typical_features` (JSON array of website features a good business in this niche should have — used for scoring "missing features").

---

## Step 4: Scoring Algorithm

Score each prospect 0-100 based on signals from Google Maps + PageSpeed:

```typescript
function scoreProspect(prospect: ProspectData): { score: number; breakdown: Record<string, number> } {
  const b: Record<string, number> = {};

  // === POSITIVE SIGNALS ===

  // No website = highest priority (they NEED one)
  if (!prospect.website_url) b.no_website = 30;

  // Has website but it's bad
  if (prospect.website_url) {
    if (prospect.pagespeed_mobile !== null && prospect.pagespeed_mobile < 50) b.poor_mobile = 15;
    if (prospect.pagespeed_mobile !== null && prospect.pagespeed_mobile < 30) b.very_slow = 10;
    if (!prospect.is_mobile_friendly) b.not_mobile_friendly = 10;
  }

  // Good business signals (worth pitching to)
  if (prospect.google_rating && prospect.google_rating >= 4.0) b.high_rating = 10;
  if (prospect.google_review_count && prospect.google_review_count >= 10) b.active_reviews = 5;
  if (prospect.google_review_count && prospect.google_review_count < 50) b.not_too_big = 5;

  // Contact availability
  if (prospect.email) b.has_email = 10;

  // Small/local business signals
  if (prospect.google_review_count && prospect.google_review_count < 200) b.local_business = 5;

  // === NEGATIVE SIGNALS ===

  // No email = can't contact (for email outreach)
  if (!prospect.email) b.no_email = -15;

  // Too many reviews = probably big/franchise
  if (prospect.google_review_count && prospect.google_review_count > 500) b.likely_chain = -15;

  // Low rating = struggling business (less likely to pay)
  if (prospect.google_rating && prospect.google_rating < 3.0) b.low_rating = -10;

  // Compute total, clamp 0-100
  const score = Math.max(0, Math.min(100, Object.values(b).reduce((a, c) => a + c, 0)));
  return { score, breakdown: b };
}
```

### PageSpeed check (optional, free API)

After discovery, optionally call Google PageSpeed Insights API for prospects with websites:
```
GET https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url={url}&strategy=mobile&key={key}
```

This is free (25K requests/day) and gives mobile score + is_mobile_friendly without Puppeteer.

---

## Step 5: Pre-seeded Email Templates

`seed-templates.sql` — 6 templates with `{{placeholder}}` variables:

### Template 1: No Website
**Name:** No Website — Friendly Intro
**Category:** no_website
**Subject:** `Quick question for {{business_name}}`
**Body:**
```
Hi {{owner_name}},

I came across {{business_name}} while looking for {{niche}} services in {{city}} and noticed you don't have a website yet.

These days, most people search online before calling — even for local services. A simple, professional website could help you:

• Show up when people search "{{niche}} near me" in {{city}}
• Let customers see your services, hours, and reviews
• Get quote requests and calls directly from your site

I build websites specifically for {{niche}} businesses and have a few examples I'd love to show you: {{portfolio_link}}

Would you be open to a quick 5-minute chat this week?

Best,
{{sender_name}}
{{company_name}}
{{sender_email}}
```

### Template 2: Outdated Website
**Name:** Website Refresh — Friendly Pitch
**Category:** outdated
**Subject:** `I took a look at {{business_name}}'s website`
**Body:**
```
Hi {{owner_name}},

I found {{business_name}} while researching {{niche}} businesses in {{city}} and took a look at your website at {{website_url}}.

You clearly run a great business — {{google_rating}} stars with {{review_count}} reviews speaks for itself. But I noticed your website might not be doing you justice:

• It may not look great on phones (where most local searches happen)
• Page load speed could be improved
• Some features that customers expect might be missing

I specialize in building modern, fast websites for {{niche}} businesses. Here's an example of what a refresh could look like: {{portfolio_link}}

Would it be worth a quick call to discuss? No pressure at all.

Best,
{{sender_name}}
{{company_name}}
{{sender_email}}
```

### Template 3: Missing Features
**Name:** Missing Features — Helpful Suggestion
**Category:** missing_features
**Subject:** `A quick idea for {{business_name}}`
**Body:**
```
Hi {{owner_name}},

I've been researching {{niche}} businesses in {{city}} and came across {{business_name}}. Your website looks good, but I noticed a few features that could help you get more customers:

• Online booking / quote request form
• Mobile-optimized layout
• Customer reviews section
• Service area information

These are features that top-performing {{niche}} websites in {{city}} use to convert visitors into calls and bookings.

I've built sites with all these features for other {{niche}} businesses — happy to show you some examples: {{portfolio_link}}

Worth a quick chat?

Best,
{{sender_name}}
{{company_name}}
{{sender_email}}
```

### Template 4: Slow Website
**Name:** Slow Website — Speed Fix
**Category:** slow
**Subject:** `{{business_name}} website speed tip`
**Body:**
```
Hi {{owner_name}},

I ran a quick speed test on {{website_url}} and it scored {{pagespeed_score}}/100 on mobile. That means a lot of potential customers are probably leaving before the page even loads.

Google says 53% of mobile users leave a site that takes more than 3 seconds to load. For a {{niche}} business in {{city}}, that could mean missed calls every day.

I build fast, mobile-first websites specifically for {{niche}} businesses. Here's an example: {{portfolio_link}}

Would you be interested in seeing what a faster version of your site could look like?

Best,
{{sender_name}}
{{company_name}}
{{sender_email}}
```

### Template 5: No Online Presence
**Name:** New Business Welcome
**Category:** no_presence
**Subject:** `Congrats on {{business_name}}!`
**Body:**
```
Hi {{owner_name}},

I noticed {{business_name}} is relatively new in {{city}} — congratulations on getting started!

Getting your first customers is the hardest part, and a professional website can make a big difference. Even a simple one-page site helps you:

• Show up in Google searches for "{{niche}} in {{city}}"
• Look professional and trustworthy to new customers
• Give people an easy way to contact you

I build affordable websites for local {{niche}} businesses. Here are some examples: {{portfolio_link}}

I'd love to help you get set up. Would a quick call work this week?

Best,
{{sender_name}}
{{company_name}}
{{sender_email}}
```

### Template 6: General Introduction
**Name:** General — Cold Intro
**Category:** general
**Subject:** `Website question for {{business_name}}`
**Body:**
```
Hi {{owner_name}},

I'm reaching out to {{niche}} businesses in {{city}} that might benefit from a stronger online presence.

I noticed {{business_name}} and thought I could help you attract more customers with a modern, professional website designed specifically for {{niche}} businesses.

Here's an example of my work: {{portfolio_link}}

If you're interested, I'd be happy to hop on a quick call to discuss. No obligation.

Best,
{{sender_name}}
{{company_name}}
{{sender_email}}
```

### Available placeholders
All templates can use:
- `{{business_name}}` — from Google Maps
- `{{owner_name}}` — extracted or "there" fallback
- `{{city}}`, `{{state}}` — from address
- `{{niche}}` — niche display name (lowercase)
- `{{phone}}` — prospect phone
- `{{website_url}}` — prospect's current website
- `{{google_rating}}` — e.g. "4.7"
- `{{review_count}}` — e.g. "43"
- `{{pagespeed_score}}` — mobile PageSpeed score
- `{{portfolio_link}}` — from Settings (your sample site URL)
- `{{sender_name}}` — from Settings
- `{{sender_email}}` — from Settings
- `{{company_name}}` — from Settings

---

## Step 6: API Endpoints

All endpoints are Cloudflare Pages Functions under `functions/api/`.

### Auth
- `POST /api/auth/login` — password check, set cookie
- `POST /api/auth/logout` — clear cookie
- `GET /api/auth/me` — check session

### Discovery
- `POST /api/discover` — `{ campaign_id }` → Runs Google Maps Places API search, scores results, inserts to D1. Returns count.
  - Internally: Reads campaign's niche + location + count. Calls Places API (Text Search). For each result, extracts business data, checks dedup (google_place_id), scores, inserts.
  - PageSpeed check: Optional secondary pass. For prospects with websites, call PageSpeed API. Update scores.
  - Rate limit: Google API has daily quota. Track in settings.

### Prospects
- `GET /api/prospects` — List with filters: `?status=new&niche_id=plumber&min_score=50&campaign_id=xxx&page=1&limit=50&sort=quality_score`
- `GET /api/prospects/:id` — Single prospect with full details
- `PATCH /api/prospects/:id` — Update status, notes, etc.
- `DELETE /api/prospects/:id` — Remove
- `POST /api/prospects/bulk` — `{ ids: [], action: 'skip' | 'delete' }` — Bulk actions

### Campaigns
- `GET /api/campaigns` — List all
- `POST /api/campaigns` — Create `{ name, niche_id, location, country, radius_km, requested_count }`
- `GET /api/campaigns/:id` — Details with stats
- `DELETE /api/campaigns/:id` — Remove

### Templates
- `GET /api/templates` — List all
- `POST /api/templates` — Create new
- `GET /api/templates/:id` — Single template
- `PUT /api/templates/:id` — Update
- `DELETE /api/templates/:id` — Remove

### Send Email
- `POST /api/send-email` — `{ prospect_id, template_id, subject, body_html, body_text }`
  - Calls Resend HTTP API: `POST https://api.resend.com/emails`
  - Logs to email_log table
  - Updates prospect: status → 'contacted', last_emailed_at, email_count++

### Settings
- `GET /api/settings` — All settings
- `PUT /api/settings` — `{ key, value }` or `{ settings: { key: value, ... } }`

### Stats
- `GET /api/stats` — Dashboard metrics:
  - Total prospects by status
  - Total campaigns
  - Emails sent today/this week/this month
  - Top niches by prospect count
  - Average quality score

---

## Step 7: Pages / UI

### Dashboard (`/`)
- Stats cards: total prospects, contacted, replied, conversion rate
- Emails sent this week chart (simple bar)
- Recent campaigns list
- Quick actions: "New Campaign", "View Prospects"

### Campaigns (`/campaigns`)
- Table: name, niche, location, discovered count, date
- "New Campaign" button → modal:
  - Select niche (dropdown, 50 options grouped by category)
  - Location (text input: "Austin, TX" or "M5V 3A8")
  - Country (US/CA dropdown)
  - Count (slider or input: 10-100)
  - "Start Discovery" button → calls POST /api/discover
  - Show progress: "Discovering... 23/50 found"

### Prospects (`/prospects`)
- Table: name, city, score, has website, email, status, last emailed
- Filters: status dropdown, niche dropdown, min score slider, campaign filter
- Sort by: score (default), name, date
- Row actions: "Compose Email", "Skip", "View Details"
- Bulk select + bulk actions (skip, delete)
- Click row → detail panel (sidebar or modal):
  - All business info
  - Score breakdown (visual)
  - Website link (if any)
  - Email history
  - Notes (editable)

### Compose (`/compose/:prospect_id`)
- Left panel: Prospect details (name, city, email, website, score, niche)
- Right panel:
  1. Template picker (dropdown grouped by category)
  2. On select: auto-fills all `{{placeholders}}` from prospect data + settings
  3. Editable subject line
  4. Rich-text-ish body editor (or simple textarea with preview)
  5. Preview tab: see rendered email
  6. "Send Email" button → calls POST /api/send-email
  7. Success confirmation with "Back to Prospects" link

### Templates (`/templates`)
- List: name, category, subject preview, usage count, last edited
- "New Template" button
- Click to edit:
  - Name, category (dropdown)
  - Subject (text input)
  - Body HTML (textarea with monospace font, or simple rich editor)
  - Body Text (auto-generated from HTML or editable)
  - Placeholder insertion buttons: click "{{business_name}}" to insert at cursor
  - Live preview panel showing rendered template with sample data
  - Save / Delete buttons
- "Duplicate" action per template

### Settings (`/settings`)
- Sending email, reply-to email, sending domain
- Company name, phone, address (for email footer)
- Portfolio link (your sample site URL)
- Resend API key (masked input)
- Google Maps API key (masked input)
- Admin password change

### Login (`/login`)
- Simple password input
- Cookie-based session

---

## Step 8: Google Maps Discovery (Places API)

Use Google Maps Places API (New) — Text Search:

```
POST https://places.googleapis.com/v1/places:searchText
Headers:
  Content-Type: application/json
  X-Goog-Api-Key: {key}
  X-Goog-FieldMask: places.id,places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.websiteUri,places.rating,places.userRatingCount,places.types,places.addressComponents

Body:
{
  "textQuery": "plumber in Austin, TX",
  "maxResultCount": 20,
  "languageCode": "en"
}
```

Pagination: Use `pageToken` from response to fetch more results.

For each result, extract:
- business_name ← displayName.text
- phone ← nationalPhoneNumber
- website_url ← websiteUri
- address, city, state, postal_code ← addressComponents
- google_place_id ← id (for dedup)
- google_rating ← rating
- google_review_count ← userRatingCount
- google_types ← types (JSON array)
- niche_id ← from campaign
- has_website ← !!websiteUri

Email extraction: NOT from Google Maps (ToS). Email field stays null unless manually added or scraped separately later.

Owner name: Not available from Places API. Stays null or "Business Owner" as fallback.

---

## Step 9: Resend Email Integration

```typescript
async function sendEmail(params: {
  to: string;
  from: string;
  replyTo: string;
  subject: string;
  html: string;
  text: string;
}): Promise<{ id: string }> {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: params.from,
      to: [params.to],
      reply_to: params.replyTo,
      subject: params.subject,
      html: params.html,
      text: params.text,
    }),
  });

  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Resend API error: ${res.status} ${error}`);
  }

  return res.json();
}
```

Resend free tier: 100 emails/day, 3000/month. Requires domain verification (add DNS records for cloudgenz.com).

### Later: Self-hosted SMTP bridge

When you want to switch to Purelymail SMTP, deploy a small Express service on VPS:

```
POST https://your-vps.com/api/send-email
→ Accepts same JSON body
→ Sends via nodemailer + Purelymail SMTP
→ Returns { id: messageId }
```

The app just changes one URL in settings — no code changes needed.

---

## Step 10: Build Order

1. **Project setup** — package.json, vite config, tailwind, wrangler.toml, tsconfig
2. **Schema + seeds** — schema.sql, seed-niches.sql (50 niches), seed-templates.sql (6 templates)
3. **Shared types** — types.ts
4. **API functions** — auth → settings → niches → campaigns → discover → prospects → templates → send-email → stats
5. **Frontend shell** — Layout, routing, Login page
6. **Dashboard page** — stats cards + recent activity
7. **Campaigns page** — create campaign + trigger discovery
8. **Prospects page** — table with filters + detail panel
9. **Templates page** — CRUD + placeholder insertion + preview
10. **Compose page** — template picker + auto-fill + preview + send
11. **Settings page** — all configurable values
12. **Deploy** — `npm run deploy`

---

## Design Style

Same as your other projects — Tailwind CSS with clean, modern look:
- White cards on light gray background
- Blue accent (#2563eb) for primary actions
- Clean tables with hover states
- Responsive (mobile-friendly dashboard)
- Simple, functional — not flashy

---

## What's NOT included (intentionally)

- No AI anything
- No Puppeteer / screenshots
- No automated email sending (all manual)
- No tracking pixels or click tracking
- No follow-up automation
- No website generation
- No R2 storage
- No worker daemon
- No warm-up ramp logic
- No SMS (added later)
- No multi-user auth (single admin)

---

## Migration from v1

1. Wipe D1 database: `npm run db:reset`
2. Delete all R2 objects (no longer needed)
3. Old `packages/` directory: deleted entirely
4. Git: commit as "v2: simplified discovery + manual outreach"
5. Existing prospects in D1: lost (acceptable — fresh start)

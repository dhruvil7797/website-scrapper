-- Client Scraper Pipeline - Cloudflare D1 Schema
-- Run with: wrangler d1 execute client-scraper --file=./schema.sql

-- ============================================================
-- NICHES (pre-loaded categories)
-- ============================================================
CREATE TABLE IF NOT EXISTS niches (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,                    -- "Plumber", "Dentist", etc.
  search_terms TEXT NOT NULL,            -- JSON array: ["plumber", "plumbing service", "plumbing repair"]
  features TEXT NOT NULL,                -- JSON array: ["Online booking", "Emergency contact button", ...]
  ui_guidance TEXT,                       -- AI prompt snippet for this niche's design style
  color_palette TEXT,                     -- Suggested colors JSON: {"primary": "#2563eb", "accent": "#..."}
  inspiration_folder TEXT,               -- R2 path: "inspiration/plumber/"
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- ============================================================
-- CAMPAIGNS (discovery configurations)
-- ============================================================
CREATE TABLE IF NOT EXISTS campaigns (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,                    -- "Austin Plumbers Q3"
  niche_id TEXT NOT NULL REFERENCES niches(id),
  postal_codes TEXT NOT NULL,            -- JSON array: ["78701", "78702", "T2P 1J9"]
  country TEXT DEFAULT 'US',             -- US, CA, etc.
  radius_km INTEGER DEFAULT 40,
  daily_limit INTEGER DEFAULT 50,
  status TEXT DEFAULT 'active',          -- active, paused, completed
  total_discovered INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- ============================================================
-- PROSPECTS (main pipeline table)
-- ============================================================
CREATE TABLE IF NOT EXISTS prospects (
  id TEXT PRIMARY KEY,
  
  -- Business info
  business_name TEXT NOT NULL,
  phone_raw TEXT,                         -- Original format: "(512) 555-1234"
  phone_normalized TEXT,                  -- Digits only: "5125551234"
  email TEXT,
  email_type TEXT,                        -- 'custom_domain', 'free_provider', 'none'
  website_url TEXT,
  address TEXT,
  city TEXT,
  state_province TEXT,
  postal_code TEXT,
  country TEXT DEFAULT 'US',
  timezone TEXT,                          -- IANA timezone: "America/Chicago"
  
  -- Discovery metadata
  campaign_id TEXT REFERENCES campaigns(id),
  niche_id TEXT REFERENCES niches(id),
  source TEXT,                            -- 'google_maps', 'yelp', 'manual'
  source_data TEXT,                       -- JSON: raw API response snippets
  google_rating REAL,
  google_review_count INTEGER,
  business_age_months INTEGER,
  owner_name TEXT,
  
  -- Scoring
  quality_score INTEGER DEFAULT 0,        -- 0-100 composite score
  score_breakdown TEXT,                   -- JSON: {"no_website": 30, "free_email": 10, ...}
  has_website INTEGER DEFAULT 0,          -- boolean
  pagespeed_mobile INTEGER,              -- 0-100
  pagespeed_desktop INTEGER,             -- 0-100
  
  -- Pipeline stage
  stage TEXT DEFAULT 'discovered',
  -- Stages: discovered → scraped → generated → qa_passed → pending_approval → approved → scheduled → emailed → follow_up_due → follow_up_sent → completed
  -- Manual approval gate: after qa_passed, site + email draft are staged for human review
  
  -- Draft email (prepared but not sent until approved)
  draft_email_subject TEXT,
  draft_email_body_html TEXT,
  draft_email_body_text TEXT,
  approval_status TEXT,                  -- 'pending', 'approved', 'changes_requested', 'rejected'
  approval_comment TEXT,                 -- reviewer feedback for changes
  approved_at TEXT,
  scheduled_send_at TEXT,                -- when the email should actually be sent (next day optimal time)
  
  -- Processing metadata
  retry_count INTEGER DEFAULT 0,
  last_error TEXT,
  locked_until TEXT,                      -- ISO timestamp - prevents double-processing
  locked_by TEXT,                         -- Worker instance ID
  
  -- Screenshots & generated content
  screenshot_key TEXT,                    -- R2 key for original site screenshot
  generated_site_key TEXT,               -- R2 key for generated HTML
  generated_site_url TEXT,               -- Public URL: /portfolio/{slug}
  portfolio_slug TEXT UNIQUE,
  qa_score REAL,                         -- 0.0 - 1.0 confidence
  qa_feedback TEXT,                      -- AI QA notes
  
  -- Email tracking
  email_sent_at TEXT,
  email_subject TEXT,
  email_template TEXT,                   -- 'no_website' or 'redesign'
  
  -- Follow-up
  follow_up_due_at TEXT,
  follow_up_approved INTEGER DEFAULT 0,
  follow_up_sent_at TEXT,
  
  -- Tracking
  first_opened_at TEXT,
  last_opened_at TEXT,
  open_count INTEGER DEFAULT 0,
  first_clicked_at TEXT,
  last_clicked_at TEXT,
  click_count INTEGER DEFAULT 0,
  replied INTEGER DEFAULT 0,
  reply_notes TEXT,
  
  -- Timestamps
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  
  -- Deduplication
  UNIQUE(phone_normalized, city)
);

-- Indexes for stage-based queries (worker picks)
CREATE INDEX IF NOT EXISTS idx_prospects_stage ON prospects(stage);
CREATE INDEX IF NOT EXISTS idx_prospects_stage_score ON prospects(stage, quality_score DESC);
CREATE INDEX IF NOT EXISTS idx_prospects_campaign ON prospects(campaign_id);
CREATE INDEX IF NOT EXISTS idx_prospects_niche ON prospects(niche_id);
CREATE INDEX IF NOT EXISTS idx_prospects_phone_city ON prospects(phone_normalized, city);
CREATE INDEX IF NOT EXISTS idx_prospects_portfolio_slug ON prospects(portfolio_slug);

-- ============================================================
-- TRACKING EVENTS (pixel loads + link clicks)
-- ============================================================
CREATE TABLE IF NOT EXISTS tracking_events (
  id TEXT PRIMARY KEY,
  prospect_id TEXT NOT NULL REFERENCES prospects(id),
  event_type TEXT NOT NULL,              -- 'open', 'click'
  timestamp TEXT DEFAULT (datetime('now')),
  ip_address TEXT,
  user_agent TEXT
);

CREATE INDEX IF NOT EXISTS idx_tracking_prospect ON tracking_events(prospect_id);

-- ============================================================
-- EMAIL LOG (detailed send history)
-- ============================================================
CREATE TABLE IF NOT EXISTS email_log (
  id TEXT PRIMARY KEY,
  prospect_id TEXT NOT NULL REFERENCES prospects(id),
  email_type TEXT NOT NULL,              -- 'initial', 'follow_up'
  to_address TEXT NOT NULL,
  subject TEXT NOT NULL,
  body_preview TEXT,                     -- First 200 chars
  sent_at TEXT DEFAULT (datetime('now')),
  status TEXT DEFAULT 'sent',            -- sent, bounced, failed
  bounce_reason TEXT,
  message_id TEXT                        -- SMTP message-id for threading
);

CREATE INDEX IF NOT EXISTS idx_email_prospect ON email_log(prospect_id);
CREATE INDEX IF NOT EXISTS idx_email_status ON email_log(status);

-- ============================================================
-- SETTINGS (runtime configuration)
-- ============================================================
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Default settings
INSERT OR IGNORE INTO settings (key, value) VALUES
  ('ramp_level', '0'),                           -- Index into ramp array
  ('ramp_steps', '[10, 25, 50, 100, 200, 300]'),
  ('ramp_days_per_step', '3'),
  ('ramp_last_step_date', ''),
  ('bounce_rate_threshold', '0.05'),
  ('bounce_rate_pause_threshold', '0.05'),
  ('qa_confidence_threshold', '0.85'),
  ('scraper_delay_ms', '4000'),
  ('discovery_cache_days', '7'),
  ('follow_up_delay_days', '4'),
  ('email_morning_weight', '0.40'),
  ('email_midday_weight', '0.35'),
  ('email_afternoon_weight', '0.25'),
  ('worker_concurrency', '3'),
  ('purelymail_daily_limit', '500');

-- ============================================================
-- INSPIRATION LIBRARY METADATA
-- ============================================================
CREATE TABLE IF NOT EXISTS inspiration_sites (
  id TEXT PRIMARY KEY,
  niche_id TEXT NOT NULL REFERENCES niches(id),
  url TEXT NOT NULL,
  screenshot_key TEXT,                   -- R2 path
  last_refreshed_at TEXT,
  quality_notes TEXT,                    -- Why this site is good inspiration
  created_at TEXT DEFAULT (datetime('now'))
);

-- ============================================================
-- SEED DATA: Niche Categories
-- ============================================================
INSERT OR IGNORE INTO niches (id, name, search_terms, features, ui_guidance, color_palette) VALUES
  ('plumber', 'Plumber', '["plumber", "plumbing service", "plumbing repair", "emergency plumber"]',
   '["Emergency contact button", "Service areas map", "Instant quote form", "24/7 availability banner", "License & insurance badges", "Before/after gallery"]',
   'Use blue/industrial tones. Hero should emphasize trust and emergency availability. Include prominent phone number.',
   '{"primary": "#1e40af", "accent": "#f59e0b"}'),
  
  ('electrician', 'Electrician', '["electrician", "electrical service", "electrical repair", "emergency electrician"]',
   '["Emergency banner", "Service areas", "License/insurance badges", "Safety certifications", "Free estimate form", "24/7 availability"]',
   'Professional blues and yellows. Emphasize safety certifications and licensing. Large contact CTA.',
   '{"primary": "#1d4ed8", "accent": "#eab308"}'),
  
  ('roofer', 'Roofer', '["roofer", "roofing contractor", "roof repair", "roof replacement"]',
   '["Before/after gallery", "Free estimate form", "Financing options", "Certifications display", "Storm damage section", "Material options showcase"]',
   'Bold, strong imagery. Dark backgrounds with high contrast CTAs. Show completed projects prominently.',
   '{"primary": "#374151", "accent": "#dc2626"}'),
  
  ('hvac', 'HVAC', '["hvac", "heating and cooling", "air conditioning repair", "furnace repair"]',
   '["Seasonal specials banner", "Maintenance plan signup", "Emergency 24/7 banner", "Energy efficiency calculator", "Brand certifications", "Service area map"]',
   'Clean, professional. Blue/cool tones for AC, warm tones for heating. Seasonal promotions prominent.',
   '{"primary": "#0891b2", "accent": "#f97316"}'),
  
  ('landscaper', 'Landscaper', '["landscaper", "lawn care", "landscaping service", "lawn mowing"]',
   '["Project gallery", "Seasonal service packages", "Instant quote calculator", "Before/after slider", "Service area map", "Maintenance plans"]',
   'Green-focused, natural imagery. Large photo gallery. Show transformations. Clean, organic feel.',
   '{"primary": "#166534", "accent": "#a3e635"}'),
  
  ('dentist', 'Dentist', '["dentist", "dental clinic", "family dentist", "cosmetic dentist"]',
   '["Online booking", "Insurance accepted list", "Patient portal", "Virtual tour", "Team bios", "New patient specials", "Emergency dental care"]',
   'Clean whites, light blues. Trust-focused with team photos. Modern, calming. Prominent booking CTA.',
   '{"primary": "#0ea5e9", "accent": "#14b8a6"}'),
  
  ('barber', 'Barber / Salon', '["barber", "barbershop", "hair salon", "mens haircut"]',
   '["Online booking", "Service menu with pricing", "Photo gallery", "Reviews showcase", "Team/stylist profiles", "Loyalty program"]',
   'Modern, edgy for barbers. Elegant for salons. Dark theme with gold accents works well. Gallery-heavy.',
   '{"primary": "#1f2937", "accent": "#d97706"}'),
  
  ('auto_mechanic', 'Auto Mechanic', '["auto mechanic", "car repair", "auto body shop", "oil change"]',
   '["Service menu", "Online appointment booking", "Vehicle drop-off form", "Certifications (ASE)", "Customer reviews", "Warranty information"]',
   'Industrial, trustworthy. Red/blue tones. Emphasize certifications and warranty. Easy appointment booking.',
   '{"primary": "#1e3a5f", "accent": "#dc2626"}'),
  
  ('painter', 'Painter', '["house painter", "painting contractor", "interior painting", "exterior painting"]',
   '["Color visualizer tool", "Project gallery", "Free estimate form", "Before/after showcase", "Paint brand partnerships", "Service areas"]',
   'Clean, colorful accents on white. Show color transformations. Before/after heavy. Professional portfolio style.',
   '{"primary": "#4338ca", "accent": "#f472b6"}'),
  
  ('restaurant', 'Restaurant', '["restaurant", "cafe", "diner", "food"]',
   '["Online menu", "Ordering/delivery integration", "Reservation system", "Hours & location", "Photo gallery", "Catering info", "Gift cards"]',
   'Warm, appetizing colors. Large food photography. Easy-to-read menu. Mobile-first for on-the-go ordering.',
   '{"primary": "#9a3412", "accent": "#fbbf24"}'),
  
  ('vet', 'Veterinarian', '["veterinarian", "vet clinic", "animal hospital", "pet care"]',
   '["Pet portal", "Appointment booking", "Emergency info", "Team bios", "Services list", "New pet owner resources", "Pet pharmacy"]',
   'Warm, friendly. Greens and soft blues. Animal imagery. Calming, trustworthy. Prominent emergency number.',
   '{"primary": "#166534", "accent": "#f59e0b"}'),
  
  ('fitness', 'Fitness / Personal Trainer', '["personal trainer", "gym", "fitness studio", "crossfit"]',
   '["Class schedule", "Membership plans", "Free trial signup", "Trainer bios", "Transformation gallery", "Online booking"]',
   'Energetic, bold. Dark backgrounds with vibrant accents. Action imagery. Strong CTAs for trial signup.',
   '{"primary": "#18181b", "accent": "#ef4444"}'),
  
  ('cleaning', 'Cleaning Service', '["cleaning service", "house cleaning", "maid service", "janitorial"]',
   '["Instant quote calculator", "Service packages", "Booking calendar", "Trust badges", "Eco-friendly options", "Service areas"]',
   'Fresh, clean. Light blues and whites. Trust signals prominent. Easy quote/booking flow.',
   '{"primary": "#0284c7", "accent": "#10b981"}'),
  
  ('pest_control', 'Pest Control', '["pest control", "exterminator", "termite treatment", "bug spray"]',
   '["Emergency service", "Free inspection form", "Pest identification guide", "Treatment plans", "Guarantee badge", "Service areas"]',
   'Professional, reassuring. Greens for eco-friendly or bold reds for urgency. Trust badges important.',
   '{"primary": "#065f46", "accent": "#dc2626"}'),
  
  ('concrete', 'Concrete / Paving', '["concrete contractor", "paving", "driveway", "foundation repair"]',
   '["Project gallery", "Free estimate form", "Service types showcase", "Process explanation", "Certifications", "Service areas"]',
   'Industrial, strong. Grays with bold accent. Large project photos. Before/after emphasis.',
   '{"primary": "#374151", "accent": "#f59e0b"}'),
  
  ('fence', 'Fence Installer', '["fence installer", "fencing contractor", "fence repair", "fence company"]',
   '["Material options gallery", "Free estimate form", "Project showcase", "Financing options", "Service areas", "Style comparison tool"]',
   'Outdoor, natural. Wood tones or modern blacks. Gallery showcasing different styles. Clean layout.',
   '{"primary": "#44403c", "accent": "#65a30d"}');

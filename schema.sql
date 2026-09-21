-- Client Scraper V2 — D1 Schema

DROP TABLE IF EXISTS email_log;
DROP TABLE IF EXISTS prospects;
DROP TABLE IF EXISTS campaigns;
DROP TABLE IF EXISTS email_templates;
DROP TABLE IF EXISTS niches;
DROP TABLE IF EXISTS settings;

-- Niches (50 pre-loaded categories)
CREATE TABLE niches (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  search_terms TEXT NOT NULL,
  typical_features TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Campaigns (discovery runs)
CREATE TABLE campaigns (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  niche_id TEXT NOT NULL REFERENCES niches(id),
  location TEXT NOT NULL,
  country TEXT DEFAULT 'US',
  radius_km INTEGER DEFAULT 40,
  requested_count INTEGER DEFAULT 50,
  discovered_count INTEGER DEFAULT 0,
  status TEXT DEFAULT 'pending',
  created_at TEXT DEFAULT (datetime('now'))
);

-- Prospects
CREATE TABLE prospects (
  id TEXT PRIMARY KEY,
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
  campaign_id TEXT REFERENCES campaigns(id),
  niche_id TEXT REFERENCES niches(id),
  google_place_id TEXT UNIQUE,
  google_rating REAL,
  google_review_count INTEGER,
  google_types TEXT,
  quality_score INTEGER DEFAULT 0,
  score_breakdown TEXT,
  has_website INTEGER DEFAULT 0,
  pagespeed_mobile INTEGER,
  pagespeed_desktop INTEGER,
  is_mobile_friendly INTEGER,
  pagespeed_data TEXT,
  status TEXT DEFAULT 'new',
  notes TEXT,
  last_emailed_at TEXT,
  email_count INTEGER DEFAULT 0,
  template_used TEXT,
  sms_sent_at TEXT,
  sms_count INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_prospects_status ON prospects(status);
CREATE INDEX idx_prospects_score ON prospects(quality_score DESC);
CREATE INDEX idx_prospects_campaign ON prospects(campaign_id);
CREATE INDEX idx_prospects_niche ON prospects(niche_id);
CREATE INDEX idx_prospects_place_id ON prospects(google_place_id);

-- Email Templates
CREATE TABLE email_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  subject TEXT NOT NULL,
  body_html TEXT NOT NULL,
  body_text TEXT NOT NULL,
  placeholders TEXT NOT NULL,
  usage_count INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Email Log
CREATE TABLE email_log (
  id TEXT PRIMARY KEY,
  prospect_id TEXT NOT NULL REFERENCES prospects(id),
  template_id TEXT REFERENCES email_templates(id),
  to_address TEXT NOT NULL,
  subject TEXT NOT NULL,
  body_preview TEXT,
  body_html TEXT,
  body_text TEXT,
  sent_at TEXT DEFAULT (datetime('now')),
  status TEXT DEFAULT 'sent',
  error_message TEXT,
  resend_id TEXT
);

CREATE INDEX idx_email_log_prospect ON email_log(prospect_id);

-- SMS Log
CREATE TABLE sms_log (
  id TEXT PRIMARY KEY,
  prospect_id TEXT NOT NULL REFERENCES prospects(id),
  template_id TEXT,
  to_phone TEXT NOT NULL,
  from_phone TEXT NOT NULL,
  body TEXT NOT NULL,
  sent_at TEXT DEFAULT (datetime('now')),
  status TEXT DEFAULT 'sent',
  error_message TEXT,
  twilio_sid TEXT
);

CREATE INDEX idx_sms_log_prospect ON sms_log(prospect_id);

-- Settings
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT DEFAULT (datetime('now'))
);

INSERT INTO settings (key, value) VALUES
  ('sending_email', 'hello@cloudgenz.com'),
  ('reply_to_email', 'contact@cloudgenz.com'),
  ('sending_domain', 'cloudgenz.com'),
  ('portfolio_link', 'https://cloudgenz.com/portfolio'),
  ('company_name', 'CloudGenZ'),
  ('sender_name', 'Dhruvil'),
  ('company_phone', ''),
  ('company_address', '');

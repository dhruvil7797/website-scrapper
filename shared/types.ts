// ============================================================
// Client Scraper Pipeline - Shared Types
// ============================================================

export type ProspectStage =
  | 'discovered'
  | 'scraped'
  | 'generated'
  | 'qa_passed'
  | 'qa_failed'
  | 'deployed'
  | 'emailed'
  | 'follow_up_due'
  | 'follow_up_sent'
  | 'replied'
  | 'completed'
  | 'scrape_failed';

export type EmailType = 'custom_domain' | 'free_provider' | 'none';
export type CampaignStatus = 'active' | 'paused' | 'completed';
export type EmailTemplate = 'no_website' | 'redesign';
export type EmailLogStatus = 'sent' | 'bounced' | 'failed';
export type TrackingEventType = 'open' | 'click';

export interface Prospect {
  id: string;
  business_name: string;
  phone_raw: string | null;
  phone_normalized: string | null;
  email: string | null;
  email_type: EmailType;
  website_url: string | null;
  address: string | null;
  city: string | null;
  state_province: string | null;
  postal_code: string | null;
  country: string;
  timezone: string | null;
  campaign_id: string | null;
  niche_id: string | null;
  source: string;
  source_data: string | null;
  google_rating: number | null;
  google_review_count: number | null;
  business_age_months: number | null;
  owner_name: string | null;
  quality_score: number;
  score_breakdown: string | null;
  has_website: number;
  pagespeed_mobile: number | null;
  pagespeed_desktop: number | null;
  stage: ProspectStage;
  retry_count: number;
  last_error: string | null;
  locked_until: string | null;
  locked_by: string | null;
  screenshot_key: string | null;
  generated_site_key: string | null;
  generated_site_url: string | null;
  portfolio_slug: string | null;
  qa_score: number | null;
  qa_feedback: string | null;
  email_sent_at: string | null;
  email_subject: string | null;
  email_template: EmailTemplate | null;
  follow_up_due_at: string | null;
  follow_up_approved: number;
  follow_up_sent_at: string | null;
  first_opened_at: string | null;
  last_opened_at: string | null;
  open_count: number;
  first_clicked_at: string | null;
  last_clicked_at: string | null;
  click_count: number;
  replied: number;
  reply_notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Campaign {
  id: string;
  name: string;
  niche_id: string;
  postal_codes: string; // JSON array
  country: string;
  radius_km: number;
  daily_limit: number;
  status: CampaignStatus;
  total_discovered: number;
  created_at: string;
  updated_at: string;
}

export interface Niche {
  id: string;
  name: string;
  search_terms: string; // JSON array
  features: string; // JSON array
  ui_guidance: string | null;
  color_palette: string | null;
  inspiration_folder: string | null;
  created_at: string;
  updated_at: string;
}

export interface EmailLog {
  id: string;
  prospect_id: string;
  email_type: 'initial' | 'follow_up';
  to_address: string;
  subject: string;
  body_preview: string | null;
  sent_at: string;
  status: EmailLogStatus;
  bounce_reason: string | null;
  message_id: string | null;
}

export interface TrackingEvent {
  id: string;
  prospect_id: string;
  event_type: TrackingEventType;
  timestamp: string;
  ip_address: string | null;
  user_agent: string | null;
}

export interface Settings {
  key: string;
  value: string;
  updated_at: string;
}

export interface InspirationSite {
  id: string;
  niche_id: string;
  url: string;
  screenshot_key: string | null;
  last_refreshed_at: string | null;
  quality_notes: string | null;
  created_at: string;
}

// API Response types
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface PaginatedResponse<T> {
  success: boolean;
  data: T[];
  total: number;
  page: number;
  limit: number;
}

export interface DashboardStats {
  total_prospects: number;
  by_stage: Record<ProspectStage, number>;
  today_emails_sent: number;
  today_opens: number;
  today_clicks: number;
  today_bounces: number;
  ramp_level: number;
  ramp_max: number;
  worker_status: 'running' | 'auth_halted' | 'paused' | 'stopped';
}

export interface QualityScoreBreakdown {
  no_website: number;
  outdated_design: number;
  mobile_unfriendly: number;
  slow_site: number;
  recently_opened: number;
  high_rating: number;
  has_email: number;
  free_email: number;
  custom_domain_email: number;
  low_review_active: number;
  social_media: number;
  no_email: number;
  multiple_locations: number;
  franchise: number;
}

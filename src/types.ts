export type ProspectStatus = 'new' | 'contacted' | 'replied' | 'won' | 'lost' | 'skipped';
export type CampaignStatus = 'pending' | 'running' | 'completed' | 'failed';
export type TemplateCategory = 'no_website' | 'outdated' | 'missing_features' | 'slow' | 'no_presence' | 'general';

export interface Niche {
  id: string;
  name: string;
  category: string;
  search_terms: string;
  typical_features: string | null;
  created_at: string;
}

export interface Campaign {
  id: string;
  name: string;
  niche_id: string;
  location: string;
  country: string;
  radius_km: number;
  requested_count: number;
  discovered_count: number;
  status: CampaignStatus;
  created_at: string;
  niche_name?: string;
}

export interface Prospect {
  id: string;
  business_name: string;
  phone: string | null;
  email: string | null;
  website_url: string | null;
  address: string | null;
  city: string | null;
  state_province: string | null;
  postal_code: string | null;
  country: string;
  owner_name: string | null;
  campaign_id: string | null;
  niche_id: string | null;
  google_place_id: string | null;
  google_rating: number | null;
  google_review_count: number | null;
  google_types: string | null;
  quality_score: number;
  score_breakdown: string | null;
  has_website: number;
  pagespeed_mobile: number | null;
  pagespeed_desktop: number | null;
  is_mobile_friendly: number | null;
  pagespeed_data: string | null;
  status: ProspectStatus;
  notes: string | null;
  last_emailed_at: string | null;
  email_count: number;
  template_used: string | null;
  sms_sent_at: string | null;
  sms_count: number;
  created_at: string;
  updated_at: string;
  niche_name?: string;
}

export interface EmailTemplate {
  id: string;
  name: string;
  category: TemplateCategory;
  subject: string;
  body_html: string;
  body_text: string;
  placeholders: string;
  usage_count: number;
  created_at: string;
  updated_at: string;
}

export interface EmailLogEntry {
  id: string;
  prospect_id: string;
  template_id: string | null;
  to_address: string;
  subject: string;
  body_preview: string | null;
  body_html: string | null;
  body_text: string | null;
  sent_at: string;
  status: string;
  error_message: string | null;
  resend_id: string | null;
}

export interface SmsLogEntry {
  id: string;
  prospect_id: string;
  template_id: string | null;
  to_phone: string;
  from_phone: string;
  body: string;
  sent_at: string;
  status: string;
  error_message: string | null;
  twilio_sid: string | null;
}

export interface Settings {
  sending_email: string;
  reply_to_email: string;
  sending_domain: string;
  portfolio_link: string;
  company_name: string;
  sender_name: string;
  company_phone: string;
  company_address: string;
  twilio_phone_number: string;
  calendly_link: string;
  [key: string]: string;
}

export interface DashboardStats {
  total_prospects: number;
  by_status: Record<string, number>;
  total_campaigns: number;
  emails_today: number;
  emails_this_week: number;
  emails_this_month: number;
  avg_score: number;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

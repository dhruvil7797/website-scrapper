const API_BASE = '';

let authToken: string | null = null;

// ---------- Types ----------

export interface Prospect {
  id: string;
  business_name: string;
  owner_name: string | null;
  email: string | null;
  phone_raw: string | null;
  website_url: string | null;
  city: string | null;
  state_province: string | null;
  niche_id: string | null;
  stage: string;
  quality_score: number | null;
  qa_score: number | null;
  generated_site_url: string | null;
  email_sent_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Campaign {
  id: string;
  name: string;
  niche_id: string;
  niche_name?: string;
  postal_codes: string;
  country: string;
  radius_km: number;
  daily_limit: number;
  status: string;
  total_discovered: number;
  discovery_completed_at?: string | null;
  created_at: string;
  updated_at?: string;
}

export interface Email {
  id: string;
  prospect_id: string;
  email_type: string;
  to_address: string;
  subject: string;
  body_preview: string;
  sent_at: string;
  status: string;
  bounce_reason: string | null;
  message_id: string | null;
  business_name: string | null;
}

export interface FollowUp {
  id: string;
  business_name: string;
  email: string;
  city: string | null;
  state_province: string | null;
  email_sent_at: string;
  qa_score: number | null;
  generated_site_url: string | null;
  quality_score: number | null;
}

export interface DashboardStats {
  pipeline: Record<string, number>;
  total: number;
  activeCampaigns: number;
  engagement: {
    emailed: number;
    opened: number;
    clicked: number;
    replied: number;
    openRate: number;
    clickRate: number;
  };
  emailLog: { sent: number };
  todaySends: number;
}

// Settings is a dynamic key-value object from the API
export type Settings = Record<string, any>;

// Aliases for backward compat
export const getDashboardStats = getStats;
export const updateSettings = saveSettings;
export async function batchAction(ids: string[], action: string) {
  return request('/api/prospects', { method: 'PATCH', body: JSON.stringify({ ids, action }) });
}
export async function approveFollowUp(id: string) {
  return approveFollowUps([id]);
}
export async function rejectFollowUp(id: string) {
  return request('/api/follow-ups', { method: 'POST', body: JSON.stringify({ ids: [id], action: 'reject' }) });
}

export default {
  login, getProspects, getProspect, createProspect, updateProspect,
  getCampaigns, getCampaign, createCampaign, updateCampaign, deleteCampaign,
  getStats, getDashboardStats, getFollowUps, approveFollowUps, approveFollowUp, rejectFollowUp,
  getEmails, getSettings, saveSettings, updateSettings, batchAction,
};


export function setToken(token: string) {
  authToken = token;
  localStorage.setItem('auth_token', token);
}

export function getToken(): string | null {
  if (!authToken) {
    authToken = localStorage.getItem('auth_token');
  }
  return authToken;
}

export function clearToken() {
  authToken = null;
  localStorage.removeItem('auth_token');
}

export function isAuthenticated(): boolean {
  const token = getToken();
  if (!token) return false;
  try {
    const [data] = token.split('.');
    const payload = JSON.parse(atob(data));
    return payload.exp > Date.now();
  } catch {
    clearToken();
    return false;
  }
}

async function request<T = any>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  const token = getToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  if (res.status === 401) {
    clearToken();
    window.location.href = '/login';
    throw new Error('Unauthorized');
  }

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error || `Request failed: ${res.status}`);
  }

  return data as T;
}

// ---------- Auth ----------

export async function login(password: string) {
  const result = await request<{ token: string }>('/api/auth', {
    method: 'POST',
    body: JSON.stringify({ password }),
  });
  setToken(result.token);
  return result;
}

// ---------- Prospects ----------

export interface ProspectListParams {
  page?: number;
  pageSize?: number;
  stage?: string;
  campaignId?: string;
  search?: string;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
}

export async function getProspects(params: ProspectListParams = {}) {
  const qs = new URLSearchParams();
  if (params.page) qs.set('page', String(params.page));
  if (params.pageSize) qs.set('pageSize', String(params.pageSize));
  if (params.stage) qs.set('stage', params.stage);
  if (params.campaignId) qs.set('campaignId', params.campaignId);
  if (params.search) qs.set('search', params.search);
  if (params.sortBy) qs.set('sortBy', params.sortBy);
  if (params.sortDir) qs.set('sortDir', params.sortDir);
  return request(`/api/prospects?${qs.toString()}`);
}

export async function getProspect(id: string) {
  return request(`/api/prospects/${id}`);
}

export async function createProspect(data: Record<string, any>) {
  return request('/api/prospects', { method: 'POST', body: JSON.stringify(data) });
}

export async function updateProspect(id: string, data: Record<string, any>) {
  return request(`/api/prospects/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
}

// ---------- Campaigns ----------

export async function getCampaigns() {
  return request('/api/campaigns');
}

export async function getCampaign(id: string) {
  return request(`/api/campaigns/${id}`);
}

export async function createCampaign(data: Record<string, any>) {
  return request('/api/campaigns', { method: 'POST', body: JSON.stringify(data) });
}

export async function updateCampaign(id: string, data: Record<string, any>) {
  return request(`/api/campaigns/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
}

export async function deleteCampaign(id: string) {
  return request(`/api/campaigns/${id}`, { method: 'DELETE' });
}

// ---------- Stats ----------

export async function getStats(params?: { from?: string; to?: string }) {
  const qs = new URLSearchParams();
  if (params?.from) qs.set('from', params.from);
  if (params?.to) qs.set('to', params.to);
  const query = qs.toString();
  return request(`/api/stats${query ? `?${query}` : ''}`);
}

// ---------- Follow-ups ----------

export async function getFollowUps() {
  return request('/api/follow-ups');
}

export async function approveFollowUps(ids: string[]) {
  return request('/api/follow-ups', { method: 'POST', body: JSON.stringify({ ids }) });
}

// ---------- Emails ----------

export interface EmailListParams {
  page?: number;
  pageSize?: number;
  status?: string;
  prospectId?: string;
}

export async function getEmails(params: EmailListParams = {}) {
  const qs = new URLSearchParams();
  if (params.page) qs.set('page', String(params.page));
  if (params.pageSize) qs.set('pageSize', String(params.pageSize));
  if (params.status) qs.set('status', params.status);
  if (params.prospectId) qs.set('prospectId', params.prospectId);
  return request(`/api/emails?${qs.toString()}`);
}

// ---------- Settings ----------

export async function getSettings() {
  return request('/api/settings');
}

export async function saveSettings(settings: Record<string, string>) {
  return request('/api/settings', { method: 'POST', body: JSON.stringify(settings) });
}

import { json, error, requireAuth, nanoid } from '../_shared';
import type { Env } from '../_shared';

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const authErr = requireAuth(context);
  if (authErr) return authErr;

  const url = new URL(context.request.url);
  const status = url.searchParams.get('status');
  const nicheId = url.searchParams.get('niche_id');
  const campaignId = url.searchParams.get('campaign_id');
  const minScore = url.searchParams.get('min_score');
  const search = url.searchParams.get('q');
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '100'), 200);

  let where = 'WHERE 1=1';
  const params: unknown[] = [];

  if (status) { where += ' AND p.status = ?'; params.push(status); }
  if (nicheId) { where += ' AND p.niche_id = ?'; params.push(nicheId); }
  if (campaignId) { where += ' AND p.campaign_id = ?'; params.push(campaignId); }
  if (minScore) { where += ' AND p.quality_score >= ?'; params.push(parseInt(minScore)); }
  if (search) { where += ' AND p.business_name LIKE ?'; params.push(`%${search}%`); }

  const query = `SELECT p.*, n.name as niche_name FROM prospects p LEFT JOIN niches n ON p.niche_id = n.id ${where} ORDER BY p.quality_score DESC LIMIT ?`;
  params.push(limit);

  const { results } = await context.env.DB.prepare(query).bind(...params).all();
  return json(results);
};

// POST /api/prospects — manually add a prospect
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const authErr = requireAuth(context);
  if (authErr) return authErr;

  const body = await context.request.json() as {
    business_name: string;
    phone?: string;
    email?: string;
    website_url?: string;
    address?: string;
    city?: string;
    state_province?: string;
    postal_code?: string;
    country?: string;
    owner_name?: string;
    campaign_id?: string;
    niche_id?: string;
    notes?: string;
  };

  if (!body.business_name) return error('business_name is required');

  const id = nanoid();
  const hasWebsite = body.website_url ? 1 : 0;

  // Simple scoring for manual adds
  let score = 20; // base
  if (!body.website_url) score += 30;
  if (body.email) score += 10;

  await context.env.DB.prepare(
    `INSERT INTO prospects (id, business_name, phone, email, website_url, address, city, state_province, postal_code, country, owner_name, campaign_id, niche_id, notes, has_website, quality_score, score_breakdown)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    id, body.business_name, body.phone || null, body.email || null,
    body.website_url || null, body.address || null, body.city || null,
    body.state_province || null, body.postal_code || null, body.country || 'US',
    body.owner_name || null, body.campaign_id || null, body.niche_id || null,
    body.notes || null, hasWebsite, score, JSON.stringify({ base: 20, no_website: hasWebsite ? 0 : 30, has_email: body.email ? 10 : 0 }),
  ).run();

  const result = await context.env.DB.prepare(
    'SELECT p.*, n.name as niche_name FROM prospects p LEFT JOIN niches n ON p.niche_id = n.id WHERE p.id = ?'
  ).bind(id).first();

  return json(result, 201);
};

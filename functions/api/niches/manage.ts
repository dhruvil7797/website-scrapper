import { json, error, requireAuth, nanoid } from '../../_shared';
import type { Env } from '../../_shared';

// POST /api/niches/manage — add a new niche
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const authErr = requireAuth(context);
  if (authErr) return authErr;

  const { id, name, category, search_terms } = await context.request.json() as {
    id?: string;
    name: string;
    category: string;
    search_terms: string;
  };

  if (!name || !category) return error('name and category are required');

  const nicheId = id || name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/_+$/, '');

  // Convert search_terms to JSON array if provided as comma-separated string
  let termsJson: string;
  if (!search_terms) {
    termsJson = JSON.stringify([name.toLowerCase()]);
  } else {
    try {
      JSON.parse(search_terms); // already valid JSON
      termsJson = search_terms;
    } catch {
      termsJson = JSON.stringify(search_terms.split(',').map((s: string) => s.trim()).filter(Boolean));
    }
  }

  await context.env.DB.prepare(
    `INSERT OR IGNORE INTO niches (id, name, category, search_terms) VALUES (?, ?, ?, ?)`
  ).bind(nicheId, name, category, termsJson).run();

  const result = await context.env.DB.prepare('SELECT * FROM niches WHERE id = ?').bind(nicheId).first();
  return json(result, 201);
};

// DELETE /api/niches/manage — delete a niche (only if no prospects use it)
export const onRequestDelete: PagesFunction<Env> = async (context) => {
  const authErr = requireAuth(context);
  if (authErr) return authErr;

  const { id } = await context.request.json() as { id: string };
  if (!id) return error('id required');

  const count = await context.env.DB.prepare('SELECT COUNT(*) as c FROM prospects WHERE niche_id = ?').bind(id).first<{ c: number }>();
  if (count && count.c > 0) return error(`Cannot delete: ${count.c} prospects use this niche`);

  await context.env.DB.prepare('DELETE FROM niches WHERE id = ?').bind(id).run();
  return json({ deleted: true });
};

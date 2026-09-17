import { json, error, requireAuth } from '../_shared';
import type { Env } from '../_shared';

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const authErr = requireAuth(context);
  if (authErr) return authErr;

  const { results } = await context.env.DB.prepare('SELECT * FROM niches ORDER BY category, name').all();
  return json(results);
};

import { json, error, requireAuth } from '../../_shared';
import type { Env } from '../../_shared';

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const authErr = requireAuth(context);
  if (authErr) return authErr;

  const { ids, action } = await context.request.json() as { ids: string[]; action: 'skip' | 'delete' };
  if (!ids?.length || !action) return error('ids and action required');

  const placeholders = ids.map(() => '?').join(',');
  if (action === 'skip') {
    await context.env.DB.prepare(`UPDATE prospects SET status = 'skipped', updated_at = datetime('now') WHERE id IN (${placeholders})`).bind(...ids).run();
  } else if (action === 'delete') {
    await context.env.DB.prepare(`DELETE FROM prospects WHERE id IN (${placeholders})`).bind(...ids).run();
  }
  return json({ affected: ids.length });
};

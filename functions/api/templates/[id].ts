import { json, error, requireAuth } from '../../_shared';
import type { Env } from '../../_shared';

export const onRequestPut: PagesFunction<Env, 'id'> = async (context) => {
  const authErr = requireAuth(context);
  if (authErr) return authErr;

  const id = context.params.id as string;
  const body = await context.request.json() as {
    name?: string; category?: string; subject?: string;
    body_html?: string; body_text?: string; placeholders?: string;
  };

  const sets: string[] = [];
  const values: unknown[] = [];
  for (const [key, val] of Object.entries(body)) {
    if (['name', 'category', 'subject', 'body_html', 'body_text', 'placeholders'].includes(key) && val !== undefined) {
      sets.push(`${key} = ?`);
      values.push(val);
    }
  }

  if (sets.length === 0) return error('No fields to update');
  sets.push(`updated_at = datetime('now')`);
  values.push(id);

  await context.env.DB.prepare(`UPDATE email_templates SET ${sets.join(', ')} WHERE id = ?`).bind(...values).run();
  const result = await context.env.DB.prepare('SELECT * FROM email_templates WHERE id = ?').bind(id).first();
  return json(result);
};

export const onRequestDelete: PagesFunction<Env, 'id'> = async (context) => {
  const authErr = requireAuth(context);
  if (authErr) return authErr;

  const id = context.params.id as string;
  await context.env.DB.prepare('DELETE FROM email_templates WHERE id = ?').bind(id).run();
  return json({ deleted: true });
};

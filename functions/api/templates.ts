import { json, error, requireAuth, nanoid } from '../_shared';
import type { Env } from '../_shared';

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const authErr = requireAuth(context);
  if (authErr) return authErr;

  const { results } = await context.env.DB.prepare('SELECT * FROM email_templates ORDER BY category, name').all();
  return json(results);
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const authErr = requireAuth(context);
  if (authErr) return authErr;

  const body = await context.request.json() as {
    name: string; category: string; subject: string;
    body_html: string; body_text: string; placeholders: string;
  };

  const id = 'tpl_' + nanoid(8);
  await context.env.DB.prepare(
    `INSERT INTO email_templates (id, name, category, subject, body_html, body_text, placeholders) VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).bind(id, body.name, body.category, body.subject, body.body_html, body.body_text, body.placeholders).run();

  const result = await context.env.DB.prepare('SELECT * FROM email_templates WHERE id = ?').bind(id).first();
  return json(result, 201);
};

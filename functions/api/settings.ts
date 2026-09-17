import { json, error, requireAuth } from '../_shared';
import type { Env } from '../_shared';

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const authErr = requireAuth(context);
  if (authErr) return authErr;

  const { results } = await context.env.DB.prepare('SELECT key, value FROM settings').all();
  const settings: Record<string, string> = {};
  for (const row of results as Array<{ key: string; value: string }>) {
    settings[row.key] = row.value;
  }
  return json(settings);
};

export const onRequestPut: PagesFunction<Env> = async (context) => {
  const authErr = requireAuth(context);
  if (authErr) return authErr;

  const { settings } = await context.request.json() as { settings: Record<string, string> };
  if (!settings) return error('settings object required');

  // Handle password change specially
  if (settings.admin_password) {
    // Password is stored in wrangler.toml / env — can't update at runtime via D1
    // For now, just acknowledge it
    delete settings.admin_password;
  }

  for (const [key, value] of Object.entries(settings)) {
    await context.env.DB.prepare(
      `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
    ).bind(key, value).run();
  }

  // Return updated settings
  const { results } = await context.env.DB.prepare('SELECT key, value FROM settings').all();
  const current: Record<string, string> = {};
  for (const row of results as Array<{ key: string; value: string }>) {
    current[row.key] = row.value;
  }
  return json(current);
};

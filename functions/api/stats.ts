import { json, error, requireAuth } from '../_shared';
import type { Env } from '../_shared';

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const authErr = requireAuth(context);
  if (authErr) return authErr;

  const db = context.env.DB;

  const [total, byStatus, campaigns, emailsToday, emailsWeek, emailsMonth, avgScore] = await Promise.all([
    db.prepare('SELECT COUNT(*) as c FROM prospects').first<{ c: number }>(),
    db.prepare(`SELECT status, COUNT(*) as c FROM prospects GROUP BY status`).all(),
    db.prepare('SELECT COUNT(*) as c FROM campaigns').first<{ c: number }>(),
    db.prepare(`SELECT COUNT(*) as c FROM email_log WHERE sent_at >= date('now')`).first<{ c: number }>(),
    db.prepare(`SELECT COUNT(*) as c FROM email_log WHERE sent_at >= date('now', '-7 days')`).first<{ c: number }>(),
    db.prepare(`SELECT COUNT(*) as c FROM email_log WHERE sent_at >= date('now', '-30 days')`).first<{ c: number }>(),
    db.prepare('SELECT ROUND(AVG(quality_score)) as avg FROM prospects').first<{ avg: number }>(),
  ]);

  const statusMap: Record<string, number> = {};
  for (const row of byStatus.results as Array<{ status: string; c: number }>) {
    statusMap[row.status] = row.c;
  }

  return json({
    total_prospects: total?.c || 0,
    by_status: statusMap,
    total_campaigns: campaigns?.c || 0,
    emails_today: emailsToday?.c || 0,
    emails_this_week: emailsWeek?.c || 0,
    emails_this_month: emailsMonth?.c || 0,
    avg_score: avgScore?.avg || 0,
  });
};

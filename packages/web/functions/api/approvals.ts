import type { Env } from '../_shared';
import { jsonResponse, errorResponse, requireAuth, generateId } from '../_shared';

/**
 * GET /api/approvals - List prospects pending approval
 * POST /api/approvals - Approve, request changes, or reject a prospect
 */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const authError = await requireAuth(context);
  if (authError) return authError;

  const { CLIENT_DB: db } = context.env;

  const results = await db.prepare(`
    SELECT id, business_name, owner_name, email, city, state_province,
           niche_id, quality_score, qa_score, 
           generated_site_url, portfolio_slug,
           draft_email_subject, draft_email_body_html, draft_email_body_text,
           approval_status, approval_comment, created_at, updated_at
    FROM prospects 
    WHERE stage = 'pending_approval'
    ORDER BY qa_score DESC, updated_at DESC
  `).all();

  return jsonResponse(results.results);
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const authError = await requireAuth(context);
  if (authError) return authError;

  const { CLIENT_DB: db } = context.env;
  const body = await context.request.json() as {
    prospectId: string;
    action: 'approve' | 'request_changes' | 'reject' | 'rework';
    comment?: string;
    editedEmail?: string; // Allow editing the recipient email
    editedSubject?: string; // Allow editing subject
    editedBodyHtml?: string; // Allow editing body
  };

  if (!body.prospectId || !body.action) {
    return errorResponse('Missing prospectId or action', 400);
  }

  const prospect = await db.prepare(
    'SELECT id, stage, email FROM prospects WHERE id = ?'
  ).bind(body.prospectId).first();

  if (!prospect) return errorResponse('Prospect not found', 404);
  if (prospect.stage !== 'pending_approval') {
    return errorResponse(`Prospect is at stage '${prospect.stage}', not pending_approval`, 400);
  }

  switch (body.action) {
    case 'approve': {
      // Calculate next-day send time (8-9am in prospect's timezone, or default 9am UTC)
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(9 + Math.floor(Math.random() * 2), Math.floor(Math.random() * 60), 0, 0);
      const scheduledAt = tomorrow.toISOString();

      await db.prepare(`
        UPDATE prospects SET 
          stage = 'approved',
          approval_status = 'approved',
          approved_at = datetime('now'),
          scheduled_send_at = ?,
          email = COALESCE(?, email),
          draft_email_subject = COALESCE(?, draft_email_subject),
          draft_email_body_html = COALESCE(?, draft_email_body_html),
          updated_at = datetime('now')
        WHERE id = ?
      `).bind(
        scheduledAt,
        body.editedEmail || null,
        body.editedSubject || null,
        body.editedBodyHtml || null,
        body.prospectId
      ).run();

      return jsonResponse({ status: 'approved', scheduledAt });
    }

    case 'request_changes': {
      await db.prepare(`
        UPDATE prospects SET 
          approval_status = 'changes_requested',
          approval_comment = ?,
          stage = 'scraped',
          qa_score = NULL,
          generated_site_url = NULL,
          generated_site_key = NULL,
          draft_email_subject = NULL,
          draft_email_body_html = NULL,
          updated_at = datetime('now')
        WHERE id = ?
      `).bind(body.comment || 'Changes needed', body.prospectId).run();

      return jsonResponse({ status: 'changes_requested', comment: body.comment });
    }

    case 'rework': {
      // Complete rework - reset to scraped, will be re-generated
      await db.prepare(`
        UPDATE prospects SET 
          approval_status = 'rework',
          approval_comment = ?,
          stage = 'scraped',
          qa_score = NULL,
          generated_site_url = NULL,
          generated_site_key = NULL,
          portfolio_slug = NULL,
          draft_email_subject = NULL,
          draft_email_body_html = NULL,
          draft_email_body_text = NULL,
          updated_at = datetime('now')
        WHERE id = ?
      `).bind(body.comment || 'Complete rework requested', body.prospectId).run();

      return jsonResponse({ status: 'rework' });
    }

    case 'reject': {
      await db.prepare(`
        UPDATE prospects SET 
          stage = 'skipped',
          approval_status = 'rejected',
          approval_comment = ?,
          updated_at = datetime('now')
        WHERE id = ?
      `).bind(body.comment || 'Rejected', body.prospectId).run();

      return jsonResponse({ status: 'rejected' });
    }

    default:
      return errorResponse('Invalid action', 400);
  }
};

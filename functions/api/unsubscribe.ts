import type { Env } from '../_shared';

// GET /api/unsubscribe?id=PROSPECT_ID
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const url = new URL(context.request.url);
  const prospectId = url.searchParams.get('id');

  if (!prospectId) {
    return new Response(renderPage('Invalid Request', 'No unsubscribe ID provided.'), {
      status: 400,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }

  // Check prospect exists
  const prospect = await context.env.DB.prepare(
    'SELECT id, email, opted_out FROM prospects WHERE id = ?'
  ).bind(prospectId).first<{ id: string; email: string; opted_out: number }>();

  if (!prospect) {
    return new Response(renderPage('Not Found', 'This unsubscribe link is no longer valid.'), {
      status: 404,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }

  if (prospect.opted_out === 1) {
    return new Response(renderPage('Already Unsubscribed', 'You were already unsubscribed. You won\'t receive any more emails from us.'), {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }

  // Set opted_out
  await context.env.DB.prepare(
    'UPDATE prospects SET opted_out = 1, updated_at = datetime(\'now\') WHERE id = ?'
  ).bind(prospectId).run();

  return new Response(renderPage('Unsubscribed', 'You\'ve been unsubscribed. You won\'t receive any more emails from us.'), {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
};

function renderPage(title: string, message: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0f172a;
      color: #e2e8f0;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .card {
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 12px;
      padding: 48px;
      max-width: 480px;
      text-align: center;
    }
    .icon { font-size: 48px; margin-bottom: 16px; }
    h1 { font-size: 24px; font-weight: 600; margin-bottom: 12px; color: #f8fafc; }
    p { font-size: 16px; line-height: 1.6; color: #94a3b8; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">✉️</div>
    <h1>${title}</h1>
    <p>${message}</p>
  </div>
</body>
</html>`;
}

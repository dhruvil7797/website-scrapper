import type { Env } from '../../_shared';

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { slug } = context.params;
  const r2Key = `portfolio/${slug}/index.html`;

  try {
    const object = await context.env.SITE_ASSETS.get(r2Key);

    if (!object) {
      return new Response(
        `<!DOCTYPE html><html><body><h1>Portfolio Not Found</h1><p>The requested portfolio page does not exist.</p></body></html>`,
        {
          status: 404,
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        }
      );
    }

    const html = await object.text();
    return new Response(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch (e: any) {
    return new Response(
      `<!DOCTYPE html><html><body><h1>Error</h1><p>Unable to load portfolio.</p></body></html>`,
      {
        status: 500,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      }
    );
  }
};

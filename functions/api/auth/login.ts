import type { Env } from '../../_shared';

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { password } = await context.request.json() as { password: string };
  if (password !== context.env.ADMIN_PASSWORD) {
    return new Response(JSON.stringify({ success: false, error: 'Invalid password' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  return new Response(JSON.stringify({ success: true }), {
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': 'session=authenticated; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400',
    },
  });
};

import type { Env } from '../_shared';
import { jsonResponse, errorResponse, handleOptions, createToken } from '../_shared';

export const onRequestOptions: PagesFunction<Env> = async () => handleOptions();

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const body = await context.request.json<{ password: string }>();

    if (!body.password) {
      return errorResponse('Password required');
    }

    if (body.password !== context.env.ADMIN_PASSWORD) {
      return errorResponse('Invalid password', 401);
    }

    const token = createToken(context.env.JWT_SECRET);
    return jsonResponse({ token, expiresIn: '24h' });
  } catch (e) {
    return errorResponse('Invalid request body');
  }
};

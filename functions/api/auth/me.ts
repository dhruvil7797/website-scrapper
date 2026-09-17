import { json, error } from '../../_shared';

export const onRequestGet: PagesFunction = async (context) => {
  const cookie = context.request.headers.get('Cookie') || '';
  const match = cookie.match(/session=([^;]+)/);
  if (match && match[1] === 'authenticated') {
    return json({ authenticated: true });
  }
  return error('Unauthorized', 401);
};

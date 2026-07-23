export interface Env {
  CLIENT_DB: D1Database;
  SITE_ASSETS: R2Bucket;
  ADMIN_PASSWORD: string;
  JWT_SECRET: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

export function corsHeaders(): HeadersInit {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

export function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders(),
    },
  });
}

export function errorResponse(message: string, status = 400): Response {
  return jsonResponse({ error: message }, status);
}

export function handleOptions(): Response {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

// Simple JWT-like token (base64-encoded JSON with expiry)
export function createToken(secret: string): string {
  const payload = {
    iat: Date.now(),
    exp: Date.now() + 24 * 60 * 60 * 1000, // 24 hours
  };
  const data = btoa(JSON.stringify(payload));
  const sig = btoa(secret + ':' + data);
  return `${data}.${sig}`;
}

export function verifyToken(token: string, secret: string): boolean {
  try {
    const [data, sig] = token.split('.');
    if (!data || !sig) return false;
    const expectedSig = btoa(secret + ':' + data);
    if (sig !== expectedSig) return false;
    const payload = JSON.parse(atob(data));
    return payload.exp > Date.now();
  } catch {
    return false;
  }
}

export function requireAuth(request: Request, env: Env): Response | null {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return errorResponse('Unauthorized', 401);
  }
  const token = authHeader.slice(7);
  if (!verifyToken(token, env.JWT_SECRET)) {
    return errorResponse('Invalid or expired token', 401);
  }
  return null;
}

export function generateId(): string {
  return crypto.randomUUID();
}

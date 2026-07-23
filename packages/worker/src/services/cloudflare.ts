import { config } from '../config.js';
import { createLogger } from './logger.js';

const log = createLogger('cloudflare');

const BASE_URL = 'https://api.cloudflare.com/client/v4';
const headers = {
  'Authorization': `Bearer ${config.cloudflare.apiToken}`,
  'Content-Type': 'application/json',
};

// ============================================================
// D1 Database Operations
// ============================================================

interface D1Result {
  results: Record<string, unknown>[];
  success: boolean;
  meta: { changes: number; duration: number };
}

export async function d1Query(sql: string, params: unknown[] = []): Promise<D1Result> {
  const url = `${BASE_URL}/accounts/${config.cloudflare.accountId}/d1/database/${config.cloudflare.d1DatabaseId}/query`;
  
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ sql, params }),
  });

  const json = await res.json() as { result: D1Result[]; success: boolean; errors: { message: string }[] };
  
  if (!json.success) {
    const errMsg = json.errors?.[0]?.message || 'D1 query failed';
    log.error('D1 query failed', { sql: sql.substring(0, 100), error: errMsg });
    throw new Error(`D1 Error: ${errMsg}`);
  }

  return json.result[0];
}

export async function d1Execute(sql: string, params: unknown[] = []): Promise<{ changes: number }> {
  const result = await d1Query(sql, params);
  return { changes: result.meta.changes };
}

export async function d1Select<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  const result = await d1Query(sql, params);
  return result.results as T[];
}

export async function d1SelectOne<T>(sql: string, params: unknown[] = []): Promise<T | null> {
  const results = await d1Select<T>(sql, params);
  return results[0] || null;
}

// ============================================================
// R2 Object Storage Operations
// ============================================================

export async function r2Upload(key: string, body: Buffer | string, contentType: string = 'text/html'): Promise<void> {
  const url = `${BASE_URL}/accounts/${config.cloudflare.accountId}/r2/buckets/${config.cloudflare.r2Bucket}/objects/${encodeURIComponent(key)}`;
  
  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${config.cloudflare.apiToken}`,
      'Content-Type': contentType,
    },
    body,
  });

  if (!res.ok) {
    const text = await res.text();
    log.error('R2 upload failed', { key, status: res.status, error: text });
    throw new Error(`R2 upload failed: ${res.status} ${text}`);
  }

  log.info('R2 upload success', { key, contentType });
}

export async function r2Download(key: string): Promise<Buffer> {
  const url = `${BASE_URL}/accounts/${config.cloudflare.accountId}/r2/buckets/${config.cloudflare.r2Bucket}/objects/${encodeURIComponent(key)}`;
  
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${config.cloudflare.apiToken}`,
    },
  });

  if (!res.ok) {
    throw new Error(`R2 download failed: ${res.status}`);
  }

  return Buffer.from(await res.arrayBuffer());
}

export async function r2List(prefix: string): Promise<string[]> {
  const url = `${BASE_URL}/accounts/${config.cloudflare.accountId}/r2/buckets/${config.cloudflare.r2Bucket}/objects?prefix=${encodeURIComponent(prefix)}`;
  
  const res = await fetch(url, {
    method: 'GET',
    headers,
  });

  const json = await res.json() as { result: { objects: { key: string }[] }; success: boolean };
  if (!json.success) return [];
  return json.result.objects?.map(o => o.key) || [];
}

// ============================================================
// Settings helpers
// ============================================================

export async function getSetting(key: string): Promise<string | null> {
  const row = await d1SelectOne<{ value: string }>('SELECT value FROM settings WHERE key = ?', [key]);
  return row?.value || null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  await d1Execute(
    `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now')) 
     ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = datetime('now')`,
    [key, value, value]
  );
}

import { createLogger } from './logger.js';

const log = createLogger('gemini');

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

interface GeminiOptions {
  prompt: string;
  model?: 'pro' | 'flash';
  timeout?: number;
  temperature?: number;
  maxOutputTokens?: number;
}

interface GeminiResponse {
  candidates: Array<{
    content: { parts: Array<{ text: string }> };
    finishReason: string;
  }>;
}

const MODEL_MAP = {
  pro: 'gemini-2.5-pro',
  flash: 'gemini-2.5-flash',
};

function getApiKey(): string {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY not set in environment');
  return key;
}

/**
 * Call Gemini API with retry and exponential backoff.
 * Returns raw text response.
 */
export async function geminiCall(options: GeminiOptions): Promise<string> {
  const {
    prompt,
    model = 'flash',
    timeout = 120000,
    temperature = 0.7,
    maxOutputTokens = 65536,
  } = options;

  const modelId = MODEL_MAP[model];
  const apiKey = getApiKey();
  const url = `${GEMINI_API_BASE}/${modelId}:generateContent?key=${apiKey}`;

  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature,
      maxOutputTokens,
      topP: 0.95,
    },
  };

  const MAX_RETRIES = 3;
  const INITIAL_DELAY = 2000;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      log.debug(`Gemini ${model} call (attempt ${attempt})`, { promptLength: prompt.length });

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timer);

      if (response.status === 429) {
        const delay = INITIAL_DELAY * Math.pow(2, attempt - 1);
        log.warn(`Rate limited (429), retrying in ${delay}ms...`);
        await sleep(delay);
        continue;
      }

      if (response.status === 503 || response.status === 500) {
        const delay = INITIAL_DELAY * Math.pow(2, attempt - 1);
        log.warn(`Server error (${response.status}), retrying in ${delay}ms...`);
        await sleep(delay);
        continue;
      }

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Gemini API error ${response.status}: ${errorText.substring(0, 200)}`);
      }

      const data = (await response.json()) as GeminiResponse;

      if (!data.candidates || data.candidates.length === 0) {
        throw new Error('Gemini returned no candidates');
      }

      const text = data.candidates[0].content.parts.map(p => p.text).join('');
      log.debug(`Gemini ${model} response`, { responseLength: text.length });
      return text;
    } catch (err: unknown) {
      const error = err as Error;
      if (error.name === 'AbortError') {
        log.warn(`Gemini timeout (${timeout}ms), attempt ${attempt}/${MAX_RETRIES}`);
      } else if (attempt === MAX_RETRIES) {
        throw error;
      } else {
        log.warn(`Gemini error: ${error.message.substring(0, 100)}, retrying...`);
      }
      await sleep(INITIAL_DELAY * Math.pow(2, attempt - 1));
    }
  }

  throw new Error('Gemini API failed after all retries');
}

/**
 * Call Gemini and parse JSON response.
 */
export async function geminiJson<T>(options: GeminiOptions): Promise<T> {
  const raw = await geminiCall(options);

  // Strip markdown code fences if present
  let cleaned = raw.trim();
  const jsonFence = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonFence) {
    cleaned = jsonFence[1].trim();
  }

  // Find JSON object
  const jsonMatch = cleaned.match(/(\{[\s\S]*\})/);
  if (jsonMatch) {
    cleaned = jsonMatch[1];
  }

  try {
    return JSON.parse(cleaned) as T;
  } catch {
    // Try to find any valid JSON object
    const allMatches = cleaned.match(/\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g);
    if (allMatches) {
      for (let i = allMatches.length - 1; i >= 0; i--) {
        try { return JSON.parse(allMatches[i]) as T; } catch { continue; }
      }
    }
    log.error('Failed to parse Gemini JSON', { raw: raw.substring(0, 300) });
    throw new Error('Gemini returned invalid JSON');
  }
}

/**
 * Call Gemini and extract clean HTML from response.
 * Strips any markdown fences or explanatory text.
 */
export async function geminiHtml(options: GeminiOptions): Promise<string> {
  const raw = await geminiCall(options);

  let html = raw.trim();

  // Strip markdown HTML fence
  const htmlFence = html.match(/```(?:html)?\s*([\s\S]*?)```/);
  if (htmlFence) {
    html = htmlFence[1].trim();
  }

  // Find DOCTYPE or <html start
  const docIdx = html.indexOf('<!DOCTYPE');
  const htmlIdx = html.indexOf('<html');
  if (docIdx >= 0) html = html.substring(docIdx);
  else if (htmlIdx >= 0) html = html.substring(htmlIdx);

  // Trim after </html>
  const endIdx = html.lastIndexOf('</html>');
  if (endIdx > 0) html = html.substring(0, endIdx + 7);

  if (!html.includes('<html') || html.length < 500) {
    throw new Error(`Gemini HTML output too short or malformed (${html.length} chars)`);
  }

  return html;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { createLogger } from './logger.js';

const log = createLogger('bedrock');

// Model cascade: try best first, fall back on throttle
const MODELS = {
  sonnet: [
    'us.anthropic.claude-sonnet-4-6',
    'us.anthropic.claude-haiku-4-5-20251001-v1:0',
  ],
  haiku: [
    'us.anthropic.claude-haiku-4-5-20251001-v1:0',
    'us.anthropic.claude-3-haiku-20240307-v1:0',
  ],
};

type ModelTier = 'sonnet' | 'haiku';

interface BedrockOptions {
  prompt: string;
  system?: string;
  model?: ModelTier;
  maxTokens?: number;
  temperature?: number;
  timeout?: number;
}

const client = new BedrockRuntimeClient({ region: 'us-west-2' });

/**
 * Call Claude via Bedrock with model cascade fallback.
 * On throttle (429/ThrottlingException), falls back to next model in cascade.
 * On transient errors, retries with exponential backoff.
 */
export async function bedrockCall(options: BedrockOptions): Promise<string> {
  const {
    prompt,
    system,
    model = 'haiku',
    maxTokens = 16384,
    temperature = 0.7,
  } = options;

  const modelCascade = MODELS[model];

  for (let modelIdx = 0; modelIdx < modelCascade.length; modelIdx++) {
    const modelId = modelCascade[modelIdx];
    const MAX_RETRIES = 3;
    const INITIAL_DELAY = 2000;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        log.debug(`Bedrock call (${modelId}, attempt ${attempt})`, { promptLength: prompt.length });

        const body: any = {
          anthropic_version: 'bedrock-2023-05-31',
          max_tokens: maxTokens,
          temperature,
          messages: [{ role: 'user', content: prompt }],
        };

        if (system) {
          body.system = system;
        }

        const command = new InvokeModelCommand({
          modelId,
          contentType: 'application/json',
          body: JSON.stringify(body),
        });

        const response = await client.send(command);
        const responseBody = JSON.parse(new TextDecoder().decode(response.body));

        if (!responseBody.content || responseBody.content.length === 0) {
          throw new Error('Bedrock returned no content');
        }

        const text = responseBody.content
          .filter((b: any) => b.type === 'text')
          .map((b: any) => b.text)
          .join('');

        log.debug(`Bedrock response (${modelId})`, { responseLength: text.length, stopReason: responseBody.stop_reason });
        return text;

      } catch (err: unknown) {
        const error = err as Error & { name?: string; $metadata?: { httpStatusCode?: number } };
        const statusCode = error.$metadata?.httpStatusCode;
        const isThrottle = statusCode === 429 ||
          error.name === 'ThrottlingException' ||
          error.name === 'ServiceUnavailableException' ||
          error.message?.includes('Too many requests') ||
          error.message?.includes('throttl');

        if (isThrottle && modelIdx < modelCascade.length - 1) {
          // Throttled - try next model in cascade
          log.warn(`Throttled on ${modelId}, falling back to next model`);
          break; // break retry loop, move to next model
        }

        if (isThrottle || statusCode === 500 || statusCode === 503) {
          const delay = INITIAL_DELAY * Math.pow(2, attempt - 1);
          log.warn(`Bedrock error (${statusCode || error.name}), retrying in ${delay}ms...`);
          await sleep(delay);
          continue;
        }

        // Non-retryable error
        if (attempt === MAX_RETRIES) throw error;
        log.warn(`Bedrock error: ${error.message?.substring(0, 100)}, retrying...`);
        await sleep(INITIAL_DELAY);
      }
    }
  }

  throw new Error('Bedrock API failed after all models and retries');
}

/**
 * Call Bedrock and parse JSON response.
 */
export async function bedrockJson<T>(options: BedrockOptions): Promise<T> {
  const raw = await bedrockCall(options);

  let cleaned = raw.trim();

  // Strip markdown code fences
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
    const allMatches = cleaned.match(/\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g);
    if (allMatches) {
      for (let i = allMatches.length - 1; i >= 0; i--) {
        try { return JSON.parse(allMatches[i]) as T; } catch { continue; }
      }
    }
    log.error('Failed to parse Bedrock JSON', { raw: raw.substring(0, 300) });
    throw new Error('Bedrock returned invalid JSON');
  }
}

/**
 * Call Bedrock and extract clean HTML from response.
 */
export async function bedrockHtml(options: BedrockOptions): Promise<string> {
  const raw = await bedrockCall(options);

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
    throw new Error(`Bedrock HTML output too short or malformed (${html.length} chars)`);
  }

  return html;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

import { execSync, exec as execCb } from 'child_process';
import { promisify } from 'util';
import { writeFileSync, readFileSync, unlinkSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { nanoid } from 'nanoid';
import { createLogger } from './logger.js';

const log = createLogger('ai');
const execAsync = promisify(execCb);


interface AiOptions {
  prompt: string;
  timeout?: number; // ms, default 180000 (3 min)
}

interface AiFileOptions {
  prompt: string;
  outputPath: string; // AI writes directly to this file
  timeout?: number;
}

/**
 * Call kiro-cli and get text response.
 * Strips ANSI codes and reasoning from output.
 */
export async function aiCall(options: AiOptions): Promise<string> {
  const { prompt, timeout = 600000 } = options; // Default 10 min
  const tmpFile = join(tmpdir(), `ai-prompt-${nanoid(8)}.txt`);
  
  try {
    writeFileSync(tmpFile, prompt, 'utf-8');
    
    const cmd = `kiro-cli chat --no-interactive < "${tmpFile}"`;
    
    log.debug('AI call started', { promptLength: prompt.length });
    
    const { stdout: result } = await execAsync(cmd, {
      timeout,
      maxBuffer: 10 * 1024 * 1024,
      shell: '/bin/bash',
    });

    log.debug('AI call completed', { responseLength: result.length });
    
    // Strip ANSI escape codes
    let cleaned = result.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '').trim();
    
    // Strip kiro-cli reasoning blocks
    const docStart = cleaned.indexOf('<!DOCTYPE');
    const htmlStart = cleaned.indexOf('<html');
    const jsonStart = cleaned.indexOf('{');
    
    if (docStart > 0) cleaned = cleaned.substring(docStart);
    else if (htmlStart > 0 && (jsonStart < 0 || htmlStart < jsonStart)) cleaned = cleaned.substring(htmlStart);
    
    // Strip markdown code fences
    const htmlFence = cleaned.match(/```(?:html)?\s*([\s\S]*?)```/);
    if (htmlFence) cleaned = htmlFence[1].trim();
    
    return cleaned;
  } catch (err: unknown) {
    const error = err as Error;
    log.error('AI call failed', { error: error.message.substring(0, 200) });
    throw new Error(`AI call failed: ${error.message.substring(0, 200)}`);
  } finally {
    if (existsSync(tmpFile)) unlinkSync(tmpFile);
  }
}

/**
 * Call kiro-cli and have it write output directly to a file.
 * This avoids stdout ANSI/formatting issues entirely.
 * The prompt instructs the AI to write to the file path.
 */
export async function aiGenerateToFile(options: AiFileOptions): Promise<void> {
  const { prompt, outputPath, timeout = 300000 } = options;
  const tmpPrompt = join(tmpdir(), `ai-prompt-${nanoid(8)}.txt`);
  
  // Wrap prompt to instruct writing to file
  const filePrompt = `${prompt}

CRITICAL INSTRUCTION: Write your complete output to the file at: ${outputPath}
Use the file write tool to save the complete HTML to that exact path. Do NOT output the HTML in your response - write it to the file only.`;

  try {
    writeFileSync(tmpPrompt, filePrompt, 'utf-8');
    
    const cmd = `kiro-cli chat --no-interactive < "${tmpPrompt}"`;
    
    log.debug('AI file generation started', { outputPath, promptLength: filePrompt.length });
    
    await execAsync(cmd, {
      timeout,
      maxBuffer: 10 * 1024 * 1024,
      shell: '/bin/bash',
    });

    // Verify file was created
    if (existsSync(outputPath)) {
      const size = readFileSync(outputPath).length;
      log.debug('AI file generation completed', { outputPath, size });
    } else {
      throw new Error('AI did not write output file');
    }
  } catch (err: unknown) {
    const error = err as Error;
    log.error('AI file generation failed', { error: error.message.substring(0, 200) });
    throw error;
  } finally {
    if (existsSync(tmpPrompt)) unlinkSync(tmpPrompt);
  }
}

/**
 * Call AI and get stdout response, then write to file ourselves.
 * Fallback approach when aiGenerateToFile doesn't work with kiro-cli.
 * Applies aggressive cleanup for HTML output.
 */
export async function aiGenerateHtml(options: AiOptions & { outputPath: string }): Promise<void> {
  const { outputPath, ...aiOpts } = options;
  const raw = await aiCall(aiOpts);
  
  // Additional HTML-specific cleanup
  let html = raw;
  
  // Fix missing * in CSS reset (kiro strips * as markdown)
  html = html.replace(/^(,\s*::before,\s*::after)/m, '*, ::before, ::after');
  html = html.replace(/(\n)(,\s*::before,\s*::after)/g, '$1*, ::before, ::after');
  
  // Fix broken CSS comments
  html = html.replace(/\/\s+\*/g, '/*');
  html = html.replace(/\*\s+\//g, '*/');
  
  // Ensure it starts with DOCTYPE
  if (!html.startsWith('<!DOCTYPE') && !html.startsWith('<html')) {
    const idx = html.indexOf('<!DOCTYPE');
    if (idx > 0) html = html.substring(idx);
  }
  
  writeFileSync(outputPath, html, 'utf-8');
  log.debug('HTML written to file', { outputPath, size: html.length });
}

/**
 * Call AI and parse JSON response.
 * Strips ANSI codes, reasoning text, and markdown code fences.
 */
export async function aiCallJson<T>(options: AiOptions): Promise<T> {
  const raw = await aiCall(options);
  
  // Strip remaining ANSI if any
  let cleaned = raw.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '');
  
  // Try to find JSON object in the response
  const jsonFenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonFenceMatch) {
    cleaned = jsonFenceMatch[1].trim();
  } else {
    const jsonObjMatch = cleaned.match(/(\{[\s\S]*\})/);
    if (jsonObjMatch) {
      cleaned = jsonObjMatch[1].trim();
    }
  }
  
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    // Try finding the last valid JSON block
    const allJsonMatches = cleaned.match(/\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g);
    if (allJsonMatches && allJsonMatches.length > 0) {
      for (let i = allJsonMatches.length - 1; i >= 0; i--) {
        try {
          return JSON.parse(allJsonMatches[i]) as T;
        } catch { continue; }
      }
    }
    
    log.error('Failed to parse AI JSON', { raw: raw.substring(0, 300) });
    throw new Error('AI returned invalid JSON');
  }
}

import { execSync } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createLogger } from './logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const log = createLogger('design-lookup');

const SEARCH_SCRIPT = join(__dirname, '../prompts/fadekingzz-steering/ui-ux-pro-max/scripts/search.py');

export interface DesignSystem {
  pattern: string;
  style: string;
  colors: {
    primary: string;
    onPrimary: string;
    secondary: string;
    accent: string;
    background: string;
    foreground: string;
    muted: string;
    border: string;
  };
  typography: string;
  effects: string;
  avoid: string;
  raw: string; // Full output for prompt injection
}

/**
 * Query the ui-ux-pro-max design database for niche-specific design system.
 * Returns structured design tokens + raw output for prompt injection.
 */
export function lookupDesignSystem(niche: string, city?: string): DesignSystem {
  const query = `${niche} local service${city ? ` ${city}` : ''}`;
  
  try {
    const raw = execSync(
      `python3 "${SEARCH_SCRIPT}" "${query}" --design-system`,
      {
        timeout: 30000,
        encoding: 'utf-8',
        cwd: join(__dirname, '../prompts/fadekingzz-steering/ui-ux-pro-max'),
      }
    );

    // Parse the structured output
    const colors = parseColors(raw);
    const typography = parseSection(raw, 'TYPOGRAPHY');
    const pattern = parseSection(raw, 'PATTERN');
    const style = parseSection(raw, 'STYLE');
    const effects = parseSection(raw, 'KEY EFFECTS');
    const avoid = parseSection(raw, 'AVOID');

    log.debug('Design system lookup complete', { niche, style: style.substring(0, 50) });

    return {
      pattern,
      style,
      colors,
      typography,
      effects,
      avoid,
      raw,
    };
  } catch (err: unknown) {
    log.warn('Design lookup failed, using fallback', { niche, error: (err as Error).message.substring(0, 100) });
    return getFallbackDesign(niche);
  }
}

function parseColors(raw: string): DesignSystem['colors'] {
  const extract = (label: string): string => {
    const match = raw.match(new RegExp(`${label}:\\s*(#[A-Fa-f0-9]{6})`));
    return match ? match[1] : '#2563EB';
  };

  return {
    primary: extract('Primary'),
    onPrimary: extract('On Primary'),
    secondary: extract('Secondary'),
    accent: extract('Accent/CTA') || extract('Accent'),
    background: extract('Background'),
    foreground: extract('Foreground'),
    muted: extract('Muted'),
    border: extract('Border'),
  };
}

function parseSection(raw: string, sectionName: string): string {
  const regex = new RegExp(`├─── ${sectionName}[^┤]*┤([\\s\\S]*?)(?=├───|└───)`, 'i');
  const match = raw.match(regex);
  if (!match) return '';
  // Clean up box-drawing chars and whitespace
  return match[1]
    .replace(/│/g, '')
    .replace(/^\s+/gm, '')
    .trim();
}

function getFallbackDesign(niche: string): DesignSystem {
  // Niche-specific fallback palettes
  const palettes: Record<string, Partial<DesignSystem['colors']>> = {
    plumber: { primary: '#1e40af', accent: '#ea580c', background: '#f8fafc' },
    electrician: { primary: '#f59e0b', accent: '#1e40af', background: '#fffbeb' },
    dentist: { primary: '#06b6d4', accent: '#0f766e', background: '#f0fdfa' },
    roofer: { primary: '#78350f', accent: '#dc2626', background: '#fef3c7' },
    hvac: { primary: '#0369a1', accent: '#ea580c', background: '#f0f9ff' },
    landscaper: { primary: '#15803d', accent: '#854d0e', background: '#f0fdf4' },
    painter: { primary: '#7c3aed', accent: '#0891b2', background: '#faf5ff' },
    barber: { primary: '#1e293b', accent: '#b91c1c', background: '#f8fafc' },
    restaurant: { primary: '#991b1b', accent: '#ca8a04', background: '#fef2f2' },
    mechanic: { primary: '#374151', accent: '#dc2626', background: '#f9fafb' },
  };

  const colors = palettes[niche.toLowerCase()] || palettes.plumber;

  return {
    pattern: 'Hero + Features + CTA (Conversion-Optimized)',
    style: 'Modern Professional - clean, trustworthy, high-performance',
    colors: {
      primary: colors.primary || '#1e40af',
      onPrimary: '#ffffff',
      secondary: colors.primary || '#1e40af',
      accent: colors.accent || '#ea580c',
      background: colors.background || '#f8fafc',
      foreground: '#0f172a',
      muted: '#64748b',
      border: '#e2e8f0',
    },
    typography: 'Inter / System UI - Professional + Clear',
    effects: 'Subtle hover transitions (200ms), card elevation on hover, smooth scroll',
    avoid: 'Generic templates, placeholder text, broken Unicode icons, dark blue + orange cliche',
    raw: '',
  };
}

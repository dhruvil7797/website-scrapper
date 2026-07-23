import cityTimezones from 'city-timezones';
import { createLogger } from './logger.js';

const log = createLogger('timezone');

/**
 * Detect timezone from city + state/province + country
 */
export function detectTimezone(city: string | null, state: string | null, country: string = 'US'): string | null {
  if (!city) return null;

  try {
    const lookup = cityTimezones.lookupViaCity(city);
    if (lookup && lookup.length > 0) {
      // Filter by country if possible
      const countryCode = country === 'CA' ? 'CA' : 'US';
      const match = lookup.find(l => l.iso2 === countryCode) || lookup[0];
      return match.timezone;
    }
  } catch {
    log.debug('Timezone lookup failed', { city, state, country });
  }

  // Fallback: US state to timezone mapping
  if (country === 'US' && state) {
    return usStateTimezone(state);
  }

  return null;
}

function usStateTimezone(state: string): string | null {
  const eastern = ['CT', 'DE', 'FL', 'GA', 'IN', 'KY', 'ME', 'MD', 'MA', 'MI', 'NH', 'NJ', 'NY', 'NC', 'OH', 'PA', 'RI', 'SC', 'TN', 'VT', 'VA', 'WV', 'DC'];
  const central = ['AL', 'AR', 'IL', 'IA', 'KS', 'LA', 'MN', 'MS', 'MO', 'NE', 'ND', 'OK', 'SD', 'TX', 'WI'];
  const mountain = ['AZ', 'CO', 'ID', 'MT', 'NM', 'UT', 'WY'];
  const pacific = ['CA', 'NV', 'OR', 'WA'];

  const abbr = state.toUpperCase().trim();
  if (eastern.includes(abbr)) return 'America/New_York';
  if (central.includes(abbr)) return 'America/Chicago';
  if (mountain.includes(abbr)) return 'America/Denver';
  if (pacific.includes(abbr)) return 'America/Los_Angeles';
  if (abbr === 'AK') return 'America/Anchorage';
  if (abbr === 'HI') return 'Pacific/Honolulu';
  return null;
}

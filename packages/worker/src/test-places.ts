import { config } from './config.js';
import { createLogger } from './services/logger.js';

const log = createLogger('test-places');

async function main() {
  const apiKey = config.google.apiKeys[0];
  log.info('Testing Places API...', { keyPrefix: apiKey.substring(0, 10) + '...' });
  
  const url = 'https://places.googleapis.com/v1/places:searchText';
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.websiteUri,places.rating,places.userRatingCount',
    },
    body: JSON.stringify({
      textQuery: 'plumber near 78701 US',
      maxResultCount: 5,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    log.error('API failed', { status: res.status, error: err });
    return;
  }

  const data = await res.json() as { places: any[] };
  log.info(`Found ${data.places?.length || 0} places`);
  
  for (const place of (data.places || []).slice(0, 3)) {
    console.log(JSON.stringify({
      name: place.displayName?.text,
      phone: place.nationalPhoneNumber,
      website: place.websiteUri,
      rating: place.rating,
      reviews: place.userRatingCount,
      address: place.formattedAddress,
    }, null, 2));
  }
}

main().catch(e => console.error(e.message));

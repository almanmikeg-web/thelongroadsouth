// ─────────────────────────────────────────────────────────────
// The Long Road South — Location Photo Function
//
// Given a lat/lng (virtual cycling position), this function:
//   1. Reverse geocodes via Nominatim (free, no key needed)
//      → returns precise place name e.g. "Günzburg, Bavaria"
//   2. Builds a smart search query from that place name
//   3. Fetches a beautiful photo from Unsplash
//   4. Returns { placeName, photo: { url, caption, credit } }
//
// Called by the frontend on every page load.
// Cached in browser localStorage to avoid hitting rate limits.
// ─────────────────────────────────────────────────────────────

const UNSPLASH_KEY = process.env.UNSPLASH_ACCESS_KEY;

// Build a good Unsplash search query from a place name + context
function buildSearchQuery(place, country, region) {
  // Strip generic terms that produce bad results
  const skipWords = ['municipality', 'district', 'county', 'province',
    'governorate', 'state', 'oblast', 'region', 'unnamed', 'road', 'street'];

  const parts = [place, region, country]
    .filter(Boolean)
    .filter(p => !skipWords.some(s => p.toLowerCase().includes(s)))
    .slice(0, 2); // keep it focused

  const base = parts.join(', ');

  // Add cycling-relevant context words for better photos
  const contexts = ['landscape', 'countryside', 'travel', 'scenic'];
  const context  = contexts[Math.floor(Math.random() * contexts.length)];

  return `${base} ${context}`;
}

// Reverse geocode lat/lng → place info via Nominatim (OpenStreetMap)
async function reverseGeocode(lat, lng) {
  const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=10&accept-language=en`;

  const res = await fetch(url, {
    headers: {
      'User-Agent': 'TheLongRoadSouth/1.0 (personal cycling journey site)',
    },
  });

  if (!res.ok) throw new Error(`Nominatim error: ${res.status}`);

  const data = await res.json();
  const addr = data.address || {};

  // Build a clean place name from available components
  const place = addr.city || addr.town || addr.village ||
                addr.hamlet || addr.suburb || addr.county || '';

  const region  = addr.state || addr.region || '';
  const country = addr.country || '';

  // Display name — e.g. "Günzburg, Bavaria, Germany"
  const parts = [place, region, country].filter(Boolean);
  const displayName = parts.length > 0
    ? parts.slice(0, 3).join(', ')
    : data.display_name?.split(',').slice(0, 2).join(',').trim() || 'Unknown location';

  return { place, region, country, displayName };
}

// Fetch a photo from Unsplash
async function getUnsplashPhoto(query) {
  if (!UNSPLASH_KEY) throw new Error('UNSPLASH_ACCESS_KEY not set');

  // Use random endpoint so we get variety on repeat visits
  const url = `https://api.unsplash.com/photos/random?query=${encodeURIComponent(query)}&orientation=landscape&content_filter=high`;

  const res = await fetch(url, {
    headers: { Authorization: `Client-ID ${UNSPLASH_KEY}` },
  });

  if (res.status === 404 || res.status === 403) {
    throw new Error(`Unsplash error: ${res.status}`);
  }

  if (!res.ok) throw new Error(`Unsplash error: ${res.status}`);

  const data = await res.json();

  return {
    url:      data.urls?.regular || data.urls?.full,
    thumb:    data.urls?.small,
    caption:  data.alt_description || query,
    credit:   data.user?.name || 'Unsplash',
    creditUrl:data.user?.links?.html,
    unsplashUrl: data.links?.html,
  };
}

// Fallback: try broader search if specific place returns nothing
async function getPhotoWithFallback(place, region, country) {
  const queries = [
    buildSearchQuery(place, country, region),  // specific: "Günzburg, Bavaria landscape"
    `${country} cycling landscape`,             // country: "Germany cycling landscape"
    `${region} scenery`,                        // region: "Bavaria scenery"
    'cycling countryside Europe',               // generic fallback
  ].filter(Boolean);

  for (const query of queries) {
    try {
      const photo = await getUnsplashPhoto(query);
      if (photo?.url) return { photo, query };
    } catch (e) {
      // try next query
      continue;
    }
  }

  throw new Error('No photo found for any query');
}

// ── Main handler ──────────────────────────────────────────────
exports.handler = async (event) => {
  // CORS — allow requests from our site
  const headers = {
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
    'Cache-Control': 'public, max-age=3600', // cache for 1 hour
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  // Get lat/lng from query params
  const params = event.queryStringParameters || {};
  const lat    = parseFloat(params.lat);
  const lng    = parseFloat(params.lng);
  const km     = parseFloat(params.km) || 0;

  if (isNaN(lat) || isNaN(lng)) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: 'lat and lng are required' }),
    };
  }

  try {
    // Step 1: Reverse geocode
    const geo = await reverseGeocode(lat, lng);

    // Step 2: Get photo with fallback chain
    const { photo, query } = await getPhotoWithFallback(
      geo.place, geo.region, geo.country
    );

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        km,
        placeName:   geo.displayName,
        place:       geo.place,
        region:      geo.region,
        country:     geo.country,
        photo,
        searchQuery: query,
      }),
    };

  } catch (err) {
    console.error('location-photo error:', err.message);

    // Return a fallback response rather than erroring
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        km,
        placeName:  'On the road',
        photo:      null,
        error:      err.message,
      }),
    };
  }
};

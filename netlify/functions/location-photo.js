// ─────────────────────────────────────────────────────────────
// The Long Road South — Location Photo Function
//
// Given lat/lng, reverse geocodes via Nominatim then fetches
// a photo from Unsplash (primary) or Pexels (fallback)
// ─────────────────────────────────────────────────────────────

const UNSPLASH_KEY = process.env.UNSPLASH_ACCESS_KEY;
const PEXELS_KEY   = process.env.PEXELS_ACCESS_KEY;

async function reverseGeocode(lat, lng) {
  const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=10&accept-language=en`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'TheLongRoadSouth/1.0 (personal cycling project)' }
  });
  if (!res.ok) throw new Error('Nominatim error: ' + res.status);
  const data = await res.json();
  const addr = data.address || {};
  const place  = addr.city || addr.town || addr.village || addr.county || '';
  const region = addr.state || addr.region || '';
  const country = addr.country || '';
  const parts = [place, region, country].filter(Boolean).slice(0, 3);
  return {
    place, region, country,
    displayName: parts.join(', ') || data.display_name?.split(',').slice(0,2).join(',').trim() || 'On the road'
  };
}

async function getUnsplashPhoto(query) {
  if (!UNSPLASH_KEY) throw new Error('No Unsplash key');
  const url = `https://api.unsplash.com/photos/random?query=${encodeURIComponent(query)}&orientation=landscape&content_filter=high`;
  const res = await fetch(url, {
    headers: { Authorization: `Client-ID ${UNSPLASH_KEY}` }
  });
  if (!res.ok) throw new Error('Unsplash error: ' + res.status);
  const data = await res.json();
  return {
    url:       data.urls?.regular,
    thumb:     data.urls?.small,
    credit:    data.user?.name || 'Unsplash',
    creditUrl: data.user?.links?.html,
  };
}

async function getPexelsPhoto(query) {
  if (!PEXELS_KEY) throw new Error('No Pexels key');
  const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=5&orientation=landscape`;
  const res = await fetch(url, {
    headers: { Authorization: PEXELS_KEY }
  });
  if (!res.ok) throw new Error('Pexels error: ' + res.status);
  const data = await res.json();
  if (!data.photos || data.photos.length === 0) throw new Error('No Pexels results');
  // Pick a random one from the results
  const photo = data.photos[Math.floor(Math.random() * data.photos.length)];
  return {
    url:       photo.src?.large || photo.src?.original,
    thumb:     photo.src?.medium,
    credit:    photo.photographer || 'Pexels',
    creditUrl: photo.photographer_url,
  };
}

async function getPhoto(place, region, country) {
  const queries = [
    `${place} ${country} landscape`.trim(),
    `${region} ${country} scenery`.trim(),
    `${country} cycling landscape`,
    'European cycling landscape',
  ].filter(Boolean);

  for (const query of queries) {
    // Try Unsplash first
    try {
      const photo = await getUnsplashPhoto(query);
      if (photo?.url) return { photo, query, source: 'unsplash' };
    } catch(e) { /* try next */ }

    // Try Pexels
    try {
      const photo = await getPexelsPhoto(query);
      if (photo?.url) return { photo, query, source: 'pexels' };
    } catch(e) { /* try next */ }
  }
  throw new Error('No photo found');
}

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
    'Cache-Control': 'public, max-age=3600',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

  const params = event.queryStringParameters || {};
  const lat = parseFloat(params.lat);
  const lng = parseFloat(params.lng);
  const km  = parseFloat(params.km) || 0;

  if (isNaN(lat) || isNaN(lng)) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'lat and lng required' }) };
  }

  try {
    const geo = await reverseGeocode(lat, lng);
    const { photo, query, source } = await getPhoto(geo.place, geo.region, geo.country);

    return {
      statusCode: 200, headers,
      body: JSON.stringify({ km, placeName: geo.displayName, photo, query, source }),
    };
  } catch(err) {
    console.error('location-photo error:', err.message);
    return {
      statusCode: 200, headers,
      body: JSON.stringify({ km, placeName: 'On the road', photo: null, error: err.message }),
    };
  }
};

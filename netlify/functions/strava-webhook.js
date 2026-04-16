// ─────────────────────────────────────────────────────────────
// The Long Road South — Strava Webhook
// 
// Flow:
//   1. You finish a ride on Strava (phone in pocket)
//   2. Strava POSTs to this function within ~30 seconds
//   3. We fetch the activity details from Strava API
//   4. We read rides.json from your GitHub repo
//   5. We append the new ride and commit it back
//   6. Netlify auto-deploys — site updates within ~60 seconds
//
// Environment variables required (set in Netlify dashboard):
//   STRAVA_CLIENT_ID       — from strava.com/settings/api
//   STRAVA_CLIENT_SECRET   — from strava.com/settings/api
//   STRAVA_REFRESH_TOKEN   — from one-time OAuth flow (see README)
//   STRAVA_VERIFY_TOKEN    — any string you choose (e.g. longroadsouth2026)
//   GITHUB_TOKEN           — Personal Access Token with repo scope
//   GITHUB_REPO            — e.g. yourusername/longroadsouth
//   GITHUB_BRANCH          — e.g. main
// ─────────────────────────────────────────────────────────────

const SPORT_TYPES_ALLOWED = [
  'Ride', 'MountainBikeRide', 'GravelRide', 'EBikeRide', 'VirtualRide'
];

// ── GET: Strava webhook verification handshake ────────────────
async function handleVerification(params) {
  if (params['hub.verify_token'] !== process.env.STRAVA_VERIFY_TOKEN) {
    return { statusCode: 403, body: 'Forbidden' };
  }
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ 'hub.challenge': params['hub.challenge'] }),
  };
}

// ── Get a fresh Strava access token ──────────────────────────
async function getStravaToken() {
  const res = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id:     process.env.STRAVA_CLIENT_ID,
      client_secret: process.env.STRAVA_CLIENT_SECRET,
      refresh_token: process.env.STRAVA_REFRESH_TOKEN,
      grant_type:    'refresh_token',
    }),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error('Failed to get Strava token: ' + JSON.stringify(data));
  return data.access_token;
}

// ── Fetch activity details from Strava ───────────────────────
async function getActivity(activityId, token) {
  const res = await fetch(`https://www.strava.com/api/v3/activities/${activityId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Strava activity fetch failed: ${res.status}`);
  return res.json();
}

// ── Read rides.json from GitHub ──────────────────────────────
async function readRidesFromGitHub() {
  const url = `https://api.github.com/repos/${process.env.GITHUB_REPO}/contents/rides.json?ref=${process.env.GITHUB_BRANCH}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
    },
  });

  if (res.status === 404) {
    // File doesn't exist yet — start fresh
    return { rides: [], sha: null };
  }

  if (!res.ok) throw new Error(`GitHub read failed: ${res.status}`);

  const data = await res.json();
  const content = Buffer.from(data.content, 'base64').toString('utf8');
  return { rides: JSON.parse(content), sha: data.sha };
}

// ── Write rides.json back to GitHub (creates a commit) ───────
async function writeRidesToGitHub(rides, sha, commitMessage) {
  const url = `https://api.github.com/repos/${process.env.GITHUB_REPO}/contents/rides.json`;
  const content = Buffer.from(JSON.stringify(rides, null, 2)).toString('base64');

  const body = {
    message: commitMessage,
    content,
    branch: process.env.GITHUB_BRANCH,
  };

  // sha required when updating an existing file
  if (sha) body.sha = sha;

  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`GitHub write failed: ${res.status} — ${err}`);
  }

  return res.json();
}

// ── Format seconds as "1h 32m" ───────────────────────────────
function formatDuration(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

// ── POST: New Strava activity ─────────────────────────────────
async function handleActivity(body) {
  // Only handle new activity creations
  if (body.aspect_type !== 'create' || body.object_type !== 'activity') {
    return { statusCode: 200, body: 'Not a new activity — ignored' };
  }

  const token      = await getStravaToken();
  const activity   = await getActivity(body.object_id, token);

  // Only log cycling activities
  if (!SPORT_TYPES_ALLOWED.includes(activity.sport_type)) {
    return {
      statusCode: 200,
      body: `Activity type "${activity.sport_type}" not a ride — ignored`,
    };
  }

  // Build the ride entry
  const km = Math.round((activity.distance / 1000) * 10) / 10;
  const newRide = {
    date:      activity.start_date_local.slice(0, 10),
    km,
    strava_id: String(body.object_id),
    note:      '',
    source:    'strava',
  };

  // Read existing rides, check for duplicates
  const { rides, sha } = await readRidesFromGitHub();

  const duplicate = rides.find(r => r.strava_id === newRide.strava_id);
  if (duplicate) {
    return { statusCode: 200, body: `Duplicate — activity ${newRide.strava_id} already logged` };
  }

  // Append and sort by date descending
  rides.push(newRide);
  rides.sort((a, b) => new Date(b.date) - new Date(a.date));

  // Commit to GitHub
  const commitMsg = `🚴 Ride logged: ${newRide.date} — ${newRide.km}km`;
  await writeRidesToGitHub(rides, sha, commitMsg);

  console.log(`✅ Logged ride: ${newRide.date} ${newRide.km}km (${newRide.strava_id})`);

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ logged: true, ride: newRide }),
  };
}

// ── Main handler ──────────────────────────────────────────────
exports.handler = async (event) => {
  try {
    if (event.httpMethod === 'GET') {
      return handleVerification(event.queryStringParameters || {});
    }

    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');
      return handleActivity(body);
    }

    return { statusCode: 405, body: 'Method not allowed' };

  } catch (err) {
    console.error('Webhook error:', err.message);
    // Always return 200 to Strava — otherwise it retries endlessly
    return {
      statusCode: 200,
      body: JSON.stringify({ error: err.message }),
    };
  }
};

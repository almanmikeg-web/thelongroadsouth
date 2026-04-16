# The Long Road South — Setup Guide

## Project structure

```
longroadsouth/
├── index.html                        ← The site (Mapbox version for production)
├── preview.html                      ← The site (Leaflet version, no token needed)
├── rides.json                        ← Your ride data (manual + Strava auto-sync)
├── netlify.toml                      ← Netlify config
└── netlify/functions/
    └── strava-webhook.js             ← Auto-logs Strava rides to rides.json
```

---

## Step 1 — Deploy to Netlify (10 minutes)

1. Create a free account at netlify.com
2. Go to github.com, create a new repo called `longroadsouth`
3. Upload all these files to the repo
4. In Netlify: **Add new site → Import from Git → select your repo**
5. Deploy settings: Build command = *(leave blank)*, Publish directory = `.`
6. Click **Deploy site**

Your site is now live at `https://longroadsouth.netlify.app`

---

## Step 2 — Manual backlog (already done)

Your Jan–Apr 2026 rides are in `rides.json`. To add more manual rides:

1. Open `rides.json` in GitHub (github.com → your repo → rides.json → edit pencil)
2. Add a new entry at the top of the array:
```json
{
  "date": "2026-04-15",
  "km": 55,
  "elevation": 320,
  "duration": "1h 45m",
  "strava_id": "",
  "note": "Your note here.",
  "source": "manual"
}
```
3. Click **Commit changes** — site auto-deploys in ~60 seconds

That's it. No code, no terminal, just editing a text file.

---

## Step 3 — Strava auto-sync setup (30 minutes, done once)

### 3a — Create your Strava API app

1. Go to **strava.com/settings/api**
2. Fill in:
   - Application Name: `The Long Road South`
   - Category: `Other`
   - Club: *(leave blank)*
   - Website: `https://longroadsouth.netlify.app`
   - Authorization Callback Domain: `longroadsouth.netlify.app`
3. Click **Save** — you'll see your **Client ID** and **Client Secret**
4. Copy both — you'll need them in step 3c

### 3b — Create a GitHub Personal Access Token

1. Go to **github.com → Settings → Developer settings → Personal access tokens → Tokens (classic)**
2. Click **Generate new token (classic)**
3. Name: `longroadsouth-webhook`
4. Expiration: No expiration (or 1 year)
5. Scopes: tick **repo** only
6. Click **Generate token** — copy it immediately (shown once only)

### 3c — Add environment variables in Netlify

Go to **Netlify → your site → Site configuration → Environment variables** and add:

| Variable | Value |
|---|---|
| `STRAVA_CLIENT_ID` | From step 3a |
| `STRAVA_CLIENT_SECRET` | From step 3a |
| `STRAVA_VERIFY_TOKEN` | `longroadsouth2026` (or any string you choose) |
| `STRAVA_REFRESH_TOKEN` | From step 3d below |
| `GITHUB_TOKEN` | From step 3b |
| `GITHUB_REPO` | `yourusername/longroadsouth` |
| `GITHUB_BRANCH` | `main` |

### 3d — Get your Strava refresh token (one-time OAuth)

**In your browser**, visit this URL (replace YOUR_CLIENT_ID):
```
https://www.strava.com/oauth/authorize?client_id=YOUR_CLIENT_ID&redirect_uri=https://longroadsouth.netlify.app&response_type=code&scope=activity:read_all
```

1. Click **Authorize**
2. You'll be redirected to your site — look at the URL in your browser
3. Copy the `code=XXXXXX` value from the URL

**In your terminal** (or use an online curl tool like reqbin.com):
```bash
curl -X POST https://www.strava.com/oauth/token \
  -d client_id=YOUR_CLIENT_ID \
  -d client_secret=YOUR_CLIENT_SECRET \
  -d code=CODE_FROM_ABOVE \
  -d grant_type=authorization_code
```

The response will include `"refresh_token": "abc123..."` — add that to Netlify env variables as `STRAVA_REFRESH_TOKEN`.

### 3e — Register the Strava webhook

Run this once (replace values):
```bash
curl -X POST https://www.strava.com/api/v3/push_subscriptions \
  -F client_id=YOUR_CLIENT_ID \
  -F client_secret=YOUR_CLIENT_SECRET \
  -F callback_url=https://longroadsouth.netlify.app/.netlify/functions/strava-webhook \
  -F verify_token=longroadsouth2026
```

If successful you'll see `{"id": 12345}` — done.

---

## Step 4 — Test it

1. Go for a ride tomorrow with Strava running on your phone
2. Finish the ride and press stop
3. Within ~60 seconds, check your GitHub repo — you should see a new commit: `🚴 Ride logged: 2026-04-15 — 55.2km`
4. Within ~90 seconds, your site updates with the new ride

---

## Day-to-day workflow

**For Strava rides (from tomorrow):**
- Just ride. Nothing else to do.

**For manual entries (if Strava fails):**
- Edit `rides.json` in GitHub and add a line. 60 seconds to live.

**To add a journal note to any ride:**
- Edit `rides.json`, find the ride by date, add text to the `"note"` field.

**To update your km total on the map:**
- The site reads `rides.json` and calculates everything automatically.

---

## Troubleshooting

**Webhook not firing?**
- Check Netlify function logs: Netlify → your site → Functions → strava-webhook → Logs
- Make sure the webhook is registered (step 3e)

**GitHub commit not happening?**
- Check that `GITHUB_TOKEN` has `repo` scope
- Check that `GITHUB_REPO` is exactly `username/reponame` (no https://, no .git)

**Strava token expired?**
- The function auto-refreshes the token on every call — this shouldn't happen

---

## Adding your Mapbox token (for the premium globe map)

1. Sign up free at mapbox.com
2. Copy your public access token from mapbox.com/account/access-tokens
3. Open `index.html`, find line with `mapboxgl.accessToken =`
4. Replace the placeholder with your token
5. Commit — done

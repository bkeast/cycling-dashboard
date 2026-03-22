# Cycling Health Dashboard

Road cycling · body recomposition tracker with Strava integration.

## Setup (follow these steps in order)

### 1. GitHub
1. Go to github.com and create a free account if you don't have one
2. Click the "+" icon → "New repository"
3. Name it: `cycling-dashboard`
4. Set to **Public**
5. Click "Create repository"
6. Upload all files from this folder (drag and drop onto the GitHub page)

### 2. Vercel
1. Go to vercel.com → Sign up with your GitHub account
2. Click "Add New Project"
3. Select your `cycling-dashboard` repository
4. Click "Deploy" (defaults are fine)
5. Once deployed, copy your app URL (e.g. `https://cycling-dashboard-xyz.vercel.app`)

### 3. Environment Variables (in Vercel)
In your Vercel project → Settings → Environment Variables, add:
- `STRAVA_CLIENT_ID` = `214744`
- `STRAVA_CLIENT_SECRET` = `02e0557440d7a84cf2503f5d942324c45d742912`

### 4. Update Strava API Settings
Go to strava.com/settings/api and update:
- **Website**: your Vercel app URL
- **Authorization Callback Domain**: your Vercel domain (just the domain, no https://)

### 5. Done!
Visit your Vercel app URL and click "Connect with Strava"

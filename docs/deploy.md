# Deploying Cloqui

Everything here runs on free tiers (numbers as of October 2026; providers change them, so check
each pricing page). Nothing below costs money unless you go over a free-tier limit
(see [limits.md](limits.md)), and every service lets you set a budget alert. **Set those first.**

The repo has a manual deploy workflow (`.github/workflows/deploy.yml`). It only runs when you
start it from **Actions → Deploy → Run workflow**, and it stops at its first step until the
settings below exist.

## 1. Accounts only you can create

| Service | What it's for | Free tier | What to copy out |
| --- | --- | --- | --- |
| [Supabase](https://supabase.com) | Database, sign-in, realtime | 2 projects, 500 MB DB, 50k monthly users. Free projects pause after 7 days without traffic. | Project URL, anon key, service-role key, pooler connection string (port 6543) |
| [Google Cloud](https://console.cloud.google.com) | Runs the app (Cloud Run) and the video worker (Cloud Run Jobs) | 2M requests and 180k vCPU-seconds a month | Project ID, region (e.g. `asia-southeast1`) |
| [Cloudflare R2](https://dash.cloudflare.com) | Private video and file storage | 10 GB stored, no egress fees | Account ID endpoint, an API token with read/write on one bucket |
| [LiveKit Cloud](https://cloud.livekit.io) | Live rooms and huddles | Free "Build" plan (limited participant minutes) | WebSocket URL, API key, API secret |
| [Resend](https://resend.com) | Invite and notification email | 3,000 emails a month, 100 a day | API key, and a verified sending domain |

Google and Microsoft sign-in are optional. If you want them, create OAuth clients and paste the
IDs into Supabase → Authentication → Providers.

## 2. Set up each service

**Supabase**

1. Create a project in the region closest to your team.
2. Authentication → URL configuration: set Site URL to your app URL and add
   `https://<your-domain>/auth/confirm` and `/auth/callback` to the redirect list.
3. Authentication → Multi-factor: make sure TOTP is on (it is by default).
4. Leave email confirmations on.

**Cloudflare R2**

1. Create a bucket named `cloqui-media`. Keep public access **off**: Cloqui only uses signed links.
2. Create an API token scoped to that bucket with Object Read & Write.
3. Add a CORS rule that allows `PUT` and `GET` from your app's origin only (uploads go straight
   from the browser to R2).

**Google Cloud**

1. Create a project and enable Cloud Run, Artifact Registry, Secret Manager, Cloud Scheduler and
   IAM Credentials APIs.
2. Create an Artifact Registry Docker repo named `cloqui` in your region.
3. Set up Workload Identity Federation for this GitHub repo (keyless: no service-account key
   ever leaves Google). Give the deploy service account Cloud Run Admin, Artifact Registry Writer,
   Secret Manager Secret Accessor and Service Account User.
4. Add these secrets in Secret Manager:
   `supabase-service-role`, `database-url`, `r2-access-key-id`, `r2-secret-access-key`,
   `livekit-api-key`, `livekit-api-secret`, `resend-api-key`, `cron-secret`
   (make `cron-secret` a long random string, e.g. `openssl rand -hex 32`).
5. Set a budget alert at a small amount, like $1.

## 3. GitHub settings

In the repo: Settings → Environments → create `production`. Then add:

**Variables** (not secret, but kept out of the code):
`GCP_PROJECT_ID`, `GCP_REGION`, `GCP_WIF_PROVIDER`, `GCP_DEPLOY_SA`, `NEXT_PUBLIC_APP_URL`,
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_LIVEKIT_URL`,
`S3_ENDPOINT`, `EMAIL_FROM`

**Secrets**: `SUPABASE_DB_URL` (the direct connection string, used only to apply migrations).

## 4. Deploy

Actions → Deploy → Run workflow. It applies migrations, builds both images, and deploys:

- `cloqui-web`: the app, a Cloud Run service that scales to zero.
- `cloqui-media`: the video worker, a Cloud Run Job that makes playback files and thumbnails.

## 5. Scheduled jobs (Cloud Scheduler)

| Job | Schedule | Target |
| --- | --- | --- |
| Video processing | every 2 minutes | Run the `cloqui-media` job |
| Task reminders | every 15 minutes | `POST https://<app>/api/cron/reminders` with header `Authorization: Bearer <cron-secret>` |
| Retention | daily | `POST https://<app>/api/cron/retention` with the same header |

The free tier includes 3 Scheduler jobs, which is exactly these three.

## 6. Backups

- Supabase free projects get daily backups kept for a short time, and you can't restore them
  yourself. Until you're on Pro, take your own: `supabase db dump --db-url "$SUPABASE_DB_URL" -f backup.sql`
  once a week, and keep the file somewhere private.
- R2 has no automatic backups. Videos are the originals people uploaded; if losing one would
  hurt, keep a copy elsewhere.
- Test a restore once, into a scratch Supabase project, before you need it.

## 7. Before you invite real people

- [ ] Budget alerts set on Google Cloud and Cloudflare.
- [ ] Privacy policy reviewed by someone qualified ([privacy-policy-draft.md](privacy-policy-draft.md)).
- [ ] Sign up, invite a second account, and check that it can't see anything it wasn't given.
- [ ] Turn on two-step sign-in for your own account.

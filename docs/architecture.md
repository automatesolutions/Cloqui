# Architecture

```
Browser (Next.js app, MediaRecorder, LiveKit client)
   │  HTTPS
   ▼
Cloud Run: "web" (Next.js 16 App Router, server actions + route handlers)
   │                 │                    │                 │
   ▼                 ▼                    ▼                 ▼
Supabase          Supabase           Cloudflare R2      LiveKit Cloud
Postgres + RLS    Auth + Realtime    (private bucket,   (live rooms,
(Drizzle)         (presence, chat)   signed URLs only)  huddles)
   ▲
   │  job rows / Cloud Tasks
Cloud Run Job: "media" (ffmpeg: WebM → MP4, thumbnails; transcription behind a flag)
```

## Request path and access checks

1. `src/proxy.ts` refreshes the Supabase session cookie and redirects signed-out people away from app routes. It's an optimistic check only.
2. Every server action, route handler and data function calls the data access layer in `src/server/`. It resolves the current user from the session and calls `can(user, action, item)`.
3. Queries run through an RLS-aware Drizzle client: each request runs in a transaction with `set local role authenticated` and the user's JWT claims. Postgres row-level security then filters rows again. A missed `can()` check still can't return rows the user isn't allowed to see.
4. Files (videos, attachments) are never public. The server checks access, then issues an R2 signed URL that lives for `SIGNED_URL_TTL_SECONDS` (default 300).

## Next.js 16 notes

- `cacheComponents` and `partialPrefetching` are on. Anything that reads the session (cookies) renders inside a `<Suspense>` boundary. Cached functions take a user id, never a raw session or email (cache keys are stored in plain text).
- `proxy.ts` replaces `middleware.ts`.
- Bundled docs live in `node_modules/next/dist/docs`. Check them before using a Next.js API.

## Hosting (GCP)

- `web`: Cloud Run service built from the repo `Dockerfile` (Next.js standalone output). It scales to zero.
- `media`: Cloud Run Job with ffmpeg, triggered per upload.
- Images live in Artifact Registry. Deploys run from GitHub Actions on `main` through Workload Identity Federation, with no long-lived keys.
- Secrets live in Secret Manager and are mounted as env vars.

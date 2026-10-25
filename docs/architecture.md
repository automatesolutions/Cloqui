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

## Videos

**Who can see a video** is decided by one Postgres function, `public.video_role(id)`, which returns `owner`, `editor`, `viewer` or nothing. RLS policies and the app both call it.

- **Owner:** always has access.
- **Grants:** access goes to an account (`user_id`), or to an email with no account yet. That grant follows the person once they sign up with that email.
- **Workspace-visible videos:** add "viewer" for full workspace members. Guests never get this.
- **End date:** `access_expires_at` cuts off everyone except the owner.
- **Admins:** workspace admins do **not** see private videos. They see the audit trail only.
- **Passcode:** checked on top of the role. Unlocks are stored per person and per passcode version, so changing the passcode locks everyone out again.

**Recording and upload:**

1. The browser records with `MediaRecorder` (WebM or MP4, depending on the browser).
2. A server action creates the video row and returns a presigned PUT URL (15 minutes). The browser uploads straight to the private bucket.
3. A second action checks the object exists, sets `status = processing`, and queues a `media_jobs` row.
4. Until the worker runs, the original file plays in browsers that support it.

**Media worker** (`media/worker.ts`, a Cloud Run Job in production, `pnpm worker` locally):

- Claims jobs with `FOR UPDATE SKIP LOCKED`, so several workers never take the same job.
- `process` jobs: transcode to H.264/AAC MP4 with faststart, apply non-destructive trim points, cut a thumbnail, and measure duration and size.
- `thumbnail` jobs: cut the frame the owner picked.
- Optional captions run whisper.cpp when `TRANSCRIPTION_ENABLED=true`.
- Failures retry up to 3 times with backoff, then the video is marked `failed`. The original stays playable.

**Playback:**

- The page issues signed GET URLs (5 minutes) for video, poster and captions after re-checking access.
- The player renews them a minute before expiry through `GET /api/videos/[id]/playback`, which checks access again.
- So removing someone's access stops their open player at the next renewal, at most 5 minutes later.

**Bucket layout:** `ws/<workspace>/videos/<video>/{original.webm, playback.mp4, thumb.jpg, thumb-custom.jpg, captions.vtt}`.

## Live rooms

- **Media:** runs on LiveKit (a WebRTC server; the dev server locally, LiveKit Cloud or self-hosted in production). The LiveKit room name is our room id.
- **Who may join:** decided by `public.live_room_role(id)`, which returns `host`, `cohost`, `participant` or nothing. Invites go to accounts or emails; "everyone in the workspace" is optional.
- **Join flow:**
  1. The client calls `joinAction`, which runs `tokenFor()`.
  2. Hosts get a token straight away. Others are queued by `request_live_admission()`: waiting, admitted, denied or removed.
  3. Waiting clients poll every 2.5 s and connect once admitted.
- **Host controls** go through LiveKit's server API: remove participant, mute published microphone tracks, delete room. Lock and end are stored in Postgres too, so they hold for future joins.
- **Live now:** connected clients send a heartbeat every minute. A room counts as live if someone sent one in the last 2 minutes.

## Next.js 16 notes

- `cacheComponents` and `partialPrefetching` are on. Anything that reads the session (cookies) renders inside a `<Suspense>` boundary. Cached functions take a user id, never a raw session or email (cache keys are stored in plain text).
- `proxy.ts` replaces `middleware.ts`.
- Bundled docs live in `node_modules/next/dist/docs`. Check them before using a Next.js API.

## Hosting (GCP)

- `web`: Cloud Run service built from the repo `Dockerfile` (Next.js standalone output). It scales to zero.
- `media`: Cloud Run Job with ffmpeg, triggered per upload.
- Images live in Artifact Registry. Deploys run from GitHub Actions on `main` through Workload Identity Federation, with no long-lived keys.
- Secrets live in Secret Manager and are mounted as env vars.

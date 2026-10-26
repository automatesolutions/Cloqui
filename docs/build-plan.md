# Cloqui build plan

Status: Phases 0 through 6 built (2026-10-26). Deploying needs the accounts in [deploy.md](deploy.md), which only Jonel can create.

After Phase 6 (2026-10-26):

- Public links for videos, at Jonel's request. They change the original "nothing is public" rule for videos only. Each link is off until the video's owner turns it on, workspace admins can block them, and every check sits in one database rule. Details in [security.md](security.md#videos-and-sharing).
- The recorder preview shows the shared screen. The Share panel has "Copy link".

Phase 6 changes from the plan:

- Export is a JSON file, not a zip, and doesn't include video files (people download those from each video). A zip with files comes later.
- The session list shows your own sessions. Admins can't sign a specific member out of their devices; removing them from the workspace cuts access at once. Coming later.
- Handing a workspace to a new owner isn't built yet. Coming later; until then, an owner with other members in the workspace can't delete their account.
- The `impeccable` skill isn't installed, so the polish pass was done by hand against `/cloqui-design` and `/hig` (summary in the "performance, polish, docs" commit). Installing it is your call.
- `/tweak` is built (dev-only panel, Bake with contrast checks). The final visual pass with it is yours to do by eye: I haven't changed any colours with it.
- Two of the three GSAP moments (landing hero, onboarding) became CSS keyframes with the same look, because the hero headline was waiting on JavaScript. GSAP remains for the recording countdown.

Phase 5 changes from the plan:

- Lists can link to a channel. Tasks made from a chat message link to that message and its channel.
- Due-date reminders compare dates in UTC. Per-workspace time zones come later.
- Automations ("when status changes to X, notify Y") stay in Phase 6, as planned.

Phase 4 changes from the plan:

- Guests can be added to channels by the rules, but the chat screens live inside the workspace shell, which guests can't open. Guest chat screens come later.
- Message lists refetch through server actions on each realtime event (simple and always access-checked), rather than applying change rows directly.

Phase 3 changes from the plan:

- Recording live rooms to the library is marked "Coming later" in the UI. It needs LiveKit Egress: we check the free tier and ask before anything paid.
- Production needs a LiveKit project, either LiveKit Cloud's free tier or self-hosted. That's a sign-up only Jonel can do, at deploy time.

Phase 2 changes from the plan:

- Uploads are a single presigned PUT (up to 2 GB), retried from the start if they fail. Resumable multipart uploads come later.
- "Use this frame as thumbnail" is cut by the worker on the server, not drawn in the browser. That avoids needing CORS on the private bucket.
- Transcription is wired up (whisper.cpp in the worker, captions in the player) but off until `TRANSCRIPTION_ENABLED=true` plus a model are configured. Jonel said "proceed all": phases run back to back, stopping only for paid services or accounts only Jonel can create. Each step ends with lint, type-check and tests passing.

## Architecture at a glance

```
Browser (Next.js app, MediaRecorder, LiveKit client)
   │  HTTPS
   ▼
Cloud Run: "web" (Next.js App Router, server actions + route handlers)
   │                 │                    │                 │
   ▼                 ▼                    ▼                 ▼
Supabase          Supabase           Cloudflare R2      LiveKit Cloud
Postgres + RLS    Auth + Realtime    (private bucket,   (live rooms,
(Drizzle)         (presence, chat)   signed URLs only)  huddles)
   ▲
   │  job rows / Cloud Tasks
Cloud Run Job: "media" (ffmpeg: WebM → MP4, thumbnails; transcription behind a flag)
```

### Decisions (and why)

| Area                 | Choice                                                                                                                                                                                                                                                                             | Why                                                                                                                                                                                                                                                                                                     |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| App                  | Next.js (App Router) + TypeScript, `pnpm`                                                                                                                                                                                                                                          | Your stack choice. One app serves the landing page and the product.                                                                                                                                                                                                                                     |
| Hosting              | **Cloud Run** (`web` service) + **Cloud Run Job** (`media`), images in Artifact Registry, deploys from GitHub Actions                                                                                                                                                              | Scales to zero, so it fits the free tier. ffmpeg needs a container, which Cloud Run handles well.                                                                                                                                                                                                       |
| Database             | Supabase Postgres + **Drizzle**                                                                                                                                                                                                                                                    | Typed queries and plain SQL migrations. RLS policies live in migrations next to the tables.                                                                                                                                                                                                             |
| Access control       | **Two layers.** (1) A server-side `can(user, action, item)` check in every route and action. (2) Postgres RLS as a backstop: Drizzle runs each request in a transaction with `set local role authenticated` and the user's JWT claims, so a forgotten check still can't leak rows. | Part 4 asks for checks on every query. Two independent layers mean one bug isn't a leak.                                                                                                                                                                                                                |
| Auth                 | Supabase Auth: email + password, magic link, Google, Microsoft, TOTP 2FA                                                                                                                                                                                                           | All built in and free. SAML SSO is a paid Supabase feature, so it's marked "Coming later".                                                                                                                                                                                                              |
| Realtime             | Supabase Realtime: Broadcast for typing, Presence for online/away, Postgres Changes for new messages (respects RLS)                                                                                                                                                                | Free, already in the stack, no extra service.                                                                                                                                                                                                                                                           |
| Live rooms + huddles | **LiveKit Cloud (free tier)**                                                                                                                                                                                                                                                      | Production-grade WebRTC SFU with open-source SDKs and React components. Server-issued tokens fit invite-only rooms, and waiting rooms map onto its permissions API. We can self-host it later with no code changes. Alternatives: Daily (closed source), raw WebRTC mesh (breaks down above ~4 people). |
| Video storage        | Cloudflare R2, private bucket, uploads via presigned multipart PUT, playback via **5-minute signed GET URLs** issued only after an access check                                                                                                                                    | No egress fees. No permanent public storage URL ever exists (public links still play through signed URLs).                                                                                                                                                                                              |
| Processing           | `media` job: WebM → H.264 MP4 (Safari plays it), poster frame, duration                                                                                                                                                                                                            | MediaRecorder output isn't portable on its own.                                                                                                                                                                                                                                                         |
| Transcription        | **Off by default** behind the `TRANSCRIPTION_ENABLED` flag. First option: whisper.cpp inside the `media` job (no per-minute bill).                                                                                                                                                 | Keeps us on free tiers. Captions also cover accessibility.                                                                                                                                                                                                                                              |
| Email                | Resend (free tier)                                                                                                                                                                                                                                                                 | Invites, magic links, notifications.                                                                                                                                                                                                                                                                    |
| Rate limiting        | Postgres-backed token bucket (`rate_limits` table) to start                                                                                                                                                                                                                        | Free and no extra service. Swap to Redis if it becomes hot.                                                                                                                                                                                                                                             |
| Search               | Postgres full-text search (`tsvector`) on messages, tasks and video titles/transcripts, filtered by access                                                                                                                                                                         | No extra service. Results respect RLS.                                                                                                                                                                                                                                                                  |
| Tests                | Vitest (unit + **permission tests against a real local Postgres with RLS**), Playwright (end to end, plus axe accessibility checks)                                                                                                                                                | Part 4: prove that uninvited people can't see things.                                                                                                                                                                                                                                                   |
| CI                   | GitHub Actions: lint, type-check, Vitest, Playwright, build. Deploy on `main`.                                                                                                                                                                                                     |                                                                                                                                                                                                                                                                                                         |

### Honesty notes (go into `docs/security.md` and the UI)

- **Encryption:** "Encrypted in transit and at rest" (TLS; Supabase and R2 encrypt at rest). Not end-to-end.
- **View-only:** hides download and blocks easy right-click saving. It can't stop screen capture, and the share panel says so.
- **Watermark:** a moving overlay with the viewer's email, drawn by the player. It discourages leaks but doesn't make them impossible.
- **Free tiers have limits:** Supabase pauses idle free projects, and LiveKit/R2/Resend have monthly caps. Before launch, `docs/limits.md` lists each limit and what happens when we hit it.

### Repo layout

```
src/app/(marketing)/      landing page
src/app/(auth)/           sign in, sign up, magic link, 2FA
src/app/(app)/[workspace]/home | library | v/[id] | live/[id] | chat | tasks | settings
src/server/authz/         can(), roles, item access (the single source of permission logic)
src/server/db/            Drizzle schema, RLS-aware client
src/components/ui/        shadcn components restyled to /cloqui-design
src/components/privacy/   AccessChip, WhoCanSee panel, AccessDenied, RecordingPill
supabase/migrations/      SQL incl. RLS policies
media/                    Dockerfile + ffmpeg worker
tests/permissions/        "uninvited person can't…" suites
docs/                     architecture, security, design, limits
```

## Phase 0: Foundation and landing page

1. **Repo.** `git init` (the GitHub repo must be **private** because of the font licence), Next.js + TS + Tailwind + ESLint + Prettier, `pnpm`, `.env.example` with every variable explained, `.gitignore`.
2. **Design tokens in code.** CSS variables from `/cloqui-design`, Tailwind theme mapping, self-hosted fonts via `next/font/local` (not subset), dark/light theme with the system default and a switch, `prefers-reduced-motion`.
3. **Components.** shadcn/ui init, restyle Button, Input, Dialog, Dropdown, Tooltip, Toast, Avatar, Badge. Build `AccessChip`, `RecordingPill`, `AccessDenied`. Licences go in `docs/design/components.md`.
4. **Local backend.** Supabase CLI as a dev dependency, `supabase start` in Docker, Drizzle wired up. Vitest + Playwright + axe set up, plus a CI workflow.
5. **Landing page.** Hero (one GSAP reveal), "how sharing works", three feature blocks (Record, Talk, Track), trust line, footer with an honest security note. `noindex` on everything except the landing page. Mobile first.
6. **Docs.** README (setup in under 10 steps), `docs/architecture.md`, `docs/security.md`, `docs/design/`.
7. **Polish.** `impeccable` audit if installed (I'll check and ask first), `/hig` checklist, before/after summary.

**You'll need to:** create a private GitHub repo (or I can run `gh repo create --private` with your OK).

## Phase 1: Auth, workspaces, roles, invites, app shell

1. Schema: `users`, `workspaces`, `workspace_members` (owner/admin/member/guest), `invites`, `audit_events`. RLS on every table from the first migration.
2. Auth screens: sign up (strong password rules + breach check via Supabase), sign in, magic link, Google and Microsoft OAuth, email verification, sign out.
3. `src/server/authz`: `can()` and the RLS-aware DB client. **Permission test harness** with seeded users: owner, member, guest, outsider.
4. Onboarding: create workspace, invite people by email (Resend), accept invite, domain-restricted sign-up option.
5. App shell: sidebar (collapsible), top bar, mobile tab bar, command palette, theme switch, empty Home.
6. Security basics: CSRF (server actions + origin checks), CSP headers, rate limiting on auth and invites, Zod validation on every input, log redaction.

**You'll need to:** create a Supabase project and Google/Microsoft OAuth apps (I'll write step-by-step guides), plus a Resend account.

## Phase 2: Recording, private library, sharing, audit log, comments

1. Recorder: screen / camera / both, draggable camera bubble (canvas compositing), mic, 3-2-1 countdown (GSAP), pause/resume, "You are recording" pill, stop and save.
2. Upload: presigned multipart to R2 with resume on failure. A `media` Cloud Run Job transcodes and makes a thumbnail. Processing state shown in the UI.
3. Library and video page: player (signed 5-minute URLs, refreshed while watching), title/description, trim (non-destructive in/out points, then a re-encode), custom thumbnail.
4. **Who can see this:** item grants (Owner/Editor/Viewer/Guest), invite by email or member, expiry, remove access, view-only, passcode (argon2), watermark. Request-access flow with notification.
5. Audit log per item (viewed, shared, role changed, removed) for owners and admins.
6. Timestamped comments and emoji reactions.
7. Transcription behind the flag: whisper.cpp in the `media` job, captions (WebVTT) in the player.
8. **Permission tests:** an outsider, an expired guest, a removed viewer, and a wrong passcode all get "You don't have access". Signed URLs aren't issued to them.

**You'll need to:** create an R2 bucket + API token and a GCP project with billing enabled (Cloud Run needs a billing account even on the free tier). I'll set budget alerts at $1 and $5.

## Phase 3: Live rooms

1. LiveKit token service: tokens only for invited people, with short TTLs.
2. Waiting room: the host admits or declines. Host controls: remove, lock, mute all.
3. Room UI: grid/speaker layouts, screen share, camera/mic, in-room chat, "Live · 4 people" pill.
4. Optional recording to the host's private library (LiveKit Egress → R2). **I'll check whether the free tier includes Egress first, and ask before anything paid.**
5. Permission tests: an uninvited person can't get a token; a removed person is disconnected right away.

**You'll need to:** create a LiveKit Cloud project (free).

## Phase 4: Team chat

1. Channels (workspace-visible and private), DMs, group DMs. Membership drives RLS.
2. Messages: threads, replies, @mentions (@person, @channel), reactions, attachments (R2, signed), pins, edit/delete.
3. Realtime: new messages, typing, presence, unread badges, per-channel notification settings.
4. Search (Postgres FTS, access-filtered).
5. Huddles (reuse Phase 3), video cards (playable only by channel members who also have access; others see "You don't have access").
6. Permission tests: a non-member can't read, search, or get realtime events from a private channel.

## Phase 5: Tasks

1. Hierarchy: Space > List > Task > Subtask. Custom statuses per list.
2. Fields: rich text (Tiptap), assignees, priority, dates, labels, estimates, checklists, attachments, comments, activity history.
3. Views: List, Board (drag and drop with dnd-kit, keyboard accessible), Calendar, Timeline. Saved filters.
4. Task detail drawer. Chat message → task, video → task, task ↔ channel link.
5. Notifications: assignment, mentions, due soon, overdue (a scheduled Cloud Run Job).
6. Permission tests for every view and the search.

## Phase 6: Admin, hardening, polish

1. Admin panel: members, roles, invites, domain rules, session list, sign out everywhere.
2. Required/optional TOTP 2FA, retention rules, export (zip), delete account/workspace.
3. Automations: "when status changes to X, notify Y".
4. Performance (Lighthouse, bundle size, DB indexes), full accessibility audit (axe + keyboard + screen reader pass).
5. `impeccable` polish pass, then build `/tweak` (slider panel + "Bake") and run the final visual pass.
6. Launch checklist: `docs/limits.md`, backups, budget alerts, privacy policy draft (marked for your legal review).

## Paid-service checkpoints (I'll stop and ask)

- LiveKit Egress, if it's not on the free tier (Phase 3).
- Hosted transcription, if whisper.cpp is too slow on Cloud Run (Phase 2).
- Supabase Pro, if we need SAML SSO or to avoid free-project pausing (launch).

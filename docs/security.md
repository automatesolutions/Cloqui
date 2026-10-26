# Security notes

What Cloqui protects, how, and what it does **not** claim. Keep this honest. If something here stops being true, fix the code or fix this page.

## What we claim

- **Encrypted in transit and at rest.** TLS everywhere. Supabase Postgres and Cloudflare R2 encrypt stored data.
- **Private by default.** Every item URL requires a signed-in, invited person. The one exception is a video's public link, which is off until its owner turns it on and which workspace admins can block.
- **Short-lived playback links.** Video and file URLs are R2 signed URLs that expire after 5 minutes by default.

## What we don't claim

- **Not end-to-end encrypted.** The server can read content in order to process it (thumbnails, transcripts, search). The UI and the landing page say so.
- **View-only can't stop screen capture.** It hides downloads and blocks easy saving. The share panel says this plainly.
- **Watermarks discourage leaks; they don't prevent them.** The moving overlay shows the viewer's email.
- **SAML SSO is "Coming later".** It needs a paid Supabase plan.

## Controls

| Control                                | Where                                                                                                                                       |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Access check on every action and query | `can()` in `src/server/authz`, plus Postgres RLS (two independent layers)                                                                   |
| Permission tests                       | `tests/permissions/`: outsider, removed, expired and wrong-passcode cases for every item type                                               |
| Passwords                              | Minimum 10 characters with upper, lower and digits; email confirmation; re-authentication before a password change (`supabase/config.toml`) |
| 2FA                                    | TOTP via Supabase Auth                                                                                                                      |
| CSRF                                   | Server actions check the Origin header (built in). Route handlers that change data check Origin too.                                        |
| XSS                                    | React escaping, no `dangerouslySetInnerHTML` on user content, rich text sanitized on the server, CSP (see below)                            |
| Input validation                       | Zod schemas on every server action and route handler                                                                                        |
| Rate limiting                          | Supabase Auth limits, plus a Postgres token bucket on invites, access requests and uploads                                                  |
| Secrets                                | Env vars only (Secret Manager in production). `.env*` is ignored except `.env.example`.                                                     |
| Logs                                   | No tokens, passwords, passcodes, signed URLs or message content in logs                                                                     |
| Indexing                               | `noindex` on everything except the landing page                                                                                             |

## Videos and sharing

- **Private by default.** A new video is visible only to its owner. Sharing means naming people, turning on "everyone in the workspace", or turning on a public link.
- **One access rule in the database.** `public.video_role()` backs both RLS and the app. Permission tests cover the outsider, colleague, admin, guest, removed, expired, passcode and deleted cases (`tests/permissions/videos.test.ts`).
- **Short-lived links.** Video and image URLs are signed for 5 minutes and renewed only after a fresh access check. A copied link stops working within minutes.
- **Passcodes** are stored as scrypt hashes, compared in constant time, and rate limited to 5 tries and then 1 every 5 minutes. Wrong attempts are logged.
- **Access requests** can't be used to probe for videos: asking about an id that doesn't exist looks the same as asking about one that does. A denied person only learns the owner's first name.
- **Audit trail per video:** uploads, views (at most one logged per person every 30 minutes), sharing changes, requests and passcode failures. Visible to the owner and workspace admins. Nobody can edit it.
- **Public links (opt-in, videos only).** Added 2026-10-26 at Jonel's request. How they're kept narrow:
  - Off for every video until its owner turns one on, after a confirm dialog. Only the owner can turn it on or read the link.
  - Workspace admins can block public links in Security settings (on by default). Blocking stops every link at once and deletes them, including links on private videos the admin can't see. Allowing them again doesn't bring old links back.
  - The link is a random 256-bit token at `/p/<token>`, separate from the video's normal `/v/<id>` address. Turning it off and on again makes a new token. It's stored in `video_public_links`, which only the owner can read under RLS (people the video is shared with can see the `videos` row, so the token isn't kept there). It is stored in plain text so the owner can copy it again, so anyone with database access could read it.
  - One rule decides whether a link works: `public.public_video_id()`. It checks the link exists, the video isn't deleted or still uploading, the workspace allows public links and the access end date hasn't passed. It isn't granted to `anon` or `authenticated`; only the server calls it.
  - Public viewers can only watch: no comments, reactions, download button, share list or other viewers' names. Playback still uses 5-minute signed URLs, renewed only after the rule passes again, so turning a link off stops open players within minutes.
  - A passcode applies to public viewers too. A correct passcode gives that browser tab a random unlock token (12 hours, hash stored, tied to the video and the passcode version). Tries are rate limited per visitor.
  - Visitors have no account, so rate limits and view logs use a hash of their IP address (the last `X-Forwarded-For` entry, which Cloud Run sets), never the address itself. Each anonymous view is logged at most once per visitor every 30 minutes, with no actor.
  - The page sends `noindex` and `no-referrer` and its tab title is just "Video".
  - The watermark can't show an email for public viewers, because they don't sign in. The share panel says so when both are on.
  - Permission tests: `tests/permissions/public-links.test.ts`.
- **Limits stated in the UI:** view-only hides downloads but can't stop screen recording, and the watermark discourages leaks but can't prevent them.

## Live rooms

- **Tokens are the only way in.** LiveKit join tokens are minted in one place (`tokenFor` in `src/server/live.ts`), only after `public.live_room_role()` allows it and the waiting room has admitted the person. Each token lasts 10 minutes, covers exactly one room, and gives admin rights only to hosts and co-hosts.
- **Waiting room on by default.** People can't admit themselves. The admissions table only accepts host decisions, and permission tests check this.
- **Remove means gone.** A removed person is disconnected at once and marked `removed`, so they can't get a new token for that room. Locking a room keeps out anyone not already admitted. Ending a room deletes it on the media server.
- **Encryption:** media is encrypted in transit (WebRTC DTLS-SRTP) between each person and the LiveKit server. It is not end-to-end encrypted. In-room chat goes over the same connection and isn't stored by Cloqui.
- **Recording live rooms is "Coming later".** It needs LiveKit Egress, which may not be on the free tier. We'll ask before adding anything paid.

## Chat

- **One read rule:** `public.can_read_channel()`. Private channels and DMs are readable only by their members. Open channels are readable by full workspace members; guests can't read them unless added.
- **Membership:** nobody joins a private channel on their own. Added people must already belong to the workspace. DM membership is fixed when the DM is created.
- **Search** runs under RLS, so private conversations you're not in are never searched.
- **Mentions** only notify people who can read the conversation. Notifications are readable only by their owner and are written only by the server.
- **Attachments** are private objects with 2-minute signed download links, issued after a channel-access check. Files can be up to 100 MB.
- **Video cards** show the title and thumbnail only to people who can watch the video. Everyone else sees a locked card with a way to ask for access.
- **Realtime:** message events are Postgres changes filtered by RLS for each subscriber, and the client refetches through server actions. Typing and presence use private realtime topics (`chat:<id>`) authorized by policies on `realtime.messages`.
- **Not end-to-end encrypted.** Messages are stored on the server so they can be searched.

## Tasks

- **One read rule:** `public.can_read_space()`. Lists, tasks, comments, checklists, labels, attachments and activity all inherit their space's access. Open spaces are visible to full workspace members; private spaces only to their members. Guests see nothing unless added to a space.
- **Assignees and mentions** are limited to people who can see the task, enforced by RLS on `task_assignees` and in the service. Nobody gets notified about a task they can't open.
- **Database integrity:** a status must belong to the task's list, and subtasks stay one level deep in their parent's list.
- **Descriptions** are Tiptap JSON, never HTML, so no markup can be injected.
- **Cross-links respect both sides.** Turning a message into a task requires reading the message. A task's video link only shows to people who can watch the video.
- **Saved views** are private to their owner.
- **Reminders** run through `POST /api/cron/reminders`, guarded by `CRON_SECRET` (compared in constant time). The endpoint returns 404 when no secret is set.

## Content Security Policy

Set in `next.config.ts`. It blocks other origins for scripts, frames, plugins and form posts, and forbids framing Cloqui (`frame-ancestors 'none'`).

**Known limit:** it allows inline scripts (`'unsafe-inline'`). Nonce-based CSP doesn't work with Partial Prerendering, which Cache Components turns on. So the main XSS defence is React's escaping and never rendering user HTML unsanitized. Revisit this when Next.js supports hash-based CSP for prerendered pages (its SRI option is still experimental).

## Sessions and auth

- Sessions live in Supabase auth cookies, refreshed by `src/proxy.ts`. They are **not** HTTP-only: Cloqui's own browser code reads them to authenticate realtime connections. They're `SameSite=Lax` and `Secure` in production, and the CSP blocks scripts from other origins. (An earlier version of this page wrongly said HTTP-only.)
- The server trusts only verified JWT claims (`getClaims()`), never the client.
- Anything that reads the session is request-time only (`connection()`), so it's never baked into a cached or prerendered page.
- Email links use one-time `token_hash` links that work on any device and expire in 1 hour.
- Passwords are checked against known breaches with the Have I Been Pwned range API. Only the first 5 characters of the password's SHA-1 hash leave the server.
- Sign-in, magic-link and reset forms give the same answer whether or not an account exists.
- Invite links carry a 256-bit token. Only its SHA-256 hash is stored. The link works once, only for the invited email, and expires after 14 days.

## Two-step sign-in

- **TOTP** (authenticator apps) through Supabase Auth MFA. Set up and turned off from
  Account and security; turning it off needs a current code.
- **Half signed in is signed out.** With two-step on, a password alone gets a session at `aal1`.
  `readSession()` treats that as signed out everywhere except the code screen (`/sign-in/2fa`).
- **Workspaces can require it, enforced in the database.** `public.workspace_2fa_ok()` is checked
  by every top-level access function: `workspace_role_of`, `video_role`, `live_room_role`,
  `can_read_channel`, `can_manage_channel`, `can_read_space`, `can_manage_space` and
  `shares_workspace_with`. So a direct share, a channel invite or a space invite doesn't get
  around it. The `aal` claim comes from the verified JWT and is passed into the RLS claims.
- An admin can only turn the requirement on from an `aal2` session, so nobody locks themselves out.
- Code checks (setup, sign-in, turning it off) are rate-limited per account: 10 tries, then one
  every 2 minutes. Supabase also limits verifications per IP.
- Members who aren't set up see "Turn on two-step sign-in first" instead of a dead end. Admins
  see who isn't set up before switching it on.

## Your account and workspace data

- **Sessions:** you see your own sign-ins (device, IP, last active). "Sign out everywhere" ends
  every refresh token. Access tokens already issued keep working until they expire (at most 1 hour).
- **Export:** `/api/account/export` has only what you wrote. `/api/w/<slug>/export` is for admins
  and is read under the admin's own RLS, so private channels and spaces they aren't in stay out.
  The workspace export is audit-logged. Both are sent with `Cache-Control: no-store`.
- **Deleting:** your account needs your exact email; a workspace needs its exact name and the
  owner role. Files go from storage first, then the rows. You can't delete your account while
  you own a workspace with other people in it.
- **Retention:** per workspace, 7 to 3,650 days for videos and messages. `POST /api/cron/retention`
  runs it daily, behind the same `CRON_SECRET` check as reminders, and deletes the files too.

## Automations

- Set up only by people who can see the list. RLS refuses a notified person who can't see it,
  a channel the creator can't read, and a status from another list.
- Each run re-checks who can see the space, so someone removed since setup isn't notified.
- **Channel posts carry a link, never the task title.** A channel can include people who can't
  see the list; the link only opens for those who can.

## Development tools

- `/api/dev/tweak` (the `/tweak` Bake button) writes `globals.css`. It returns 404 unless
  `NODE_ENV=development`, the host is localhost, and the request comes from the app's own origin.
  Values must be plain hex colours and whole-pixel radii, so nothing else can be written.

## Fonts

Cabinet Grotesk and Switzer come from Fontshare under the ITF Free Font License v2.0 (`docs/design/fonts/FFL.txt`):

- Commercial use and self-hosting are allowed.
- Subsetting, format conversion and redistribution are not, and that includes public repositories.
- So this repository stays private, the `.woff2` files are served unchanged, and Cloqui never offers these fonts as a choice for users' own content.

## Reporting a problem

Email the owner directly. Don't open a public issue.

# Security notes

What Cloqui protects, how, and what it does **not** claim. Keep this honest. If something here stops being true, fix the code or fix this page.

## What we claim

- **Encrypted in transit and at rest.** TLS everywhere. Supabase Postgres and Cloudflare R2 encrypt stored data.
- **No public links.** Every item URL requires a signed-in, invited person.
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

- **Private by default.** A new video is visible only to its owner. Sharing means naming people (or turning on "everyone in the workspace"). There is no public or "anyone with the link" option anywhere in the schema.
- **One access rule in the database.** `public.video_role()` backs both RLS and the app. Permission tests cover the outsider, colleague, admin, guest, removed, expired, passcode and deleted cases (`tests/permissions/videos.test.ts`).
- **Short-lived links.** Video and image URLs are signed for 5 minutes and renewed only after a fresh access check. A copied link stops working within minutes.
- **Passcodes** are stored as scrypt hashes, compared in constant time, and rate limited to 5 tries and then 1 every 5 minutes. Wrong attempts are logged.
- **Access requests** can't be used to probe for videos: asking about an id that doesn't exist looks the same as asking about one that does. A denied person only learns the owner's first name.
- **Audit trail per video:** uploads, views (at most one logged per person every 30 minutes), sharing changes, requests and passcode failures. Visible to the owner and workspace admins. Nobody can edit it.
- **Limits stated in the UI:** view-only hides downloads but can't stop screen recording, and the watermark discourages leaks but can't prevent them.

## Live rooms

- **Tokens are the only way in.** LiveKit join tokens are minted in one place (`tokenFor` in `src/server/live.ts`), only after `public.live_room_role()` allows it and the waiting room has admitted the person. Each token lasts 10 minutes, covers exactly one room, and gives admin rights only to hosts and co-hosts.
- **Waiting room on by default.** People can't admit themselves. The admissions table only accepts host decisions, and permission tests check this.
- **Remove means gone.** A removed person is disconnected at once and marked `removed`, so they can't get a new token for that room. Locking a room keeps out anyone not already admitted. Ending a room deletes it on the media server.
- **Encryption:** media is encrypted in transit (WebRTC DTLS-SRTP) between each person and the LiveKit server. It is not end-to-end encrypted. In-room chat goes over the same connection and isn't stored by Cloqui.
- **Recording live rooms is "Coming later".** It needs LiveKit Egress, which may not be on the free tier. We'll ask before adding anything paid.

## Content Security Policy

Set in `next.config.ts`. It blocks other origins for scripts, frames, plugins and form posts, and forbids framing Cloqui (`frame-ancestors 'none'`).

**Known limit:** it allows inline scripts (`'unsafe-inline'`). Nonce-based CSP doesn't work with Partial Prerendering, which Cache Components turns on. So the main XSS defence is React's escaping and never rendering user HTML unsanitized. Revisit this when Next.js supports hash-based CSP for prerendered pages (its SRI option is still experimental).

## Sessions and auth

- Sessions live in HTTP-only Supabase cookies, refreshed by `src/proxy.ts`.
- The server trusts only verified JWT claims (`getClaims()`), never the client.
- Anything that reads the session is request-time only (`connection()`), so it's never baked into a cached or prerendered page.
- Email links use one-time `token_hash` links that work on any device and expire in 1 hour.
- Passwords are checked against known breaches with the Have I Been Pwned range API. Only the first 5 characters of the password's SHA-1 hash leave the server.
- Sign-in, magic-link and reset forms give the same answer whether or not an account exists.
- Invite links carry a 256-bit token. Only its SHA-256 hash is stored. The link works once, only for the invited email, and expires after 14 days.

## Fonts

Cabinet Grotesk and Switzer come from Fontshare under the ITF Free Font License v2.0 (`docs/design/fonts/FFL.txt`):

- Commercial use and self-hosting are allowed.
- Subsetting, format conversion and redistribution are not, and that includes public repositories.
- So this repository stays private, the `.woff2` files are served unchanged, and Cloqui never offers these fonts as a choice for users' own content.

## Reporting a problem

Email the owner directly. Don't open a public issue.

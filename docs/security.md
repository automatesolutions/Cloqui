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
| XSS                                    | React escaping, no `dangerouslySetInnerHTML` on user content, rich text sanitized on the server, strict CSP                                 |
| Input validation                       | Zod schemas on every server action and route handler                                                                                        |
| Rate limiting                          | Supabase Auth limits, plus a Postgres token bucket on invites, access requests and uploads                                                  |
| Secrets                                | Env vars only (Secret Manager in production). `.env*` is ignored except `.env.example`.                                                     |
| Logs                                   | No tokens, passwords, passcodes, signed URLs or message content in logs                                                                     |
| Indexing                               | `noindex` on everything except the landing page                                                                                             |

## Fonts

Cabinet Grotesk and Switzer come from Fontshare under the ITF Free Font License v2.0 (`docs/design/fonts/FFL.txt`):

- Commercial use and self-hosting are allowed.
- Subsetting, format conversion and redistribution are not, and that includes public repositories.
- So this repository stays private, the `.woff2` files are served unchanged, and Cloqui never offers these fonts as a choice for users' own content.

## Reporting a problem

Email the owner directly. Don't open a public issue.

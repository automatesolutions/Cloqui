# Cloqui

Record it, share it, discuss it, and track it. Only with the people you invite.

Cloqui is a private-by-default app for screen and camera videos, live rooms, team chat, and tasks. Nothing is public. Every video, room, channel, and task is visible only to the people who were invited.

> **This repository must stay private.** The Fontshare fonts in `src/app/fonts` are licensed under the ITF Free Font License, which does not allow redistribution through public repositories. See `docs/security.md#fonts`.

## Run it locally

You need Node 22+, pnpm 9+, and Docker Desktop (running).

1. Install dependencies: `pnpm install`
2. Start local Supabase (Postgres, Auth, Realtime, Mailpit): `pnpm db:start`
3. Write `.env.local` from the local stack: `pnpm env:local`
4. Start the app: `pnpm dev`, then open http://localhost:3000.
5. Emails (sign-up, invites) land in the local inbox at http://127.0.0.1:55324. Nothing leaves your machine.

Local Supabase uses ports 55320–55329, because Windows reserves the default 543xx range when Hyper-V or WSL is on.

## Checks

| Command                       | What it does                                                                                 |
| ----------------------------- | -------------------------------------------------------------------------------------------- |
| `pnpm check`                  | Lint, type-check and unit tests                                                              |
| `pnpm test:permissions`       | Proves uninvited people can't read items. Needs `pnpm db:start`.                             |
| `pnpm build && pnpm test:e2e` | Playwright end to end, plus WCAG 2.2 AA (axe) and 44 px tap-target checks, in dark and light |
| `pnpm format`                 | Prettier                                                                                     |

## Where things are

| Path                     | What                                                              |
| ------------------------ | ----------------------------------------------------------------- |
| `src/app/(marketing)`    | Landing page                                                      |
| `src/components/ui`      | shadcn/ui components, restyled to the Cloqui design system        |
| `src/components/privacy` | `AccessChip`, `RecordingPill`, `AccessDenied`                     |
| `supabase/`              | Local Supabase config and SQL migrations (including RLS policies) |
| `e2e/`, `tests/`         | Playwright and Vitest suites                                      |
| `docs/`                  | Build plan, architecture, security notes, design system           |
| `.claude/skills/`        | `/cloqui-design` and `/cloqui-tone`, the design and copy rules    |

## Docs

- [Build plan](docs/build-plan.md)
- [Architecture](docs/architecture.md)
- [Security notes](docs/security.md)
- [Design system preview](docs/design/preview.html), [contrast checks](docs/design/contrast.md), [components and licences](docs/design/components.md)

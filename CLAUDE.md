# Cloqui

Private-by-default video, live rooms, chat and tasks. Build plan and phase status: `docs/build-plan.md`.

## Rules

- Use `/cloqui-design` for every screen and `/cloqui-tone` for every string. Use `/hig` for numeric minimums.
- Every server action, route handler and query goes through `src/server/authz` (`can()`) and the RLS-aware DB client. Add a permission test in `tests/permissions/` for every new item type or access path.
- Never claim end-to-end encryption. Unbuilt features say "Coming later".
- Ask before adding any paid service.
- Import `cn` from `@/lib/utils`, never from `"cn"`. After `shadcn add`, fix the import and restyle to the tokens.
- Next.js 16 with `cacheComponents`: anything that reads cookies or the session renders inside `<Suspense>`. Check `node_modules/next/dist/docs` before using an unfamiliar Next API. Middleware is `src/proxy.ts`.
- Icons: Lucide only, `strokeWidth={1.75}`. No hand-drawn icons.
- The repo must stay private (font licence).

## Before saying a step is done

`pnpm check`, then `pnpm build && pnpm test:e2e`. Run `pnpm test:permissions` when auth or data access changed (needs `pnpm db:start`).

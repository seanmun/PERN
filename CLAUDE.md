# Claude Code — Project Guide

You are working in the **BuddyCup** (formerly "Cup") trip-app repo. It is an npm-workspaces monorepo:

- `apps/web` — the entire Next.js app (App Router, all root scripts delegate here via `-w web`)
- `packages/scoring` (`@buddycup/scoring`) — the pure-TS scoring engine, framework-free so a future mobile app can share it

Read these docs before making architectural decisions or proposing new features:

1. [`docs/product.md`](./docs/product.md) — what we're building, principles
2. [`docs/architecture.md`](./docs/architecture.md) — stack, role model, multi-tenant approach
3. [`docs/schema.md`](./docs/schema.md) — data model + Drizzle schema
4. [`docs/pinehurst.md`](./docs/pinehurst.md) — Pinehurst Cup trip seed data (the first real trip: Aug 19–22, 2026)
5. [`docs/event-setup-spec.md`](./docs/event-setup-spec.md) — event-creation/match-setup domain rules (shipped, but the domain rules still govern)
6. [`docs/backlog.md`](./docs/backlog.md) — backlog

## Stack — non-negotiable

- **Auth:** Clerk (magic-link). No other auth providers. Do not add Supabase Auth.
- **DB:** Neon Postgres + Drizzle ORM. No Prisma, no Supabase client.
- **Framework:** Next.js App Router + TypeScript. Server components by default; client components only when interactivity demands it.
- **Styling:** Tailwind v4. No CSS-in-JS libraries.
- **Server state:** TanStack Query. No Redux, no Zustand unless explicitly approved.
- **Realtime:** Polling via TanStack Query for now. SSE only when scoped. No WebSockets without discussion.
- **Animation:** Framer Motion.
- **Package manager:** npm workspaces. Do not reintroduce pnpm — it was removed because Vercel builds were unwinnable (`07fc00b`).

## Conventions

- File naming: `kebab-case` for directories, `PascalCase.tsx` for React components, `camelCase.ts` for utilities.
- Drizzle schema lives in `apps/web/db/schema.ts`. Migrations generate into `apps/web/db/migrations/`.
- **Migrations are applied by pasting SQL into the Neon SQL editor** (never `db:migrate`), and must be applied BEFORE any code depending on them is pushed — main auto-deploys to prod.
- Run `npm run build` locally before pushing non-trivial changes — Turbopack dev tolerates type errors the prod build rejects.
- Server actions over API routes for mutations when reasonable.
- All trip-scoped queries must filter by `trip_id`. There is no global player list (but `users` + buddies exist platform-level).
- All permission checks go through `apps/web/lib/auth/permissions.ts` helpers — never inline.
- `numeric` for handicaps; Drizzle returns these as strings. Don't `parseFloat` casually — pass them to the scoring engine which knows how to handle them.
- The scoring engine in `packages/scoring/` is pure functions (engine, formats, handicap, team-split, match-builder validation). Heavily unit-test it (`apps/web/tests/`, vitest, `npm test`). App-side glue (recompute/persistence) lives in `apps/web/lib/scoring/`. It's the most algorithmically important code in the app.

## Do not

- Do not introduce RLS or row-level security policies. Permission lives in the application layer.
- Do not store credentials, GHIN passwords, or anything that requires user re-auth.
- Do not commit `.env*` files. `.env.example` only.
- Do not create new tables without updating `docs/schema.md` in the same PR.
- Do not regenerate the Drizzle schema from the database — the schema *is* the source of truth, the DB is downstream.

## Multi-tenant status

Multi-tenancy is **live**: `/trips/[slug]/...` routing, `/trips/new` creation flow, invite tokens, trip kinds (`trip` / `outing` / `match`). The Pinehurst Cup is the flagship first trip, not a hardcoded assumption. New features should be trip-agnostic by default.

## Role model — quick reference

| Role | Source | Can do |
|---|---|---|
| `platform_admin` | env var `PLATFORM_ADMIN_EMAILS` (Sean / Munley) | godmode across all trips |
| `trip_admin` | `trip_members.role = 'trip_admin'` | full control of own trip |
| Captain | `trip_members.is_captain = true` | edit own team, set TBD matchups, pick scramble teams |
| Player | `trip_members.role = 'player'` | view, enter own scores, edit own profile |
| Viewer | `trip_members.role = 'viewer'` | read-only spectator |

Permission resolution always cascades: platform → trip → captain → self.

## When in doubt

If something isn't covered here or in the docs, **ask** before adding it. This project is small, opinionated, and easy to break with premature abstractions.

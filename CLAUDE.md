# Claude Code — Project Guide

You are working in the **Cup** trip-app repo. Read these docs *in order* before making architectural decisions or proposing new features:

1. [`docs/product.md`](./docs/product.md) — what we're building, MVP scope, principles
2. [`docs/architecture.md`](./docs/architecture.md) — stack, role model, multi-tenant approach
3. [`docs/schema.md`](./docs/schema.md) — data model + Drizzle schema
4. [`docs/pinehurst.md`](./docs/pinehurst.md) — Pinehurst Cup trip seed data
5. [`docs/backlog.md`](./docs/backlog.md) — post-MVP backlog

## Stack — non-negotiable

- **Auth:** Clerk (magic-link). No other auth providers. Do not add Supabase Auth.
- **DB:** Neon Postgres + Drizzle ORM. No Prisma, no Supabase client.
- **Framework:** Next.js App Router + TypeScript. Server components by default; client components only when interactivity demands it.
- **Styling:** Tailwind v4. No CSS-in-JS libraries.
- **Server state:** TanStack Query. No Redux, no Zustand unless explicitly approved.
- **Realtime:** Polling via TanStack Query for now. SSE only when scoped. No WebSockets without discussion.
- **Animation:** Framer Motion (inherited from PERN).

## Conventions

- File naming: `kebab-case` for directories, `PascalCase.tsx` for React components, `camelCase.ts` for utilities.
- Drizzle schema lives in `db/schema.ts`. Migrations via Drizzle Kit.
- Server actions over API routes for mutations when reasonable.
- All trip-scoped queries must filter by `trip_id`. There is no global player list.
- All permission checks go through `lib/auth/permissions.ts` helpers — never inline.
- `numeric` for handicaps; Drizzle returns these as strings. Don't `parseFloat` casually — pass them to the match-play engine which knows how to handle them.
- The match-play scoring engine in `lib/scoring/` is pure functions. Heavily unit-test it. It's the most algorithmically important code in the app.

## Do not

- Do not introduce RLS or row-level security policies. Permission lives in the application layer.
- Do not store credentials, GHIN passwords, or anything that requires user re-auth.
- Do not commit `.env*` files. `.env.example` only.
- Do not create new tables without updating `docs/schema.md` in the same PR.
- Do not regenerate the Drizzle schema from the database — the schema *is* the source of truth, the DB is downstream.

## Multi-tenant note

The schema is multi-tenant from day one (`trip_id` on every domain table). **However:**

- v1 UI is *hardcoded for the Pinehurst trip*. No trip-switcher, no slug-routing, no trip-creation form.
- The single Pinehurst trip is seeded by `db/seed.ts`.
- Do not add multi-trip UI without explicit go-ahead. Bolting it on later is cheap; building it now is wasted scope.

## Role model — quick reference

| Role | Source | Can do |
|---|---|---|
| `platform_admin` | env var `PLATFORM_ADMIN_EMAILS` (Sean / Munley) | godmode across all trips |
| `trip_admin` | `trip_members.role = 'trip_admin'` (Dan) | full control of own trip |
| Captain | `trip_members.is_captain = true` (Dan, Ian) | edit own team, set TBD matchups, pick scramble teams |
| Player | `trip_members.role = 'player'` | view, enter own scores, edit own profile |

Permission resolution always cascades: platform → trip → captain → self.

## When in doubt

If something isn't covered here or in the docs, **ask** before adding it. This project is small, opinionated, and easy to break with premature abstractions.

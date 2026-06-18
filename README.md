# Cup — Pinehurst Trip App

> Working title. Platform name TBD; trip name is **Pinehurst Cup**.

A private golf trip app — built for the Pinehurst Cup (12 guys, 2 teams, 6 rounds, match play with handicaps), architected to scale to any group that wants the same.

**Status:** pre-MVP, in active development.

**Stack:** Next.js (App Router) · TypeScript · Tailwind v4 · Clerk · Neon Postgres · Drizzle ORM · TanStack Query · Framer Motion · Vercel

## Documentation

- [`CLAUDE.md`](./CLAUDE.md) — orientation for Claude Code (read first if you're an agent)
- [`docs/product.md`](./docs/product.md) — what we're building, MVP scope, design principles
- [`docs/architecture.md`](./docs/architecture.md) — stack rationale, role model, multi-tenant approach
- [`docs/schema.md`](./docs/schema.md) — data model + Drizzle schema
- [`docs/pinehurst.md`](./docs/pinehurst.md) — the Pinehurst Cup trip specifics (roster, schedule, rules)
- [`docs/backlog.md`](./docs/backlog.md) — post-MVP features in priority order

## Repo layout

This is a pnpm monorepo:

```
buddycup/
  apps/
    web/                ← Next.js app (lives here, not at root)
  packages/
    scoring/            ← pure TS engine + validation, shared with apps/mobile later
  ios-watch/            ← (future) SwiftUI Watch app
  docs/                 ← cross-app specs + plans
```

See [`docs/mobile-app-plan.md`](./docs/mobile-app-plan.md) for the rationale.

## Quickstart

```bash
# One-time
npm install -g pnpm     # if you don't have it
cp apps/web/.env.example apps/web/.env.local   # fill in CLERK_*, DATABASE_URL, PLATFORM_ADMIN_EMAILS, GOOGLE_PLACES_API_KEY

# Install + run
pnpm install
pnpm dev                # runs apps/web

# Other scripts (all delegate into apps/web)
pnpm test               # vitest engine + validation
pnpm test:watch
pnpm seed:scenarios     # end-to-end seeded assertions
pnpm build              # prod build
```

## Concept

Two-tier model:

- **Cup** (the platform) — a trip-scoped app for any group. The data model is multi-tenant from day one.
- **Pinehurst Cup** (the first trip) — hardcoded UI flows, seeded roster, all features focused on shipping this one trip in August. Trip-creation / onboarding UI is post-MVP.

# BuddyCup

A private golf trip app — schedule, live scoring, leaderboards, and trash talk for buddy trips. Born as the **Pinehurst Cup** app (12 guys, 2 teams, 6 rounds, match play with handicaps); now multi-tenant, so any group can run a trip, outing, or single match.

**Status:** live in production (buddycup.golf). Multi-tenancy shipped — `/trips/[slug]/...` routing, trip creation wizard, invites.

**Stack:** Next.js (App Router) · TypeScript · Tailwind v4 · Clerk · Neon Postgres · Drizzle ORM · TanStack Query · Framer Motion · Vercel

## Documentation

- [`CLAUDE.md`](./CLAUDE.md) — orientation for Claude Code (read first if you're an agent)
- [`docs/product.md`](./docs/product.md) — what we're building, design principles
- [`docs/architecture.md`](./docs/architecture.md) — stack rationale, role model, multi-tenant approach
- [`docs/schema.md`](./docs/schema.md) — data model reference
- [`docs/event-setup-spec.md`](./docs/event-setup-spec.md) — event-creation / match-setup domain rules
- [`docs/match-template-spec.md`](./docs/match-template-spec.md) — formats, foursome-first scoring, match builder
- [`docs/multi-tenant-unlock.md`](./docs/multi-tenant-unlock.md) — the (shipped) multi-tenant plan
- [`docs/pinehurst.md`](./docs/pinehurst.md) — the Pinehurst Cup trip specifics (roster, schedule, rules)
- [`docs/backlog.md`](./docs/backlog.md) — post-MVP features in priority order
- [`docs/mobile-app-plan.md`](./docs/mobile-app-plan.md) — future Expo/Watch plan (not started)

## Repo layout

This is an npm-workspaces monorepo:

```
buddycup/
  apps/
    web/                ← the entire Next.js app
  packages/
    scoring/            ← pure-TS scoring engine + validation (framework-free)
  docs/                 ← specs + plans
```

## Quickstart

```bash
cp apps/web/.env.example apps/web/.env.local
# Fill in: CLERK_*, DATABASE_URL, PLATFORM_ADMIN_EMAILS, plus optional
# integrations — GOOGLE_PLACES_API_KEY, GOLF_COURSE_API_KEY (course import),
# ANTHROPIC_API_KEY (scorecard extraction), OPENAI_API_KEY (arcade portraits),
# RESEND_* (invite emails). See .env.example for the full list.

# Install + run (from repo root)
npm install
npm run dev                # runs apps/web

# Other scripts (all delegate into apps/web)
npm test                   # vitest — scoring engine + validation
npm run test:watch
npm run seed:scenarios     # end-to-end seeded assertions
npm run build              # prod build — run before pushing
```

**Migrations:** generated into `apps/web/db/migrations/` but applied by pasting SQL into the Neon SQL editor — never a migration runner. See CLAUDE.md.

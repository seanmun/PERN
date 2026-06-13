import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft, AlertTriangle, ShieldCheck } from 'lucide-react';
import { getGlobalAuthContext } from '@/lib/auth/current-user';
import ForceDarkMode from '@/components/ForceDarkMode';

export const metadata: Metadata = {
  title: 'Documentation · BuddyCup',
  description: 'Internal map of every feature, route, action, and data table.',
};

export default async function DocumentationPage() {
  const ctx = await getGlobalAuthContext();
  if (!ctx) redirect('/sign-in');
  if (!ctx.isPlatformAdmin) redirect('/home');

  return (
    <article className="mx-auto max-w-4xl px-4 py-16 sm:py-20">
      <ForceDarkMode />
      <Link
        href="/home"
        className="group inline-flex items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-[0.3em] text-zinc-500 transition-colors hover:text-yellow-400"
      >
        <ArrowLeft size={12} strokeWidth={2.5} className="transition-transform group-hover:-translate-x-0.5" />
        Back
      </Link>

      <header className="mt-8">
        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.35em] text-yellow-800 dark:text-yellow-500">
          Internal · Platform admin only
        </p>
        <h1 className="mt-2 text-4xl font-bold tracking-tight">BuddyCup — full app map</h1>
        <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
          One scrollable page. Every feature, every route, every server action, every table, every permission rule.
          Past security findings (now patched) are kept with{' '}
          <ShieldCheck size={12} className="inline text-emerald-400" /> so the fix and the original mistake stay
          documented together.
        </p>
      </header>

      <Toc />

      <Section id="overview" title="1. Architecture overview">
        <List>
          <li><strong>Framework:</strong> Next.js App Router + TypeScript. Server components default; <code>'use client'</code> only when interactivity demands.</li>
          <li><strong>Auth:</strong> Clerk (magic link). The DB &lt;-&gt; Clerk join is by lowercased <code>email</code>. <code>users.clerkId</code> linked on first sign-in.</li>
          <li><strong>DB:</strong> Neon Postgres + Drizzle ORM. Schema in <code>db/schema.ts</code> is source of truth. Migrations applied via Neon SQL editor (not <code>db:migrate</code>).</li>
          <li><strong>Multi-tenant:</strong> every domain table carries <code>trip_id</code>. v1 UI is hard-routed under <code>/trips/[slug]/*</code>; no trip switcher.</li>
          <li><strong>Permissions:</strong> application layer only — no RLS. All checks go through <code>lib/auth/permissions.ts</code>.</li>
          <li><strong>Scoring:</strong> pure functions in <code>lib/scoring/engine.ts</code>. DB writes happen in <code>upsertHoleScore</code> action which calls <code>recomputeMatchStatus</code>.</li>
          <li><strong>Realtime:</strong> polling via TanStack Query. No SSE / WS yet.</li>
        </List>
      </Section>

      <Section id="bugs" title="2. Security audit — all leaks closed">
        <p className="text-sm text-zinc-700 dark:text-zinc-300">
          Page-level: every page under <code>/trips/[slug]/*</code> calls{' '}
          <code>getTripAuthContext(trip.id)</code> and redirects non-members. Safe.
        </p>
        <p className="mt-3 text-sm text-zinc-700 dark:text-zinc-300">
          Action-level: six actions previously trusted input or used the wrong auth context. All six were patched in
          the same pass:
        </p>
        <Bugs />
        <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">
          The "flights from a trip I'm not on" symptom traced to a separate bug in the (now-removed)
          <code>MoreMenu</code>: when rendered outside a trip route, it fell back to{' '}
          <code>DEFAULT_TRIP_SLUG = 'pcup26'</code> and linked its menu items at Pinehurst. The page enforced
          membership, but the menu deep-linked into a trip the user happened to be on (Pinehurst), so no redirect
          fired. The fallback is gone and the menu component itself was deleted in the BottomNav restructure.
        </p>
        <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
          Architectural follow-through: <code>getAuthContext</code> was renamed to{' '}
          <code>getGlobalAuthContext</code> across the codebase (80 references, 27 files) so any future call site
          that reaches for the global context to make a trip-scoped permission decision has to actively rename it —
          the wrong-context bug class can't recur silently.
        </p>
      </Section>

      <Section id="roles" title="3. Role model & permission cascade">
        <Table
          head={['Role', 'Source', 'Can do']}
          rows={[
            ['platform_admin', 'env PLATFORM_ADMIN_EMAILS (Sean, Munley)', 'Godmode across every trip'],
            ['trip_admin', 'tripMembers.role = trip_admin (Dan for Pinehurst)', 'Full control of own trip'],
            ['captain', 'tripMembers.isCaptain = true (separate from role)', 'Edit own team, set TBD matchups, pick scramble teams'],
            ['player', 'tripMembers.role = player (default)', 'View, enter own scores, edit own profile'],
          ]}
        />
        <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">
          Cascade order in every <code>can*</code> helper: platform_admin → trip_admin → captain → self. The first
          match wins; checks short-circuit. Defined in <code>lib/auth/permissions.ts</code>.
        </p>
        <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
          <strong>Two auth contexts</strong> — pick the right one:
        </p>
        <List>
          <li><code>getGlobalAuthContext()</code> — used on <code>/me</code>, claim actions, and anywhere no specific trip is in scope. Returns the user's <em>first</em> tripMember. <strong>Do not</strong> use it for permission checks on a specific trip — it can return Trip A's membership while the URL is for Trip B.</li>
          <li><code>getTripAuthContext(tripId)</code> — used inside every <code>/trips/[slug]/*</code> page. Returns the membership for <em>that exact trip</em>, or null if not a member.</li>
        </List>
      </Section>

      <Section id="claims" title="4. Auth & lazy-claim flow">
        <ol className="mt-2 space-y-2 text-sm text-zinc-700 dark:text-zinc-300 list-decimal pl-5">
          <li>Admin adds a player on <code>/trips/[slug]/admin/players/new</code> with an email. A <code>tripMembers</code> row is inserted with <code>userId = NULL</code>.</li>
          <li>That person signs in via Clerk (magic link). <code>getGlobalAuthContext()</code> runs.</li>
          <li>Clerk email is normalized to lowercase. Lookup <code>users</code> by <code>clerkId</code> — if absent, lookup by lowercase email and attach <code>clerkId</code>, otherwise insert a new row.</li>
          <li>Bulk UPDATE: every <code>tripMembers</code> row where <code>lower(email) = email AND userId IS NULL</code> gets stitched to this user. This handles multi-trip cases.</li>
          <li><code>/me</code> queries by <code>userId</code> — the trip now appears. <code>listClaimableSlots()</code> renders any leftover unclaimed rows as a fallback "Pending claims" CTA.</li>
          <li><code>claimTripMember(formData)</code> — explicit belt-and-suspenders claim. Requires the slot's email matches the caller's (case-insensitive). Used when the lazy-claim missed a row.</li>
        </ol>
        <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">
          Files: <code>lib/auth/current-user.ts</code>, <code>lib/auth/trip-context.ts</code>, <code>lib/actions/claim.ts</code>.
        </p>
      </Section>

      <Section id="tables" title="5. Data model — every table">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Source of truth: <code>db/schema.ts</code>. Docs in <code>docs/schema.md</code> are stale (missing reactions,
          tripInvites, tripEvents, courseTees, courseTeeYardages, user profile fields, media moderation, rounds.isHidden).
        </p>
        <SubHeading>Platform-wide</SubHeading>
        <Table
          head={['Table', 'Purpose', 'Notable columns']}
          rows={[
            ['users', 'Global identity', 'clerkId, email (unique), fullName, avatarUrl, ghinNumber, handicap, username (unique), city, state, clubName, arcadePortrait{Url,SourceUrl,GeneratedAt}, defaultTripId'],
            ['courses', 'Golf courses (shared across trips)', 'name, location, address, totalPar, imageUrl, scorecardImageUrl, scorecardExtractedAt'],
            ['courseHoles', 'Per-hole par + handicap index', '(courseId, holeNumber) unique. handicapIndex 1–18 drives stroke allocation.'],
            ['courseTees', 'Tee boxes (Black/Blue/White/etc.)', 'name, color, rating, slope, totalYardage, displayOrder, isDefault'],
            ['courseTeeYardages', 'Per-hole yardage per tee', 'PK (courseTeeId, holeNumber)'],
            ['reactions', 'Polymorphic emoji reactions', 'userId, targetKind (score|media|text), targetId, emoji — no FK on targetId'],
          ]}
        />
        <SubHeading>Trip-scoped (every row carries <code>trip_id</code>)</SubHeading>
        <Table
          head={['Table', 'Purpose', 'Notable columns']}
          rows={[
            ['trips', 'Top-level container', 'slug (unique), name, startDate, endDate, description, imageUrl, createdBy'],
            ['teams', 'Two teams per trip', 'tripId, name, color (hex), captainUserId'],
            ['tripMembers', 'Roster — central to permissions', 'tripId, userId (nullable until claimed), email (nullable since 0017), teamId, nickname, avatarUrl, role (trip_admin|player), isCaptain, tripHandicap, scoutingReport (flight columns retained but unused after flights page removal)'],
            ['rounds', 'Golf outings (5–6 per trip)', 'tripId, courseId, courseTeeId, date, format (best_ball|singles|scramble|stroke), order, label, countsTowardCup, isHidden'],
            ['teeTimes', 'Groups within a round', 'roundId, time, groupNumber'],
            ['matches', 'One match per tee time', 'roundId, teeTimeId, status (scheduled|in_progress|completed), resultText, winningTeamId, isHalved'],
            ['matchParticipants', 'M:N players↔match', 'PK (matchId, tripMemberId), teamId'],
            ['holeScores', 'Atomic scoring unit', '(matchId, tripMemberId, holeNumber) unique. gross, net, strokesReceived, enteredBy'],
            ['media', 'Photos/videos (optional hole tag)', 'tripId, matchId, roundId, holeNumber, uploadedBy, url, mediaType, caption, moderationStatus (approved|flagged)'],
            ['messages', 'Trip text feed', 'tripId, authorId, body, pinnedByCaptain'],
            ['tripEvents', 'Non-golf schedule items', 'tripId, type (flight|shuttle|meal|social|hotel_checkin|hotel_checkout|other), title, location, address, startTime, endTime'],
            ['tripInvites', 'Reusable invite codes', 'tripId, code (unique), usesAllowed, usesCount, expiresAt'],
          ]}
        />
        <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">
          All <code>trip_id</code> FKs use <code>ON DELETE CASCADE</code>. Delete a trip and everything beneath it
          goes with it.
        </p>
      </Section>

      <Section id="routes" title="6. Routes — every page">
        <SubHeading>App shell &amp; navigation</SubHeading>
        <List>
          <li><strong>BottomNav</strong> ([components/BottomNav.tsx](components/BottomNav.tsx)): five tabs — <strong>Home · Schedule · Cup · Feed · Me</strong>. Home (<code>/home</code>) and Me (<code>/me</code>) work everywhere. Schedule, Cup, Feed grey out unless the URL contains a trip slug. No "More" button, no fallback slug.</li>
          <li><strong>HeaderAvatar</strong> ([components/HeaderAvatar.tsx](components/HeaderAvatar.tsx) → [HeaderAvatarLink.tsx](components/HeaderAvatarLink.tsx)): avatar links to <code>/me</code>. When you're inside a <code>/trips/[slug]/*</code> route AND you're a trip_admin of that slug (or platform_admin), a yellow <strong>Admin</strong> button appears immediately to the left, linking to <code>/trips/[slug]/admin</code>. The server queries every trip slug where the user is trip_admin and passes them to the client component, which does the slug-vs-pathname check.</li>
          <li><strong>Two surfaces, two purposes:</strong> <code>/home</code> is the trip dashboard (your trips, claims, past trips). <code>/me</code> is the personal profile editor (one place for username, name, handicap, GHIN, photo, arcade portrait, city, state, club).</li>
        </List>
        <SubHeading>Public</SubHeading>
        <Table
          head={['Path', 'Purpose', 'Auth']}
          rows={[
            ['/', 'Marketing home; redirects signed-in users to /home', 'optional'],
            ['/sign-in', 'Clerk sign-in', 'none'],
            ['/sign-up', 'Clerk sign-up', 'none'],
            ['/brand', 'Design system reference', 'none'],
            ['/privacy', 'Privacy policy', 'none'],
          ]}
        />
        <SubHeading>User-scoped</SubHeading>
        <Table
          head={['Path', 'Purpose', 'Auth']}
          rows={[
            ['/home', 'Dashboard — current trips, past trips, pending claims', 'getGlobalAuthContext'],
            ['/me', 'Profile editor (name, username, handicap, GHIN, avatar, portrait, city, state, club)', 'getGlobalAuthContext'],
            ['/home/past-trips', 'All past trips (endDate < today)', 'getGlobalAuthContext'],
            ['/trips/new', 'Create a new trip (caller becomes trip_admin)', 'getGlobalAuthContext'],
            ['/documentation', 'This page', 'platform_admin only'],
          ]}
        />
        <SubHeading>Trip-scoped — main</SubHeading>
        <p className="text-xs text-zinc-500 mt-1">All call <code>getTripAuthContext(trip.id)</code> and redirect non-members.</p>
        <Table
          head={['Path', 'Purpose']}
          rows={[
            ['/trips/[slug]/schedule', 'Daily schedule (golf rounds + events)'],
            ['/trips/[slug]/scoreboard', 'Cup standings + individual leaderboard'],
            ['/trips/[slug]/feed', 'Trip feed (media posts, reactions, match tags)'],
            ['/trips/[slug]/me', 'Your profile in this trip'],
            ['/trips/[slug]/me/edit', 'Edit your trip profile (photo, handicap)'],
            ['/trips/[slug]/teams/[id]', 'Team roster'],
            ['/trips/[slug]/profile/[id]', 'Player profile + scouting report + matches'],
            ['/trips/[slug]/matches/[id]', 'Match detail card'],
            ['/trips/[slug]/matches/[id]/score', 'Hole-by-hole score entry'],
            ['/trips/[slug]/matches/[id]/edit', 'Edit participants / delete match (admin)'],
            ['/trips/[slug]/matches/new', 'Create a match for a tee time (admin)'],
            ['/trips/[slug]/events/[id]', 'Event detail'],
            ['/trips/[slug]/events/[id]/edit', 'Edit event (admin)'],
            ['/trips/[slug]/events/new', 'Create event (admin)'],
          ]}
        />
        <SubHeading>Trip-scoped — admin</SubHeading>
        <p className="text-xs text-zinc-500 mt-1">All call <code>getTripAuthContext</code> + require platform_admin OR trip_admin.</p>
        <Table
          head={['Path', 'Purpose']}
          rows={[
            ['/trips/[slug]/admin', 'Admin hub'],
            ['/trips/[slug]/admin/details', 'Trip name, dates, description, icon'],
            ['/trips/[slug]/admin/teams', 'Rename/recolor teams'],
            ['/trips/[slug]/admin/players', 'Roster (photos, handicaps, captains, scouting)'],
            ['/trips/[slug]/admin/players/new', 'Add player (optionally search + link existing user; shell players supported)'],
            ['/trips/[slug]/admin/players/[id]/edit', 'Edit player'],
            ['/trips/[slug]/admin/rounds', 'Rounds list'],
            ['/trips/[slug]/admin/rounds/new', 'Create round'],
            ['/trips/[slug]/admin/rounds/[id]/edit', 'Edit round (date, format, course, tees, matchups)'],
            ['/trips/[slug]/admin/courses', 'Course gallery'],
            ['/trips/[slug]/admin/courses/new', 'Create course'],
            ['/trips/[slug]/admin/courses/[id]/edit', 'Edit course + scorecard extraction'],
            ['/trips/[slug]/admin/tee-times/new', 'Add tee time'],
            ['/trips/[slug]/admin/tee-times/[id]/edit', 'Edit tee time'],
          ]}
        />
      </Section>

      <Section id="actions" title="7. Server actions — every mutation">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Files in <code>lib/actions/</code>. Each action's permission check is the security boundary. The six that
          previously had cross-trip risk are now patched (see §2).
        </p>
        <Table
          head={['Action', 'File', 'Check', 'Writes', 'Note']}
          rows={[
            ['createTrip', 'trips.ts', 'requireAuth', 'trips, teams, tripMembers', 'Caller becomes trip_admin of the new trip.'],
            ['updateTrip', 'trips.ts', 'getTripAuthContext(id) + canEditTrip', 'trips', 'Scoped to the specific trip being edited.'],
            ['createPlayer', 'players.ts', 'isTripAdminOf(tripId)', 'tripMembers', 'Supports shell players (email nullable) + linkedUserId.'],
            ['updatePlayer', 'players.ts', 'isTripAdminOf(player.tripId)', 'tripMembers, matchParticipants', 'Derives tripId from row.'],
            ['updateMyUserProfile', 'me.ts', 'requireAuth', 'users', 'Edits caller\'s own row. Writes name, username, handicap, GHIN, avatar, city, state, clubName.'],
            ['updateMyProfile', 'update-profile.ts', 'canEditTripMember', 'users, tripMembers', 'Trip-scoped profile (name, handicap, GHIN, avatar).'],
            ['createTeeTime / updateTeeTime / deleteTeeTime', 'tee-times.ts', 'requireTeeTimeAdmin(round.tripId)', 'teeTimes', 'Joins round to get tripId.'],
            ['createRound / updateRound / deleteRound', 'rounds.ts', 'requireRoundAdmin(tripId)', 'rounds', ''],
            ['createMatch / updateMatchParticipants / deleteMatch', 'matches.ts', 'requireMatchAdmin(round.tripId)', 'matches, matchParticipants', ''],
            ['upsertHoleScore', 'scores.ts', 'canEnterScoreFor(target)', 'holeScores → recomputeMatchStatus → matches', 'Self or admin.'],
            ['updateTeam', 'teams.ts', 'isTripAdminOf(team.tripId)', 'teams', ''],
            ['createEvent / updateEvent / deleteEvent', 'events.ts', 'requireEventAdmin(tripId)', 'tripEvents', ''],
            ['createCourse / updateCourse / setDefaultTee / reextractScorecard', 'courses.ts', '"some" trip_admin', 'courses, courseTees, courseHoles', 'Courses are platform-wide so any trip admin can edit any course. Accepted for now.'],
            ['createMediaPost', 'feed.ts', 'getTripAuthContext(tripId) + membership', 'media', 'Was: no trip check. Now scoped.'],
            ['createTextPost', 'feed.ts', 'getTripAuthContext(tripId) + membership', 'messages', 'Was: no trip check. Now scoped.'],
            ['unflagMediaPost', 'feed.ts', 'getTripAuthContext(media.tripId) + canEditTrip', 'media', 'Was: any trip admin. Now scoped to media\'s trip.'],
            ['deleteFeedItem', 'feed.ts', 'owner OR canEditTrip(post.tripId)', 'media or messages', 'Was: any trip admin. Now scoped to post\'s trip.'],
            ['toggleReaction', 'reactions.ts', 'resolve trip → getTripAuthContext + membership', 'reactions', 'Was: any signed-in user. Now requires membership.'],
            ['claimTripMember', 'claim.ts', 'email match', 'tripMembers', 'Slot\'s email must match caller\'s.'],
            ['listClaimableSlots', 'claim.ts', 'requireAuth', '(read only)', 'Returns only slots matching caller\'s email.'],
            ['generateMyArcadePortrait', 'portraits.ts', 'requireAuth', 'users (own row)', ''],
            ['generateArcadePortraitForPlayer', 'portraits.ts', 'isTripAdminOf(member.tripId)', 'users (player\'s row)', ''],
            ['clearArcadePortrait{ForPlayer,My}', 'portraits.ts', 'admin / self', 'users', ''],
            ['searchUsers', 'users.ts', 'requireAuth', '(read only)', 'Used by admin "add player" picker.'],
          ]}
        />
      </Section>

      <Section id="scoring" title="8. Scoring engine">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          <code>lib/scoring/engine.ts</code> — pure functions. Heavily unit-tested. No DB, no side effects.
        </p>
        <SubHeading>Public surface</SubHeading>
        <List>
          <li><code>computeStrokes(players, holes)</code> — USGA stroke allocation. Lowest handicap = scratch. Others get <code>floor(diff/18) + (diff%18 ≥ holeSI ? 1 : 0)</code> strokes per hole. Returns <code>Map&lt;playerId, Map&lt;holeNumber, strokes&gt;&gt;</code>.</li>
          <li><code>computeMatch(&#123; players, holes, scores &#125;)</code> — best-ball match play. Returns <code>&#123; status, holesPlayed, upA, upB, holeResults[], strokesByPlayer &#125;</code>.</li>
          <li><code>formatStatus(status)</code> — "AS" | "3 UP" | "DORMIE" | "3 &amp; 2".</li>
          <li><code>winnerSide(status)</code> — <code>'A' | 'B' | 'halved' | null</code>.</li>
        </List>
        <SubHeading>Match status state machine</SubHeading>
        <List>
          <li><code>not_started</code> — 0 holes scored.</li>
          <li><code>in_progress</code> — both sides scored at least one hole; carries leader + up + remaining.</li>
          <li><code>dormie</code> — leader is up by exactly the remaining hole count.</li>
          <li><code>closed</code> — leader's up &gt; remaining; match mathematically decided ("3 &amp; 2"). Post-closure scores can still be entered but don't change the result.</li>
          <li><code>halved</code> — 18 holes played, all square.</li>
        </List>
        <SubHeading>Integration</SubHeading>
        <List>
          <li><code>getMatchScoringData(matchId)</code> in <code>lib/data/match-scoring.ts</code> pulls DB rows and shapes them into engine inputs. Reads <code>tripHandicap</code> (fallback <code>users.handicap</code>, fallback 18).</li>
          <li><code>upsertHoleScore</code> inserts/updates a row in <code>holeScores</code>, then calls <code>recomputeMatchStatus(matchId)</code> which writes <code>matches.status</code>, <code>winningTeamId</code>, <code>isHalved</code>, <code>resultText</code>.</li>
          <li>Handicaps come out of Drizzle as strings (numeric type). Always <code>Number(...)</code> before passing to engine.</li>
        </List>
      </Section>

      <Section id="portraits" title="9. Arcade portraits">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          NBA Jam–style portrait generated from a user's photo. Stored on <code>users</code> (platform-wide, reused
          across trips).
        </p>
        <SubHeading>Flow</SubHeading>
        <ol className="mt-1 list-decimal pl-5 text-sm text-zinc-700 dark:text-zinc-300 space-y-1">
          <li>User uploads a photo → Vercel Blob URL stored as <code>avatarUrl</code>.</li>
          <li>Click "Generate portrait" → server action <code>generateMyArcadePortrait</code> (self) or <code>generateArcadePortraitForPlayer</code> (admin).</li>
          <li><code>generateArcadePortrait(sourceUrl)</code> in <code>lib/portraits/generate.ts</code>: fetch photo → sharp normalize (rotate, resize ≤1024, sRGB PNG) → OpenAI <code>images.edit</code> with <code>gpt-image-1</code>, baked prompt, transparent background → sharp trim+extend-to-square → Vercel Blob upload.</li>
          <li>Save <code>arcadePortraitUrl</code>, <code>arcadePortraitSourceUrl</code>, <code>arcadePortraitGeneratedAt</code> on users.</li>
        </ol>
        <SubHeading>Display priority</SubHeading>
        <p className="text-sm text-zinc-700 dark:text-zinc-300">
          <code>&lt;MemberAvatar /&gt;</code>: <code>arcadePortraitUrl</code> → <code>avatarUrl</code> → monogram fallback.
          Portraits only appear on hero surfaces (match detail, profile). Dense lists (scoreboard, feed, header) keep
          the regular photo.
        </p>
        <SubHeading>Errors</SubHeading>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Action returns a tagged result type instead of throwing: <code>NO_API_KEY</code>, <code>SOURCE_FETCH_FAILED</code>,{' '}
          <code>OPENAI_FAILED</code>, <code>NO_IMAGE_DATA</code>, <code>BLOB_UPLOAD_FAILED</code>. The button surfaces
          the <code>detail</code> string. <code>STYLE_VERSION = 10</code> — bump when prompt changes.
        </p>
      </Section>

      <Section id="migrations" title="10. Migration history">
        <Table
          head={['#', 'What it added']}
          rows={[
            ['0000', 'Initial: users, trips, teams, tripMembers, rounds, teeTimes, matches, matchParticipants, holeScores, courses, courseHoles, media, messages, tripInvites'],
            ['0001', 'tripEvents table + trip_event_type enum'],
            ['0002', 'tripEvents.address'],
            ['0003', 'courses.imageUrl'],
            ['0004', 'tripMembers.avatarUrl'],
            ['0005', 'tripMembers flight fields'],
            ['0006', 'holeScores unique (matchId, tripMemberId, holeNumber)'],
            ['0007', 'reactions table + reaction_target_kind enum'],
            ['0008', 'rounds.isHidden'],
            ['0009', 'media moderation (status, reason, checkedAt)'],
            ['0010', 'courses.address, scorecardImageUrl, scorecardExtractedAt'],
            ['0011', 'courseHoles unique (courseId, holeNumber)'],
            ['0012', 'tripInvites code/uses/expiry; users.defaultTripId'],
            ['0013', 'courseTees + courseTeeYardages tables'],
            ['0014', 'rounds.courseTeeId'],
            ['0015', 'trips.imageUrl'],
            ['0016', 'users.arcadePortrait{Url,SourceUrl,GeneratedAt}'],
            ['0017', 'tripMembers.email made nullable (shell players)'],
            ['0018', 'users.username (unique) + city, state, clubName'],
          ]}
        />
        <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">
          Workflow rule: every migration ships as a standalone SQL block + an <code>INSERT INTO
          drizzle.__drizzle_migrations</code> tracker row. Run in Neon SQL editor, confirm, <em>then</em> push the
          schema-dependent code.
        </p>
      </Section>

      <Section id="conventions" title="11. Conventions & guardrails">
        <List>
          <li>kebab-case directories; <code>PascalCase.tsx</code> components; <code>camelCase.ts</code> utilities.</li>
          <li>Every trip-scoped query MUST filter by <code>trip_id</code>. No global player list.</li>
          <li>All permission checks go through <code>lib/auth/permissions.ts</code>. Never inline a role check in a route or action.</li>
          <li>Server actions over API routes for mutations.</li>
          <li>No RLS. No Supabase. No Prisma. Permissions live in application code.</li>
          <li>No CSS-in-JS. Tailwind v4 only.</li>
          <li>Match-play engine in <code>lib/scoring/</code> stays pure. No DB calls, no I/O.</li>
          <li>v1 UI is hardcoded for Pinehurst-style single-trip use. Schema is multi-tenant; UI isn't (yet).</li>
        </List>
      </Section>

      <footer className="mt-16 border-t border-zinc-200 dark:border-zinc-900 pt-6">
        <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-zinc-600">
          Generated from a full-codebase survey. Update this page when the app changes — it's the map.
        </p>
      </footer>
    </article>
  );
}

function Toc() {
  const items = [
    ['overview', 'Architecture'],
    ['bugs', 'Known security issues'],
    ['roles', 'Roles & permission cascade'],
    ['claims', 'Auth & lazy-claim'],
    ['tables', 'Data model'],
    ['routes', 'Routes'],
    ['actions', 'Server actions'],
    ['scoring', 'Scoring engine'],
    ['portraits', 'Arcade portraits'],
    ['migrations', 'Migrations'],
    ['conventions', 'Conventions'],
  ] as const;
  return (
    <nav className="mt-10 rounded-lg border border-zinc-200 dark:border-zinc-900 bg-zinc-950/50 p-4">
      <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.3em] text-zinc-500">Contents</p>
      <ol className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
        {items.map(([id, label], i) => (
          <li key={id} className="text-zinc-700 dark:text-zinc-300 hover:text-yellow-400">
            <a href={`#${id}`}>
              <span className="text-zinc-600">{String(i + 1).padStart(2, '0')}.</span> {label}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}

function Section({
  id,
  title,
  warn,
  children,
}: {
  id: string;
  title: string;
  warn?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="mt-14 scroll-mt-6">
      <h2 className={`flex items-center gap-2 text-2xl font-bold tracking-tight ${warn ? 'text-red-400' : ''}`}>
        {warn && <AlertTriangle size={20} />}
        {title}
      </h2>
      <div className="mt-4 space-y-2">{children}</div>
    </section>
  );
}

function SubHeading({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-6 font-mono text-[10px] font-semibold uppercase tracking-[0.3em] text-zinc-500">{children}</p>
  );
}

function List({ children }: { children: React.ReactNode }) {
  return <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-zinc-700 dark:text-zinc-300">{children}</ul>;
}

function Table({ head, rows }: { head: readonly string[]; rows: readonly (readonly string[])[] }) {
  return (
    <div className="mt-3 overflow-x-auto rounded-md border border-zinc-200 dark:border-zinc-900">
      <table className="w-full border-collapse text-left text-xs">
        <thead className="bg-white dark:bg-zinc-950">
          <tr>
            {head.map((h) => (
              <th
                key={h}
                className="border-b border-zinc-200 dark:border-zinc-900 px-3 py-2 font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-zinc-200 dark:border-zinc-900/60 last:border-0">
              {row.map((cell, j) => (
                <td key={j} className="px-3 py-2 align-top text-zinc-700 dark:text-zinc-300">
                  {j === 0 ? <code className="text-zinc-800 dark:text-zinc-200">{cell}</code> : cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Bugs() {
  const bugs: Array<{ title: string; where: string; was: string; now: string }> = [
    {
      title: 'createMediaPost',
      where: 'lib/actions/feed.ts',
      was: 'Only required auth. Any signed-in user could post media to any tripId.',
      now: 'Resolves tripId, then getTripAuthContext(tripId) — rejects if caller is not on the trip.',
    },
    {
      title: 'createTextPost',
      where: 'lib/actions/feed.ts',
      was: 'Same shape — no membership check.',
      now: 'Same fix — getTripAuthContext(tripId) before insert.',
    },
    {
      title: 'unflagMediaPost',
      where: 'lib/actions/feed.ts',
      was: 'Checked "is some trip admin?" not "admin of THIS media\'s trip?"',
      now: 'Fetches media first, then canEditTrip(ctx, media.tripId) via getTripAuthContext(media.tripId).',
    },
    {
      title: 'deleteFeedItem',
      where: 'lib/actions/feed.ts',
      was: 'Admin path used generic admin role, letting Trip A admin delete Trip B posts.',
      now: 'Fetches the row, scopes auth to the row\'s trip, admin check applies only there.',
    },
    {
      title: 'toggleReaction',
      where: 'lib/actions/reactions.ts',
      was: 'No membership check. Any signed-in user could react across all trips.',
      now: 'Resolves target → tripId, then requires membership via getTripAuthContext(tripId).',
    },
    {
      title: 'updateTrip',
      where: 'lib/actions/trips.ts',
      was: 'Used the global context\'s "first" tripMember, so a multi-trip admin could update the wrong trip.',
      now: 'Uses getTripAuthContext(id) for the specific trip being edited.',
    },
  ];
  return (
    <ol className="mt-3 space-y-3 text-sm">
      {bugs.map((b) => (
        <li
          key={b.title}
          className="rounded-md border border-emerald-900/40 bg-emerald-950/10 p-3"
        >
          <p className="flex items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-300">
            <ShieldCheck size={12} />
            {b.title} <span className="text-emerald-500/60">·</span>{' '}
            <span className="text-zinc-500">{b.where}</span>
          </p>
          <p className="mt-1 text-zinc-600 dark:text-zinc-400">
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-red-400">Was:</span> {b.was}
          </p>
          <p className="mt-1 text-zinc-700 dark:text-zinc-300">
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-emerald-400">Now:</span> {b.now}
          </p>
        </li>
      ))}
    </ol>
  );
}

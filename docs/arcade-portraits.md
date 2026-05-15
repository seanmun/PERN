# Arcade portraits (NBA-Jam-style)

> Planning doc. The aesthetic is what makes or breaks this feature, so the **prompt + reference design** are the part that needs the most iteration. Code is shallow once the look is locked.

## Goal

Each signed-in user uploads a regular photo of themselves. We run it through an image model and produce a **16-bit Sega Genesis NBA Jam style arcade portrait** — pixelated, dramatic, glowing — re-styled in the app's **hunter green + gold** palette so it lives natively next to the rest of the UI.

The generated portrait replaces the regular avatar in **broadcast moments** (match detail face-to-face, future matchup-reveal screen, scoreboard hero) while the regular photo stays on smaller / more functional places (header, lists).

## Locked decisions

1. **Provider:** OpenAI `gpt-image-1` (best prompt control, single SDK, predictable output).
2. **Scope:** Platform-wide — stored on `users`, one portrait per Clerk user, reused across every trip they join.

## Schema additions

Three nullable columns on `users`:

```
users.arcade_portrait_url          text   -- generated portrait (Vercel Blob)
users.arcade_portrait_source_url   text   -- the user's source photo used as input;
                                          -- preserved so re-generation doesn't need re-upload
users.arcade_portrait_generated_at timestamptz
```

Optional fourth: `users.arcade_portrait_style_version` (int, default 1) so if we ever change the prompt and want to re-generate everyone, we know who's on the old style.

## The prompt (this is the work)

The aesthetic comes from the prompt + reference image. Starting point:

```
Create a 16-bit Sega Genesis arcade-game style portrait of the person in
the reference image. Keep their face, skin tone, hair, and identifying
features clearly recognizable.

STYLE:
- Pixelated CRT-era video game art, NBA Jam Tournament Edition (1994)
  energy: chunky pixels, hard shadows, dramatic side lighting, sweat
  beads, intense expression.
- The subject is a golfer wearing a polo shirt; optional golf visor or
  cap. Mid-swing posture or holding a golf club, chest-up framing.
- Color palette restricted to hunter green (#14532d), bright gold
  (#eab308), black, and the subject's natural skin/hair tones.
- Background: glowing green-and-gold radial flames or burst lines
  exploding outward, like an arcade character-select intro card.
- Square aspect ratio, 1024x1024.

DO NOT:
- Add text, logos, names, scoreboards, or watermarks.
- Use blue, red, or purple anywhere.
- Photorealism — keep it stylized and pixelated.
```

This prompt is going to need 5–10 iterations. The plan should treat it as **editable in code**, not a one-shot. We may want a "Style preview" admin tool that re-runs the same prompt on a sample image to see the current look.

## OpenAI API call

`gpt-image-1` supports both generation from text and **image edits** (img2img). We use the edit endpoint so the subject's face survives:

```ts
import OpenAI from 'openai';
const client = new OpenAI();

const res = await client.images.edit({
  model: 'gpt-image-1',
  image: sourcePhotoBuffer,  // the user's avatar
  prompt: PROMPT,
  size: '1024x1024',
  // no mask — we want the whole image re-styled
});

// res.data[0].b64_json — base64 PNG
// upload to Vercel Blob, write URL to users.arcade_portrait_url
```

**Cost:** roughly $0.04 per image at `medium` quality, $0.16 at `high`. For 12 players × a few iterations = under $5 total. Trivial.

**Latency:** 15–45 seconds per generation. UI needs a loading state and graceful retry.

## UX flow

### `/me/edit` — player generates their own

1. Existing avatar upload stays as-is — this is the *normal* photo.
2. New section below it: **"Arcade portrait"**
   - If user has no source photo yet: prompt them to upload their regular avatar first; arcade generation requires it.
   - Big preview tile: shows current portrait (or a placeholder card).
   - **"Generate portrait"** button (disabled while a generation is in flight).
   - **"Regenerate"** / **"Clear"** controls once one exists.
3. On generate: server action runs OpenAI call, uploads result to Blob, updates `users` row.
4. Page revalidates and shows the new portrait.

### `/admin/players/[id]/edit` — admin generates on behalf of someone else

Same controls for the trip admin / platform admin so they can pre-bake portraits for players who haven't logged in yet (post-trip-creation roster prep).

This requires the player to have **already uploaded a normal photo first** — admin can do that on their behalf via the existing player edit form.

### Display

Where portraits appear (in descending order of impact):

| Surface | Use portrait? | Fallback |
|---|---|---|
| `/matches/[id]` face-to-face hero | ✅ | Regular avatar → monogram |
| Future matchup-reveal cinematic | ✅ | (Designed around portraits) |
| `/profile/[id]` hero | ✅ | Regular avatar → monogram |
| `/scoreboard` rows | regular avatar | (Smaller cards; portrait too busy) |
| `/feed` post avatars | regular avatar | (Same reason) |
| Header avatar | regular avatar | (Tiny; portrait wasted at that size) |

Rule of thumb: **portrait on hero / dramatic surfaces, regular photo on dense lists.**

## Phased build

| Phase | Scope |
|---|---|
| 0 | This doc + your sign-off on prompt direction |
| 1 | Schema + migration, OpenAI SDK install, `OPENAI_API_KEY` env wired |
| 2 | `lib/portraits/generate.ts` — image edit call + Blob upload + DB write |
| 3 | Server action `generateArcadePortrait` + `/me/edit` UI hookup |
| 4 | Prompt iteration: generate 3–5 test portraits on real photos, tune the prompt until you like the look |
| 5 | Wire portraits into `/matches/[id]` showdown view + `/profile/[id]` hero, with fallback to regular avatar |
| 6 | Admin-side regenerate on `/admin/players/[id]/edit` |
| 7 | (Optional) Style versioning + re-generate-all admin action |

Phases 1–3 are mechanical. **Phase 4 (prompt iteration) is the actual project** — schedule extra time there.

## Open decisions

1. **`gpt-image-1` quality tier** — medium ($0.04/img) is fine for v1; high ($0.16) only if portraits look soft.
2. **Source image requirement** — should we enforce a face being detectable in the source photo before allowing generation? (Could use OpenAI's safety/check or just trust the user. Probably trust.)
3. **Public preview** — should non-portrait-having players see a "(no portrait yet)" pill on their own profile, prompting them to generate one? Or stay silent and just show the regular avatar?
4. **NSFW gate** — generated images go through OpenAI's safety pipeline, but should we **also** run Sightengine on the OUTPUT before saving? Probably overkill for this group; skip.
5. **Style consistency** — if two players use very different source-photo lighting, the portraits may look stylistically inconsistent next to each other. Open question: do we want a final "color-graded" step (post-processing to force palette), or trust the prompt?

## Out of scope (deferred)

- Matchup-reveal cinematic (this is the showcase but it's a separate phase 8 polish task)
- Animated/lenticular portraits
- Custom style packs (e.g. a Streetfighter or Madden look for other trips)
- Voice lines / sound effects on matchup reveal

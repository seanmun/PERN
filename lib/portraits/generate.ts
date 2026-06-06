import 'server-only';
import { put } from '@vercel/blob';
import OpenAI from 'openai';

/**
 * NBA-Jam-style arcade portrait generator.
 *
 * Takes the URL of a regular avatar photo, sends it to OpenAI gpt-image-1 as
 * the image-edit input along with the baked aesthetic prompt, then uploads
 * the generated PNG to Vercel Blob and returns the new URL.
 *
 * Returns null on missing API key or model failure — callers must handle
 * gracefully (the source photo is unchanged and can be regenerated).
 */

const MODEL = 'gpt-image-1';
const SIZE = '1024x1024';
// 'high' costs ~$0.16/image vs 'medium' ~$0.04, but the extra detail noticeably
// improves face likeness — the whole point of this feature.
const QUALITY: 'low' | 'medium' | 'high' = 'high';

// Prompt — see docs/arcade-portraits.md "The prompt (this is the work)".
// Iterating this string is the entire feature; if you want to evolve the
// look, change PROMPT and bump STYLE_VERSION so admin tooling can identify
// portraits made on the old style later.
export const STYLE_VERSION = 5; // v5: identity-first prompt, quality bumped to 'high'

const PROMPT = `Create a 16-bit arcade-game roster-card portrait of the SPECIFIC PERSON in the reference image. The reference photo is the ground truth for identity — the pixel-art style is a layer applied on top of THIS person, not a generic character inspired by them.

IDENTITY — THIS IS THE MOST IMPORTANT REQUIREMENT:
- The face in the output MUST be clearly identifiable as the same person in the reference photo. A friend should look at the result and immediately recognize them.
- Preserve EXACTLY (in pixel-art form): facial structure, jawline shape and width, cheekbone position, chin shape, brow line and brow shape, nose bridge and nose tip shape, nostril width, mouth width and lip shape, ear shape and size, forehead height.
- Preserve EXACTLY: skin tone, eye color, eye shape, eyebrow color and thickness.
- Preserve EXACTLY: hair color, hair length, hair texture (straight/wavy/curly), hairline shape, and any part / styling visible in the reference.
- Preserve EXACTLY: facial hair (beard, mustache, stubble, goatee, sideburns) — pattern, density, color, and coverage. If clean-shaven in the reference, the output is clean-shaven.
- Preserve any other distinguishing features visible in the reference: glasses (same frame style/color), freckles, dimples, scars, moles, ear piercings, neck tattoos.
- The "slight caricature" allowed by the arcade aesthetic is ONLY a small exaggeration of features the person already has — not invention. Do not add or remove features.

CROP:
- The image shows the subject's HEAD, NECK, and UPPER CHEST only.
- The BOTTOM EDGE of the canvas cuts the subject across the upper chest, just below the collarbone. Nothing below the upper chest is visible.
- The subject's ARMS, HANDS, ELBOWS, WAIST, and everything below the chest are CROPPED OUT OF FRAME entirely — they are not in the picture at all.
- Because the arms and hands are not in the picture, the subject cannot be holding anything. No golf club, no sports equipment, no bat, no ball, no flag, no tee.
- Subject faces forward or 3/4 angle, confident expression. Static portrait, like a yearbook headshot or trading-card photo. No motion, no swing.
- Subject is wearing a plain collared polo shirt. Collar and top button area visible. No hat, no cap, no visor, no sunglasses (unless the reference person wears prescription glasses, in which case preserve them).
- Square aspect ratio, 1024x1024.

STYLE:
- Pixel art, 16-bit / Sega Genesis / SNES era. Reference points: NBA Jam Tournament Edition (1994) roster cards, Ken Griffey Jr. Baseball portraits, Madden / NHL / PGA Tour player-select screens from the 1990s, Golden Tee Golf character cards, and modern indie pixel-art games inspired by those titles.
- "Hall of Fame / Legendary tier RPG character icon" energy — confident, slightly heroic, slightly stoic.
- Chunky visible pixels and pixel-perfect dithering for shading. Hard CRT-era shadows, not soft anti-aliased gradients.
- Bright arcade-style stage lighting from the front; clean soft shadow on the off-side of the face.
- Color palette grounded in hunter green (#14532d), bright gold (#eab308), black, and the subject's natural skin/hair tones. Subtle gold metallic highlights on the polo's shoulders, collar trim, or shirt buttons sell the "legendary" feel.

BACKGROUND:
- The image MUST have a fully transparent background (PNG alpha channel = 0 outside the subject).
- The subject is isolated — no scenery, no scoreboard, no frame inside the image, no checkerboard or dithered backdrop, no shadow plate, no halo, no aura, no glow.
- A gold frame and a gold-checkered backdrop are drawn AROUND the portrait by the app via CSS at render time. The model must NOT draw them. Leave every pixel outside the subject's silhouette fully transparent.
- Do not fill the background with any color — not green, not gold, not black, not white, not gray.

DO NOT, UNDER ANY CIRCUMSTANCES:
- Draw a generic person instead of this specific person. The reference is the identity; the style is a finish, not a replacement.
- Change the subject's facial structure, skin tone, eye color, hair, or facial hair to look "more cinematic" or "more heroic."
- Draw a golf club. There are no clubs in this picture. The subject's hands are not in the picture.
- Draw any sports equipment, bat, ball, flag, tee, towel, or held object.
- Show arms, hands, elbows, the subject's waist, or anything below the upper chest.
- Add text, logos, names, jersey numbers, scoreboards, or watermarks.
- Use blue, red, or purple anywhere.
- Use photorealism, smooth gradients, or anti-aliasing — keep it stylized pixel art.
- Draw a frame, border, vignette, or background pattern.`;

export type PortraitResult = {
  url: string;
  styleVersion: number;
};

export async function generateArcadePortrait(
  sourcePhotoUrl: string,
): Promise<PortraitResult | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.warn('[portrait] OPENAI_API_KEY missing — skipping generation');
    return null;
  }

  // 1. Pull the source bytes. OpenAI's images.edit endpoint needs the actual
  // image, not a URL — so we fetch from Vercel Blob (or wherever) first.
  let sourceFile: File;
  try {
    const sourceRes = await fetch(sourcePhotoUrl);
    if (!sourceRes.ok) {
      throw new Error(
        `Source photo fetch failed: ${sourceRes.status} ${sourceRes.statusText}`,
      );
    }
    const contentType = sourceRes.headers.get('content-type') ?? 'image/png';
    const buf = await sourceRes.arrayBuffer();
    const ext = contentType.includes('jpeg') ? 'jpg' : 'png';
    sourceFile = new File([buf], `source.${ext}`, { type: contentType });
  } catch (err) {
    console.warn('[portrait] failed to fetch source photo', err);
    return null;
  }

  // 2. Hit OpenAI's image-edit endpoint with the baked prompt.
  const client = new OpenAI({ apiKey });
  let b64: string | undefined;
  try {
    const res = await client.images.edit({
      model: MODEL,
      image: sourceFile,
      prompt: PROMPT,
      size: SIZE,
      quality: QUALITY,
      // Returns PNG with a true alpha channel — the subject is isolated and
      // can be composited on team colors / hero backgrounds elsewhere in app.
      background: 'transparent',
    });
    b64 = res.data?.[0]?.b64_json ?? undefined;
  } catch (err) {
    console.warn('[portrait] OpenAI image edit failed', err);
    return null;
  }
  if (!b64) {
    console.warn('[portrait] OpenAI returned no b64_json');
    return null;
  }

  // 3. Upload the generated PNG to Vercel Blob.
  const pngBuffer = Buffer.from(b64, 'base64');
  const filename = `portraits/arcade-${Date.now()}-${Math.floor(Math.random() * 1e6)}.png`;
  try {
    const blob = await put(filename, pngBuffer, {
      access: 'public',
      contentType: 'image/png',
      addRandomSuffix: false,
    });
    return { url: blob.url, styleVersion: STYLE_VERSION };
  } catch (err) {
    console.warn('[portrait] Blob upload failed', err);
    return null;
  }
}

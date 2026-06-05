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
const QUALITY: 'low' | 'medium' | 'high' = 'medium';

// Prompt — see docs/arcade-portraits.md "The prompt (this is the work)".
// Iterating this string is the entire feature; if you want to evolve the
// look, change PROMPT and bump STYLE_VERSION so admin tooling can identify
// portraits made on the old style later.
export const STYLE_VERSION = 2; // v2: transparent background (no flame burst)

const PROMPT = `Create a 16-bit Sega Genesis arcade-game style portrait of the person in the reference image. Keep their face, skin tone, hair, and identifying features clearly recognizable.

STYLE:
- Pixelated CRT-era video game art, NBA Jam Tournament Edition (1994) energy: chunky pixels, hard shadows, dramatic side lighting, sweat beads, intense expression.
- The subject is a golfer wearing a polo shirt; optional golf visor or cap. Mid-swing posture or holding a golf club, chest-up framing.
- Color palette restricted to hunter green (#14532d), bright gold (#eab308), black, and the subject's natural skin/hair tones.
- Square aspect ratio, 1024x1024.

BACKGROUND:
- The image MUST have a fully transparent background (PNG alpha channel = 0 outside the subject).
- The subject is isolated — no scenery, no flames, no burst lines, no scoreboard, no surrounding effects, no shadow plate, no halo, no aura.
- This portrait will be composited at render time over the player's team-color HTML background (a CSS background-color, typically hunter green #14532d or bright gold #eab308). Every pixel outside the subject's silhouette must be fully transparent so the underlying webpage background color shows through cleanly.
- Do not fill the background with any color — not green, not gold, not black, not white, not gray. Leave it transparent.

DO NOT:
- Add text, logos, names, scoreboards, or watermarks.
- Use blue, red, or purple anywhere.
- Photorealism — keep it stylized and pixelated.`;

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

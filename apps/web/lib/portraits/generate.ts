import 'server-only';
import { put } from '@vercel/blob';
import OpenAI from 'openai';
import sharp from 'sharp';

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
export const STYLE_VERSION = 10; // v10: faithful-to-source, but force a golf polo regardless of source clothing

const PROMPT = `Take the reference photo and produce a 1994-NBA-Jam-style digitized portrait of the SAME PERSON, with the SAME everything, just pixelated and with the background removed.

GOAL — THIS IS THE WHOLE BRIEF:
The output should look like someone fed the reference photo into a 1994 16-bit arcade game's photo digitizer: modest pixelation, color palette reduced to about 32–64 colors, subtle posterization banding. Otherwise the output is the SAME image as the reference — same person, same pose, same accessories, same framing, same expression — minus the background, and the subject's clothing is swapped to a golf polo shirt.

FAITHFUL TO THE SOURCE:
- The face MUST be clearly recognizable as the same person. Preserve exactly: facial structure, jawline, cheekbones, chin, brow, nose, mouth, ears, forehead, skin tone, eye color, eyebrows, hair color, hair length, hairline, facial hair pattern, freckles, dimples, scars, moles, piercings, tattoos.
- POSE / EXPRESSION: match the reference. If they're smiling in the reference, they're smiling in the output. Same head angle. Same gaze direction. Same expression.
- CLOTHING: this is the ONE exception to faithfulness. The subject is wearing a plain collared golf POLO SHIRT in the output, regardless of what they're wearing in the reference photo. Polo collar and the top button area are visible. Polo color is a flat neutral (light/medium gray, white, or muted green/gold). Do not draw a tee shirt, hoodie, jacket, sweater, button-down, jersey, suit, tank top, or anything else — always a golf polo.
- HEADWEAR: if the reference person is wearing a cap, visor, golf hat, beanie, snapback, bucket hat, or any other headwear, preserve it in the same style, color, and orientation (forward / backward / sideways). If bareheaded, leave them bareheaded. Do NOT invent or remove headwear.
- EYEWEAR: preserve prescription glasses (same frame style and color), sunglasses (same shape, frames, lens tint), or nothing — match the reference. Do NOT invent or remove eyewear.
- FRAMING: match the reference's crop. If the reference is head-and-shoulders, the output is head-and-shoulders. If the reference is a wider shot or shows the person from the chest up, match that. Do not change the framing.

STYLE — 1994 NBA JAM TOURNAMENT EDITION DIGITIZER:
- Modest pixelation: the image looks like a real photo passed through a 16-bit arcade game's low-res digitizer. The face still reads as a real human photo that has been color-reduced and pixelated by old hardware.
- NOT chunky retro pixel-art. NOT Minecraft blocks. NOT painterly. NOT illustrated. NOT indie-pixel-art-style. Reference: the actual 1994 NBA Jam Tournament Edition player portraits.
- Color palette reduced to roughly 32–64 colors per face — smooth tonal regions with subtle banding instead of photorealistic gradients.
- Lighting matches the reference photo. Do NOT restage or relight the subject.

BACKGROUND — REMOVED:
- The image MUST have a fully transparent background (PNG alpha channel = 0 outside the subject's silhouette).
- Whatever was behind the subject in the reference (room, sky, foliage, indoor scene, wall, fabric) is GONE. Cut the subject out and leave everything else fully transparent.
- Do NOT replace the background with another color, gradient, scene, frame, glow, halo, shadow plate, checkerboard, dither, or pattern.
- The app draws a gold frame and team-color backdrop around the portrait via CSS at render time. The model draws only the subject.

DO NOT:
- Draw a generic person — the reference is the identity.
- Change the subject's accessories, headwear, eyewear, hair, or facial hair.
- Restage the subject in a different pose, expression, head angle, or gaze.
- Draw the original clothing from the reference photo — always swap to a plain golf polo shirt.
- Make the result chunky, blocky, Minecraft-style, indie-pixel-art-style, or painterly.
- Add text, logos, names, jersey numbers, scoreboards, watermarks, frames, borders, vignettes, or background patterns.
- Replace the background — leave it transparent.`;

export type PortraitOk = {
  ok: true;
  url: string;
  styleVersion: number;
};

export type PortraitErr = {
  ok: false;
  /** Machine-readable bucket for logging / metrics. */
  reason:
    | 'NO_API_KEY'
    | 'SOURCE_FETCH_FAILED'
    | 'OPENAI_FAILED'
    | 'NO_IMAGE_DATA'
    | 'BLOB_UPLOAD_FAILED';
  /** Human-readable detail, surfaced to the admin running the action. */
  detail: string;
};

export type PortraitResult = PortraitOk | PortraitErr;

export async function generateArcadePortrait(
  sourcePhotoUrl: string,
): Promise<PortraitResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return {
      ok: false,
      reason: 'NO_API_KEY',
      detail:
        'OPENAI_API_KEY is not set. Add it in Vercel → Settings → Environment Variables (or .env.local for local dev) and redeploy.',
    };
  }

  // 1. Pull the source bytes. OpenAI's images.edit endpoint accepts ONLY
  // PNG in standard sRGB mode — so we normalize via sharp regardless of
  // what came in (iPhone HEIC, browser-compressed WebP, JPEG, etc.).
  let sourceFile: File;
  try {
    const sourceRes = await fetch(sourcePhotoUrl);
    if (!sourceRes.ok) {
      return {
        ok: false,
        reason: 'SOURCE_FETCH_FAILED',
        detail: `Couldn't fetch the source photo from ${sourcePhotoUrl} — got ${sourceRes.status} ${sourceRes.statusText}.`,
      };
    }
    const sourceBuf = Buffer.from(await sourceRes.arrayBuffer());

    // Normalize: force sRGB, convert to PNG, cap at 1024×1024 (gpt-image-1's
    // edit size). `withoutEnlargement` preserves small images at native size.
    const pngBuf = await sharp(sourceBuf)
      .rotate() // honor EXIF orientation; phone photos are often sideways otherwise
      .resize(1024, 1024, { fit: 'inside', withoutEnlargement: true })
      .toColorspace('srgb')
      .png()
      .toBuffer();

    // Wrap as a Uint8Array so File's BlobPart typing accepts it across
    // Node and edge runtimes (Buffer extends Uint8Array but the global File
    // type doesn't always recognize Buffer as a BlobPart).
    sourceFile = new File([new Uint8Array(pngBuf)], 'source.png', {
      type: 'image/png',
    });
  } catch (err) {
    return {
      ok: false,
      reason: 'SOURCE_FETCH_FAILED',
      detail: `Source photo fetch/normalize threw: ${err instanceof Error ? err.message : String(err)}`,
    };
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
    // OpenAI's SDK throws an APIError with a useful `.message` and `.status`.
    const detail =
      err instanceof Error ? err.message : 'Unknown OpenAI error.';
    console.error('[portrait] OpenAI image edit failed', err);
    return {
      ok: false,
      reason: 'OPENAI_FAILED',
      detail: `OpenAI rejected the request: ${detail}`,
    };
  }
  if (!b64) {
    return {
      ok: false,
      reason: 'NO_IMAGE_DATA',
      detail:
        'OpenAI accepted the request but returned no image data. Try again, or use a clearer source photo.',
    };
  }

  // 3. Trim transparent padding so every portrait fills its canvas
  // consistently, then re-pad to a square. gpt-image-1 places the subject
  // somewhere inside the 1024×1024 canvas with transparent surroundings —
  // the bounding box of the subject varies per generation. CSS can't fix
  // that, so we normalize on the server: trim alpha edges, then extend
  // back to a square with a transparent border. After this every portrait
  // has its subject tight against the canvas edges, so 2v2 matchup cards
  // render with all four players at the same visual scale.
  const rawBuffer = Buffer.from(b64, 'base64');
  let normalizedBuffer: Buffer;
  try {
    const trimmed = await sharp(rawBuffer)
      .trim({
        background: { r: 0, g: 0, b: 0, alpha: 0 },
        threshold: 10,
      })
      .toBuffer();
    const meta = await sharp(trimmed).metadata();
    if (!meta.width || !meta.height) {
      normalizedBuffer = rawBuffer;
    } else {
      const size = Math.max(meta.width, meta.height);
      const padH = size - meta.width;
      const padV = size - meta.height;
      normalizedBuffer = await sharp(trimmed)
        .extend({
          top: Math.floor(padV / 2),
          bottom: Math.ceil(padV / 2),
          left: Math.floor(padH / 2),
          right: Math.ceil(padH / 2),
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        })
        .png()
        .toBuffer();
    }
  } catch (err) {
    // If sharp chokes for any reason, fall back to the raw output rather
    // than failing the whole generation.
    console.warn('[portrait] post-trim failed, using untrimmed PNG', err);
    normalizedBuffer = rawBuffer;
  }

  // 4. Upload the trimmed PNG to Vercel Blob.
  const filename = `portraits/arcade-${Date.now()}-${Math.floor(Math.random() * 1e6)}.png`;
  try {
    const blob = await put(filename, normalizedBuffer, {
      access: 'public',
      contentType: 'image/png',
      addRandomSuffix: false,
    });
    return { ok: true, url: blob.url, styleVersion: STYLE_VERSION };
  } catch (err) {
    const detail =
      err instanceof Error ? err.message : 'Unknown Vercel Blob error.';
    console.error('[portrait] Blob upload failed', err);
    return {
      ok: false,
      reason: 'BLOB_UPLOAD_FAILED',
      detail: `Generated image but couldn't save it to Vercel Blob: ${detail}`,
    };
  }
}

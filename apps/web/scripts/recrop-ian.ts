/**
 * One-off: re-crop /public/homepage/arcade-ian.png so Ian's head fills the
 * same proportion of the canvas as Dan / Kyle / Sean. The AI generated Ian
 * as a wider "head + chest" shot instead of "head + shoulders" — crops the
 * bottom of the image so what remains is just head + upper shoulders.
 *
 *   npx tsx scripts/recrop-ian.ts
 */
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';

const FILE = join(process.cwd(), 'public', 'homepage', 'arcade-ian.png');

// Fraction of the SUBJECT's height to keep, measured from the top. Adjust
// up/down if the result still doesn't match the others (smaller = tighter
// to face; larger = more shoulders).
const KEEP_FRACTION = 0.72;

async function main(): Promise<void> {
  const buf = await readFile(FILE);

  // Find the subject's bounding box by trimming alpha — gives us the actual
  // pixels the subject occupies, not the surrounding transparent canvas.
  const trimmedBuf = await sharp(buf)
    .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 }, threshold: 10 })
    .toBuffer();
  const trimMeta = await sharp(trimmedBuf).metadata();
  if (!trimMeta.width || !trimMeta.height) {
    console.error('Could not read trimmed metadata');
    process.exit(1);
  }

  const subjectW = trimMeta.width;
  const subjectH = trimMeta.height;
  const keepH = Math.round(subjectH * KEEP_FRACTION);

  console.log(`Subject (after trim): ${subjectW}×${subjectH}`);
  console.log(`Keeping top ${KEEP_FRACTION * 100}% → ${subjectW}×${keepH}`);

  const croppedBuf = await sharp(trimmedBuf)
    .extract({ left: 0, top: 0, width: subjectW, height: keepH })
    .toBuffer();

  // Re-square so the file dimensions stay square.
  const size = Math.max(subjectW, keepH);
  const padH = size - subjectW;
  const padV = size - keepH;
  const finalBuf = await sharp(croppedBuf)
    .extend({
      top: Math.floor(padV / 2),
      bottom: Math.ceil(padV / 2),
      left: Math.floor(padH / 2),
      right: Math.ceil(padH / 2),
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();

  await writeFile(FILE, finalBuf);
  console.log(`Wrote ${FILE} at ${size}×${size}`);
}

main().then(() => process.exit(0));

/**
 * One-off: trim transparent padding from the homepage showcase portraits so
 * all four subjects render at the same visual scale in the marketing
 * matchup card.
 *
 * gpt-image-1 places the subject somewhere inside a 1024×1024 canvas, with
 * the surrounding pixels transparent. Different generations end up with
 * the subject at different scales relative to the canvas. CSS can't fix
 * this — the browser doesn't know where the subject ends.
 *
 * This script reads each `/public/homepage/arcade-*.png` file, sharp.trim()s
 * the transparent borders, re-pads to a square (transparent background) so
 * the image stays square + each subject's bounding box now fills the file.
 * Result: when the four images render at the same display size, the
 * subjects appear at consistent scale.
 *
 * Run once after dropping new portraits in. Re-runs are safe (no-op on
 * already-trimmed files).
 *
 * Usage:
 *   npx tsx scripts/trim-homepage-portraits.ts
 */

import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';

const HOMEPAGE_DIR = join(process.cwd(), 'public', 'homepage');
const PATTERN = /^arcade-.+\.png$/i;

async function trimOne(filePath: string): Promise<void> {
  const buf = await readFile(filePath);
  const original = sharp(buf);
  const meta = await original.metadata();
  if (!meta.width || !meta.height) {
    console.warn(`  skip (no dims): ${filePath}`);
    return;
  }

  // Trim transparent edges. threshold=10 ignores near-zero alpha to handle
  // any subpixel fringing from the AI output.
  const trimmedBuf = await sharp(buf)
    .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 }, threshold: 10 })
    .toBuffer();

  const trimmedMeta = await sharp(trimmedBuf).metadata();
  if (!trimmedMeta.width || !trimmedMeta.height) {
    console.warn(`  skip (couldn't read trimmed): ${filePath}`);
    return;
  }

  const w = trimmedMeta.width;
  const h = trimmedMeta.height;

  // No meaningful trim happened — file was already tight.
  if (w === meta.width && h === meta.height) {
    console.log(`  already tight: ${filePath} (${w}×${h})`);
    return;
  }

  // Re-pad to a square so the file stays square. Keeps transparent border.
  const size = Math.max(w, h);
  const horizontalPad = size - w;
  const verticalPad = size - h;
  const finalBuf = await sharp(trimmedBuf)
    .extend({
      top: Math.floor(verticalPad / 2),
      bottom: Math.ceil(verticalPad / 2),
      left: Math.floor(horizontalPad / 2),
      right: Math.ceil(horizontalPad / 2),
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();

  await writeFile(filePath, finalBuf);
  console.log(
    `  trimmed: ${filePath}  ${meta.width}×${meta.height} → ${size}×${size} (subject ${w}×${h})`,
  );
}

async function main(): Promise<void> {
  const entries = await readdir(HOMEPAGE_DIR);
  const targets = entries.filter((e) => PATTERN.test(e));
  if (targets.length === 0) {
    console.log(`No arcade-*.png files found in ${HOMEPAGE_DIR}`);
    return;
  }

  console.log(`Trimming ${targets.length} file(s) in ${HOMEPAGE_DIR}`);
  for (const name of targets) {
    await trimOne(join(HOMEPAGE_DIR, name));
  }
  console.log('Done.');
}

main().then(() => process.exit(0));

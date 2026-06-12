#!/usr/bin/env node
/**
 * Add light-mode variants to a Tailwind-styled file. Reads the file, finds
 * dark-only classes, and prepends a light counterpart while keeping the
 * existing class as a `dark:` variant.
 *
 * Idempotent — skips classes that already have a `dark:` sibling.
 *
 * Usage: node scripts/themify.mjs path/to/file.tsx [path/to/another.tsx ...]
 */
import { promises as fs } from 'node:fs';

// Map: dark default → light counterpart. Longest patterns first so partial
// matches (bg-zinc-950 inside bg-zinc-950/40) don't fire prematurely.
const SWAPS = [
  // Backgrounds — opacity variants
  ['bg-zinc-950/40', 'bg-zinc-50'],
  ['bg-zinc-950/60', 'bg-zinc-50'],
  ['bg-zinc-950/20', 'bg-zinc-50'],
  ['bg-zinc-950/30', 'bg-zinc-50'],
  ['bg-zinc-900/40', 'bg-zinc-100'],
  ['bg-zinc-900/60', 'bg-zinc-100'],
  ['bg-zinc-900/20', 'bg-zinc-100'],
  ['bg-zinc-900/30', 'bg-zinc-100'],
  // Solid dark surfaces
  ['bg-zinc-950', 'bg-white'],
  ['bg-zinc-900', 'bg-zinc-100'],
  ['bg-black/30', 'bg-zinc-50'],
  ['bg-black/40', 'bg-zinc-50'],
  ['bg-black/50', 'bg-zinc-50'],
  ['bg-black/60', 'bg-zinc-50'],
  ['bg-black/80', 'bg-white/80'],
  ['bg-black/95', 'bg-white/95'],
  ['bg-black', 'bg-white'],
  // Hovers
  ['hover:bg-zinc-900/40', 'hover:bg-zinc-100'],
  ['hover:bg-zinc-900', 'hover:bg-zinc-100'],
  ['hover:bg-zinc-950', 'hover:bg-zinc-50'],
  // Text
  ['text-zinc-100', 'text-zinc-900'],
  ['text-zinc-200', 'text-zinc-800'],
  ['text-zinc-300', 'text-zinc-700'],
  ['text-zinc-400', 'text-zinc-600'],
  // 500/600 sit in the middle — leave alone, they read on both backgrounds
  ['text-white', 'text-zinc-900'],
  // Borders
  ['border-zinc-950', 'border-zinc-200'],
  ['border-zinc-900/60', 'border-zinc-200'],
  ['border-zinc-900', 'border-zinc-200'],
  ['border-zinc-800', 'border-zinc-300'],
  ['border-zinc-700', 'border-zinc-400'],
  ['border-zinc-600', 'border-zinc-500'],
  // divide-y variants
  ['divide-zinc-900', 'divide-zinc-200'],
  ['divide-zinc-800', 'divide-zinc-300'],
];

const FILES = process.argv.slice(2);
if (FILES.length === 0) {
  console.error('Usage: node scripts/themify.mjs <file> [file ...]');
  process.exit(1);
}

for (const file of FILES) {
  let content = await fs.readFile(file, 'utf-8');
  let touched = 0;
  for (const [dark, light] of SWAPS) {
    // Negative lookbehind: don't match if already prefixed with dark: or
    // with another classname segment (the variant is the FULL class).
    // Followed by a non-class character (space, quote, backtick, etc.).
    const escaped = dark.replace(/[.*+?^${}()|[\]\\\/]/g, '\\$&');
    const re = new RegExp(
      `(?<![:\\-/\\w])${escaped}(?![\\-/\\w])`,
      'g',
    );
    content = content.replace(re, (match, offset) => {
      // Skip if the match is already preceded by "dark:" (the lookbehind
      // above misses this when there's whitespace between the prefix and
      // the class — but we use space-delimited classes, so the regex
      // already handles `dark:bg-zinc-950`).
      const before = content.slice(Math.max(0, offset - 5), offset);
      if (before.endsWith('dark:')) return match;
      touched++;
      return `${light} dark:${match}`;
    });
  }
  await fs.writeFile(file, content);
  console.log(`themified ${file}: ${touched} classes`);
}

import 'server-only';
import Anthropic from '@anthropic-ai/sdk';

/**
 * Scorecard → structured data via Claude vision, with extended thinking.
 *
 * Returns par + stroke index per hole, plus a per-tee yardage matrix
 * (Black / Blue / White / etc. — every tee box shown on the card).
 *
 * Returns null when the model output doesn't look right — caller falls back
 * to manual data entry rather than writing garbage into the DB.
 */

export type ExtractedHole = {
  holeNumber: number;       // 1..18
  par: number;              // 3..6
  handicapIndex: number;    // 1..18, permutation across the 18 holes
};

export type ExtractedTee = {
  name: string;                            // "Black", "Blue", "White", "Senior", "Red", "Forward"
  color: string | null;                    // "#000000" if printed on the card
  rating: number | null;                   // course rating
  slope: number | null;                    // slope rating
  totalYardage: number | null;             // sum across 18, optional
  yardages: Record<number, number>;        // holeNumber -> yardage (1..18, may be partial if some are illegible)
};

export type ExtractedScorecard = {
  holes: ExtractedHole[];                  // exactly 18
  tees: ExtractedTee[];                    // 1..N
};

const MODEL = 'claude-sonnet-4-6';
const THINKING_BUDGET = 5_000;
const MAX_TOKENS = 12_000;

const PROMPT = `You are extracting structured data from a photo of a golf scorecard.

## What I need

A JSON object with this exact shape:

{
  "holes": [
    { "holeNumber": 1, "par": 4, "handicapIndex": 7 },
    ...18 entries, holes 1..18 in any order
  ],
  "tees": [
    {
      "name": "Black",                      // the tee's printed name
      "color": "#000000",                   // hex color if the card prints one, else null
      "rating": 75.2,                       // course rating (e.g. 71.6, 73.4) if shown, else null
      "slope": 145,                         // slope rating if shown, else null
      "totalYardage": 7245,                 // if the card prints a 18-hole total, else null
      "yardages": { "1": 432, "2": 178, ... } // hole-by-hole yardages from THIS tee
    },
    ...one entry per tee box on the card (typically 3–5)
  ]
}

## Field rules

- "par" must be an integer 3–6.
- "handicapIndex" is the "Hcp", "Hdcp", "SI", or "Stroke Index" column.
  1 = hardest, 18 = easiest. Across all 18 holes this must be a permutation of 1..18.
- "yardages" values are integers in yards. Omit a hole if illegible — do NOT
  guess. The yardages object may have fewer than 18 entries on a partial read.
- "totalYardage" should match (or closely approximate) the sum of the 18
  per-hole yardages from the same tee — only set it when the card clearly
  prints an "OUT + IN" or "TOTAL" cell for that tee.

## Common confusions to avoid

- The "OUT" row (front-9 totals) and "IN" row (back-9 totals) are NOT holes.
  Skip them entirely — they do not become entries in "holes".
- Some cards show separate yardage columns per tee labeled at the top.
  Each labeled column is a separate tee — include every one.
- The card may be rotated 90° in the photo. Read it in whatever orientation
  makes the hole numbers sequential.
- The handicap index column is sometimes near the par row and sometimes near
  the women's tees — read carefully and only count it once.
- Yardages can be confused with par; par is always 3–6, yardages are 80+.
- If a tee is named only by color in the photo (e.g. "Red"), use that as the
  name and set color accordingly.

## Output

Return ONLY the JSON object. No prose, no markdown fences, no commentary.

If the image is not a readable scorecard, or you can't extract at least
one full set of par + handicap index across the 18 holes, return:

{ "holes": [], "tees": [] }`;

export async function extractScorecardFromUrl(
  imageUrl: string
): Promise<ExtractedScorecard | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.warn('[scorecard] ANTHROPIC_API_KEY missing — skipping extraction');
    return null;
  }

  const client = new Anthropic({ apiKey });

  let raw: string;
  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      thinking: { type: 'enabled', budget_tokens: THINKING_BUDGET },
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'url', url: imageUrl } },
            { type: 'text', text: PROMPT },
          ],
        },
      ],
    });

    // Find the text block (extended thinking puts a separate "thinking" block first).
    const textBlock = response.content.find((b) => b.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      console.warn('[scorecard] no text block in response');
      return null;
    }
    raw = textBlock.text.trim();
  } catch (err) {
    console.warn('[scorecard] Anthropic call failed', err);
    return null;
  }

  // Strip any accidental code fences
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/, '')
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    console.warn('[scorecard] JSON parse failed; raw output:', raw.slice(0, 300));
    return null;
  }

  return validate(parsed);
}

function validate(parsed: unknown): ExtractedScorecard | null {
  if (typeof parsed !== 'object' || parsed === null) return null;
  const obj = parsed as Record<string, unknown>;

  const holes = validateHoles(obj.holes);
  if (!holes) return null;

  const tees = validateTees(obj.tees);
  if (!tees) return null;

  return { holes, tees };
}

function validateHoles(parsed: unknown): ExtractedHole[] | null {
  if (!Array.isArray(parsed)) return null;
  if (parsed.length === 0) return [];
  if (parsed.length !== 18) return null;

  const out: ExtractedHole[] = [];
  const seenHoleNumbers = new Set<number>();
  const seenSI = new Set<number>();

  for (const row of parsed) {
    if (typeof row !== 'object' || row === null) return null;
    const r = row as Record<string, unknown>;

    const holeNumber = Number(r.holeNumber);
    const par = Number(r.par);
    const handicapIndex = Number(r.handicapIndex);

    if (!Number.isInteger(holeNumber) || holeNumber < 1 || holeNumber > 18) return null;
    if (!Number.isInteger(par) || par < 3 || par > 6) return null;
    if (!Number.isInteger(handicapIndex) || handicapIndex < 1 || handicapIndex > 18) return null;
    if (seenHoleNumbers.has(holeNumber)) return null;
    if (seenSI.has(handicapIndex)) return null;

    seenHoleNumbers.add(holeNumber);
    seenSI.add(handicapIndex);

    out.push({ holeNumber, par, handicapIndex });
  }

  out.sort((a, b) => a.holeNumber - b.holeNumber);
  return out;
}

function validateTees(parsed: unknown): ExtractedTee[] | null {
  if (!Array.isArray(parsed)) return null;

  const out: ExtractedTee[] = [];
  const seenNames = new Set<string>();

  for (const row of parsed) {
    if (typeof row !== 'object' || row === null) return null;
    const r = row as Record<string, unknown>;

    const name = typeof r.name === 'string' ? r.name.trim() : '';
    if (!name) return null;
    if (seenNames.has(name.toLowerCase())) continue; // dedupe accidental repeats
    seenNames.add(name.toLowerCase());

    const color = typeof r.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(r.color.trim())
      ? r.color.trim().toLowerCase()
      : null;

    const rating = numericOrNull(r.rating, 50, 100);
    const slope = integerOrNull(r.slope, 55, 200);
    const totalYardage = integerOrNull(r.totalYardage, 800, 9000);

    const yardages: Record<number, number> = {};
    if (r.yardages && typeof r.yardages === 'object') {
      for (const [k, v] of Object.entries(r.yardages as Record<string, unknown>)) {
        const hole = Number(k);
        const y = Number(v);
        if (!Number.isInteger(hole) || hole < 1 || hole > 18) continue;
        if (!Number.isInteger(y) || y < 50 || y > 800) continue;
        yardages[hole] = y;
      }
    }

    out.push({ name, color, rating, slope, totalYardage, yardages });
  }

  return out;
}

function numericOrNull(v: unknown, min: number, max: number): number | null {
  if (v == null) return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  if (n < min || n > max) return null;
  return n;
}

function integerOrNull(v: unknown, min: number, max: number): number | null {
  if (v == null) return null;
  const n = Number(v);
  if (!Number.isInteger(n)) return null;
  if (n < min || n > max) return null;
  return n;
}

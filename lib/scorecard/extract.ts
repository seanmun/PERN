import 'server-only';
import Anthropic from '@anthropic-ai/sdk';

/**
 * Scorecard → hole-data extraction via Claude vision.
 *
 * Takes a hosted image URL (Vercel Blob), sends it to Claude with a
 * structured-extraction prompt, and returns a validated array of 18 hole
 * rows ready to insert into course_holes.
 *
 * Returns null when the model output doesn't look right — caller falls back
 * to manual data entry rather than writing garbage into the DB.
 */

export type ExtractedHole = {
  holeNumber: number;       // 1..18
  par: number;              // 3..6
  yardage: number | null;   // sometimes missing on simpler scorecards
  handicapIndex: number;    // 1..18, must be a permutation of 1..18 across the 18 holes
};

const MODEL = 'claude-sonnet-4-6';

const PROMPT = `You are extracting data from a golf scorecard photo.

Return ONLY valid JSON (no commentary, no markdown fences). The JSON must be
an array of exactly 18 objects, one per hole, in this shape:

{ "holeNumber": <1..18>,
  "par": <3..6>,
  "yardage": <integer in yards, or null if not legible>,
  "handicapIndex": <1..18, the "Hcp" / "HDCP" / "Stroke Index" column;
                    1 = hardest, 18 = easiest; across the 18 holes this
                    column must be a permutation of 1..18> }

If multiple tee yardages are shown, use the white/middle/regular tees.
If the scorecard shows separate front-9 and back-9 totals, do not include
those rows — only the 18 individual holes.

If the image is not a readable scorecard, return [].`;

export async function extractScorecardFromUrl(
  imageUrl: string
): Promise<ExtractedHole[] | null> {
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
      max_tokens: 1500,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'url', url: imageUrl },
            },
            { type: 'text', text: PROMPT },
          ],
        },
      ],
    });

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
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    console.warn('[scorecard] JSON parse failed; raw output:', raw.slice(0, 300));
    return null;
  }

  return validate(parsed);
}

function validate(parsed: unknown): ExtractedHole[] | null {
  if (!Array.isArray(parsed) || parsed.length !== 18) return null;

  const out: ExtractedHole[] = [];
  const seenHoleNumbers = new Set<number>();
  const seenSI = new Set<number>();

  for (const row of parsed) {
    if (typeof row !== 'object' || row === null) return null;
    const r = row as Record<string, unknown>;

    const holeNumber = Number(r.holeNumber);
    const par = Number(r.par);
    const handicapIndex = Number(r.handicapIndex);
    const yardageRaw = r.yardage;
    const yardage =
      yardageRaw == null ? null : Number(yardageRaw);

    if (!Number.isInteger(holeNumber) || holeNumber < 1 || holeNumber > 18) return null;
    if (!Number.isInteger(par) || par < 3 || par > 6) return null;
    if (!Number.isInteger(handicapIndex) || handicapIndex < 1 || handicapIndex > 18) return null;
    if (yardage != null && (!Number.isInteger(yardage) || yardage < 50 || yardage > 800)) {
      return null;
    }
    if (seenHoleNumbers.has(holeNumber)) return null;
    if (seenSI.has(handicapIndex)) return null;

    seenHoleNumbers.add(holeNumber);
    seenSI.add(handicapIndex);

    out.push({ holeNumber, par, yardage, handicapIndex });
  }

  out.sort((a, b) => a.holeNumber - b.holeNumber);
  return out;
}

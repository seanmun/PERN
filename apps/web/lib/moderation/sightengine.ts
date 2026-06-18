import 'server-only';

/**
 * Sightengine moderation client.
 *
 * Calls the public `check.json` endpoint with a hosted image URL and a list of
 * models, then maps the per-category scores into a single "flagged"/"clean"
 * decision plus a reason string. Thresholds live here — easy to tune.
 */

const ENDPOINT = 'https://api.sightengine.com/1.0/check.json';

// Only flag the categories we actually care about. Lifestyle stuff (beer,
// gestures, profanity OCR) is intentionally absent.
const THRESHOLDS = {
  nudityExplicit: 0.7,
  violenceProb: 0.8,
  goreProb: 0.8,
  selfHarmProb: 0.5,
  hateProb: 0.7,
} as const;

// 4 ops per check. Free tier = 2000 ops/mo → ~500 image uploads.
const MODELS = ['nudity-2.1', 'violence', 'self-harm', 'offensive-2.0'];

export type ModerationResult =
  | { flagged: false }
  | { flagged: true; reason: string };

type SightengineNumeric = number | undefined | null;

interface SightengineResponse {
  status?: string;
  error?: { message?: string };
  nudity?: {
    sexual_activity?: SightengineNumeric;
    sexual_display?: SightengineNumeric;
    erotica?: SightengineNumeric;
  };
  violence?: { prob?: SightengineNumeric };
  gore?: { prob?: SightengineNumeric };
  'self-harm'?: { prob?: SightengineNumeric };
  offensive?: {
    nazi?: SightengineNumeric;
    confederate?: SightengineNumeric;
    supremacist?: SightengineNumeric;
    terrorist?: SightengineNumeric;
  };
}

export async function moderateImage(
  imageUrl: string
): Promise<ModerationResult> {
  const apiUser = process.env.SIGHTENGINE_API_USER;
  const apiSecret = process.env.SIGHTENGINE_API_SECRET;
  if (!apiUser || !apiSecret) {
    // Fail open: if creds are missing, don't block uploads. Log so it shows up
    // in deploy logs.
    console.warn('[moderation] Sightengine creds missing — skipping check');
    return { flagged: false };
  }

  const params = new URLSearchParams({
    url: imageUrl,
    models: MODELS.join(','),
    api_user: apiUser,
    api_secret: apiSecret,
  });

  let data: SightengineResponse;
  try {
    const res = await fetch(`${ENDPOINT}?${params.toString()}`);
    data = (await res.json()) as SightengineResponse;
  } catch (err) {
    console.warn('[moderation] Sightengine request failed', err);
    return { flagged: false };
  }

  if (data.status !== 'success') {
    console.warn('[moderation] Sightengine returned non-success', data);
    return { flagged: false };
  }

  const num = (n: SightengineNumeric): number => (typeof n === 'number' ? n : 0);

  // Nudity: only flag explicit categories. Allow suggestive / shirtless / etc.
  const sexual =
    Math.max(num(data.nudity?.sexual_activity), num(data.nudity?.sexual_display)) ;
  if (sexual >= THRESHOLDS.nudityExplicit) {
    return { flagged: true, reason: 'nudity' };
  }

  if (num(data.violence?.prob) >= THRESHOLDS.violenceProb) {
    return { flagged: true, reason: 'violence' };
  }

  if (num(data.gore?.prob) >= THRESHOLDS.goreProb) {
    return { flagged: true, reason: 'gore' };
  }

  if (num(data['self-harm']?.prob) >= THRESHOLDS.selfHarmProb) {
    return { flagged: true, reason: 'self-harm' };
  }

  const hateMax = Math.max(
    num(data.offensive?.nazi),
    num(data.offensive?.confederate),
    num(data.offensive?.supremacist),
    num(data.offensive?.terrorist)
  );
  if (hateMax >= THRESHOLDS.hateProb) {
    return { flagged: true, reason: 'hate symbols' };
  }

  return { flagged: false };
}

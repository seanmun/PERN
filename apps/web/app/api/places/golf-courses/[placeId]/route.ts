import { NextResponse } from 'next/server';

/**
 * Place details + first photo URL for a selected golf course.
 *
 *   GET /api/places/golf-courses/{placeId}
 *
 * Response:
 *   { name, address, location, imageUrl }
 *
 * `location` is built from addressComponents — "City, ST" — so the
 * existing Course.location column reads cleanly. `imageUrl` is a
 * googleusercontent.com CDN URL (no API key needed to render), captured
 * by following the redirect from the Place Photo endpoint.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ placeId: string }> },
) {
  const { placeId } = await params;
  if (!placeId) {
    return NextResponse.json({ error: 'placeId required' }, { status: 400 });
  }

  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'GOOGLE_PLACES_API_KEY is not set' },
      { status: 500 },
    );
  }

  try {
    const detailsRes = await fetch(
      `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`,
      {
        headers: {
          'X-Goog-Api-Key': apiKey,
          // Field mask drives both response shape AND billing — keep
          // it minimal.
          'X-Goog-FieldMask':
            'displayName,formattedAddress,addressComponents,photos,location',
        },
      },
    );

    if (!detailsRes.ok) {
      const text = await detailsRes.text();
      return NextResponse.json(
        { error: 'Places details error', detail: text },
        { status: detailsRes.status },
      );
    }

    type AddrComp = { types?: string[]; shortText?: string; longText?: string };
    type Photo = { name?: string };
    const data: {
      displayName?: { text?: string };
      formattedAddress?: string;
      addressComponents?: AddrComp[];
      photos?: Photo[];
      location?: { latitude?: number; longitude?: number };
    } = await detailsRes.json();

    const name = data.displayName?.text ?? '';
    const address = data.formattedAddress ?? '';

    // "City, ST" — pulled from the address components.
    const findComp = (type: string) =>
      data.addressComponents?.find((c) => c.types?.includes(type));
    const city = findComp('locality')?.longText ?? findComp('postal_town')?.longText ?? '';
    const state = findComp('administrative_area_level_1')?.shortText ?? '';
    const location = [city, state].filter(Boolean).join(', ');

    // Resolve the first photo to a real CDN URL. The Place Photo
    // endpoint returns a 302 to googleusercontent.com; we follow it
    // server-side and save the final URL so the client never needs
    // the API key.
    let imageUrl: string | null = null;
    const photoName = data.photos?.[0]?.name;
    if (photoName) {
      const photoRes = await fetch(
        `https://places.googleapis.com/v1/${photoName}/media?maxWidthPx=1600&skipHttpRedirect=true`,
        { headers: { 'X-Goog-Api-Key': apiKey } },
      );
      if (photoRes.ok) {
        const photoData: { photoUri?: string } = await photoRes.json();
        imageUrl = photoData.photoUri ?? null;
      }
    }

    return NextResponse.json({
      name,
      address,
      location,
      imageUrl,
      latitude: data.location?.latitude ?? null,
      longitude: data.location?.longitude ?? null,
    });
  } catch (err) {
    console.error('[places/details]', err);
    return NextResponse.json(
      { error: 'Upstream failed' },
      { status: 502 },
    );
  }
}

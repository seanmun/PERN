import { NextResponse } from 'next/server';

/**
 * Google Places Autocomplete proxy. Server-side so the API key never
 * hits the client. Filters to golf-course primary types so the
 * suggestions are relevant for the New Course form.
 *
 *   GET /api/places/golf-courses?q=pinehurst
 *
 * Response:
 *   { suggestions: [{ placeId, mainText, secondaryText }] }
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get('q') ?? '').trim();
  if (q.length < 2) return NextResponse.json({ suggestions: [] });

  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'GOOGLE_PLACES_API_KEY is not set' },
      { status: 500 },
    );
  }

  try {
    const res = await fetch(
      'https://places.googleapis.com/v1/places:autocomplete',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': apiKey,
        },
        body: JSON.stringify({
          input: q,
          includedPrimaryTypes: ['golf_course'],
        }),
      },
    );

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json(
        { error: 'Places API error', detail: text },
        { status: res.status },
      );
    }

    const data = await res.json();
    type Prediction = {
      placePrediction?: {
        placeId?: string;
        structuredFormat?: {
          mainText?: { text?: string };
          secondaryText?: { text?: string };
        };
      };
    };
    const suggestions = (data.suggestions ?? []).flatMap((s: Prediction) => {
      const p = s.placePrediction;
      if (!p?.placeId) return [];
      return [
        {
          placeId: p.placeId,
          mainText: p.structuredFormat?.mainText?.text ?? '',
          secondaryText: p.structuredFormat?.secondaryText?.text ?? '',
        },
      ];
    });

    return NextResponse.json({ suggestions });
  } catch (err) {
    console.error('[places/autocomplete]', err);
    return NextResponse.json(
      { error: 'Upstream failed' },
      { status: 502 },
    );
  }
}

import { NextResponse } from 'next/server';
import {
  handleUpload,
  type HandleUploadBody,
} from '@vercel/blob/client';
import { getAuthContext } from '@/lib/auth/current-user';
import { isPlatformAdmin, isTripAdminOf } from '@/lib/auth/permissions';
import { db } from '@/db/client';
import { trips } from '@/db/schema';

const MAX_BYTES = 8 * 1024 * 1024; // 8 MB per file

export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async () => {
        // Authorize: must be a trip admin or platform admin.
        const ctx = await getAuthContext();
        if (!ctx) throw new Error('Not authenticated');

        const [trip] = await db.select().from(trips).limit(1);
        if (!trip) throw new Error('No trip configured');

        const canUpload =
          isPlatformAdmin(ctx) || isTripAdminOf(ctx, trip.id);
        if (!canUpload) throw new Error('Not authorized');

        return {
          allowedContentTypes: [
            'image/jpeg',
            'image/png',
            'image/webp',
            'image/avif',
            'image/gif',
          ],
          maximumSizeInBytes: MAX_BYTES,
          addRandomSuffix: true,
        };
      },
      onUploadCompleted: async () => {
        // No-op. Local dev doesn't reach this callback anyway.
      },
    });

    return NextResponse.json(jsonResponse);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Upload failed';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

import { NextResponse } from 'next/server';
import {
  handleUpload,
  type HandleUploadBody,
} from '@vercel/blob/client';
import { getAuthContext } from '@/lib/auth/current-user';

const MAX_BYTES = 8 * 1024 * 1024; // 8 MB per file

export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async () => {
        // Any signed-in user can upload (avatars, etc.). Write-scope per
        // resource is enforced when the URL is saved back to the DB.
        const ctx = await getAuthContext();
        if (!ctx) throw new Error('Not authenticated');

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

'use client';

import imageCompression from 'browser-image-compression';

/**
 * Shrink a phone-camera image before uploading.
 *
 * Phone photos are typically 3–6 MB at 4032×3024. The feed renders at
 * mobile width, so that's wasteful for upload, storage, and bandwidth on
 * the trip's spotty Pinehurst cell signal. We resize to a sensible max
 * dimension and re-encode (usually to WebP, which gives ~30–60% smaller
 * files than JPEG at the same visual quality).
 *
 * Falls back to the original file if compression fails — we never block
 * an upload on this step.
 */
export async function compressImage(file: File): Promise<File> {
  // Only attempt compression on raster images. Videos / SVGs pass through.
  if (!file.type.startsWith('image/')) return file;
  if (file.type === 'image/svg+xml') return file;
  if (file.type === 'image/gif') return file; // preserve animation

  try {
    const compressed = await imageCompression(file, {
      maxSizeMB: 1,             // cap output around 1 MB
      maxWidthOrHeight: 2400,   // 2400px long edge handles retina display
      useWebWorker: true,
      // Keep PNG as PNG (transparency); convert JPEG/HEIC/etc. to WebP.
      fileType: file.type === 'image/png' ? 'image/png' : 'image/webp',
      initialQuality: 0.82,
    });

    // If the "compressed" output somehow ended up bigger, stick with the original.
    if (compressed.size >= file.size) return file;
    return compressed;
  } catch (err) {
    console.warn('[compress] image compression failed — uploading original', err);
    return file;
  }
}

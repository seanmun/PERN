'use client';

import { useEffect, useRef } from 'react';

export default function HomeBgVideo({
  src,
  loopAt,
}: {
  src: string;
  loopAt: number;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;

    function onTimeUpdate() {
      if (!v) return;
      if (v.currentTime >= loopAt) {
        v.currentTime = 0;
        // Defensive: ensure it's still playing after seek.
        const playPromise = v.play();
        if (playPromise && typeof playPromise.catch === 'function') {
          playPromise.catch(() => {});
        }
      }
    }

    v.addEventListener('timeupdate', onTimeUpdate);
    return () => v.removeEventListener('timeupdate', onTimeUpdate);
  }, [loopAt]);

  // CSS mask fades the bottom of the video into the page background so the
  // iStock watermark (which lives in the bottom strip of the source file)
  // disappears smoothly. Adjust the percentages if the watermark sits higher.
  const maskGradient =
    'linear-gradient(180deg, black 0%, black 72%, transparent 92%)';

  return (
    <video
      ref={videoRef}
      src={src}
      autoPlay
      loop
      muted
      playsInline
      preload="auto"
      className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-25"
      style={{
        maskImage: maskGradient,
        WebkitMaskImage: maskGradient,
      }}
      aria-hidden="true"
    />
  );
}

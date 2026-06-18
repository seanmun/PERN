'use client';

import { useState } from 'react';
import ImagePickerInput from '@/components/ImagePickerInput';
import PortraitGeneratorButton from '@/components/portraits/PortraitGeneratorButton';

/**
 * Profile photo + arcade portrait section, sharing live URL state.
 *
 * The photo picker drives a single `url` useState. The portrait generator
 * button reads that same state, so the moment a new image is uploaded the
 * button sees it — no need to Save the surrounding form first.
 */
export default function PhotoWithPortraitSection({
  photoName,
  photoDefaultValue,
  portraitUrl,
  redirectTo,
  targetTripMemberId,
  targetLabel,
}: {
  photoName: string;
  photoDefaultValue: string | null;
  portraitUrl: string | null;
  redirectTo: string;
  // Admin mode: when set, the button targets THIS player's portrait. When
  // unset, it targets the calling user's own portrait.
  targetTripMemberId?: string;
  targetLabel?: string;
}) {
  const [photoUrl, setPhotoUrl] = useState<string>(photoDefaultValue ?? '');
  const isAdminMode = !!targetTripMemberId;
  const subject = targetLabel?.replace(/'s$/, '') ?? 'your';

  return (
    <div className="space-y-6">
      <div>
        <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.25em] text-zinc-500">
          {isAdminMode ? 'Photo' : 'Profile photo'}
        </span>
        <div className="mt-2">
          <ImagePickerInput
            name={photoName}
            value={photoUrl}
            onChange={setPhotoUrl}
            aspect="1/1"
          />
        </div>
      </div>

      <div className="rounded-sm border border-zinc-300 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/40 p-4">
        <div className="flex items-baseline justify-between gap-2">
          <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.25em] text-yellow-800 dark:text-yellow-500">
            Arcade portrait
          </span>
          <span className="font-mono text-[9px] uppercase tracking-widest text-zinc-600">
            NBA Jam style · AI
          </span>
        </div>
        <p className="mt-1 text-[11px] text-zinc-500">
          {isAdminMode
            ? `Turn ${targetLabel?.replace(/'s$/, '') ?? 'this player'}’s photo into a 16-bit Sega arcade portrait. Used on matchup reveals and player profiles.`
            : 'We take your profile photo and turn it into a 16-bit Sega arcade portrait used on matchup reveals and player profiles.'}
        </p>

        <div className="mt-4 grid grid-cols-[120px_1fr] items-start gap-4">
          <div
            className="aspect-square overflow-hidden rounded-sm border border-zinc-300 dark:border-zinc-800"
            style={{
              backgroundImage:
                'linear-gradient(45deg, rgba(255,255,255,0.04) 25%, transparent 25%, transparent 75%, rgba(255,255,255,0.04) 75%), linear-gradient(45deg, rgba(255,255,255,0.04) 25%, transparent 25%, transparent 75%, rgba(255,255,255,0.04) 75%)',
              backgroundSize: '16px 16px',
              backgroundPosition: '0 0, 8px 8px',
              backgroundColor: '#0a0a0a',
            }}
          >
            {portraitUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={portraitUrl}
                alt={isAdminMode ? `${subject} arcade portrait` : 'Your arcade portrait'}
                className="h-full w-full object-contain"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-center font-mono text-[9px] uppercase tracking-widest text-zinc-600">
                No portrait yet
              </div>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <PortraitGeneratorButton
              sourceUrl={photoUrl || null}
              hasPortrait={!!portraitUrl}
              redirectTo={redirectTo}
              targetTripMemberId={targetTripMemberId}
              targetLabel={targetLabel}
            />
            {!photoUrl && (
              <p className="text-[11px] text-zinc-500">
                Upload a profile photo above first — that&apos;s the source the
                AI uses.
              </p>
            )}
            <p className="text-[10px] text-zinc-600">
              Each generation takes 15–45 seconds.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

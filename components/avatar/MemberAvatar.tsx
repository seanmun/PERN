/**
 * Canonical avatar for any member of a trip. Render priority:
 *   1. Arcade portrait (transparent PNG, composited over team color)
 *   2. Regular avatar photo
 *   3. Monogram (first letter on a flat backdrop)
 *
 * One component, used everywhere we show a player's face — header, match
 * detail, schedule cards, feed posts, profile heroes, team rosters. Keeps
 * the "we converted the photo to NBA Jam style, now use it everywhere"
 * promise from breaking down.
 */

type MemberAvatarProps = {
  nickname: string;
  arcadePortraitUrl?: string | null;
  avatarUrl?: string | null;
  teamColor?: string | null;
  /** Size of the rendered avatar in pixels (square). */
  size: number;
  /** Optional class on the outer element (typically for layout). */
  className?: string;
  /** Show a glow + thicker ring around the portrait. Used in big "hero" surfaces. */
  hero?: boolean;
};

export default function MemberAvatar({
  nickname,
  arcadePortraitUrl,
  avatarUrl,
  teamColor,
  size,
  className,
  hero = false,
}: MemberAvatarProps) {
  const color = teamColor ?? '#52525b'; // zinc-600 fallback when teamless
  const ringWidth = hero ? 3 : 2;
  const ringShadow = hero
    ? `0 0 0 ${ringWidth}px ${color}, 0 0 24px ${color}88`
    : `0 0 0 ${ringWidth}px ${color}`;

  const sizePx = `${size}px`;
  const baseStyle: React.CSSProperties = {
    width: sizePx,
    height: sizePx,
    boxShadow: ringShadow,
  };

  if (arcadePortraitUrl) {
    return (
      <div
        className={`shrink-0 overflow-hidden rounded-sm ${className ?? ''}`}
        style={{
          ...baseStyle,
          // Linear gradient gives the arcade portrait some atmospheric depth
          // instead of laying it on a flat brick of color.
          background: `linear-gradient(180deg, ${color} 0%, ${color}cc 70%, ${color}66 100%)`,
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={arcadePortraitUrl}
          alt={nickname}
          className="h-full w-full object-contain"
        />
      </div>
    );
  }

  if (avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={avatarUrl}
        alt={nickname}
        className={`shrink-0 rounded-sm object-cover ${className ?? ''}`}
        style={baseStyle}
      />
    );
  }

  // Monogram fallback
  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-sm bg-zinc-900 font-mono font-bold text-zinc-500 ${className ?? ''}`}
      style={{
        ...baseStyle,
        fontSize: `${Math.max(12, Math.round(size * 0.4))}px`,
      }}
    >
      {nickname.slice(0, 1).toUpperCase()}
    </div>
  );
}

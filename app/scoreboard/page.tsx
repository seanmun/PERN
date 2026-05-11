import { redirect } from 'next/navigation';
import { getAuthContext } from '@/lib/auth/current-user';
import ComingSoon from '@/components/ComingSoon';

export default async function ScoreboardPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect('/sign-in');

  return (
    <ComingSoon
      title="Cup Scoreboard"
      description="Live Ryder-Cup-style team total. Match cards underneath. Updates every 15 seconds during play."
      phase="Phase 4"
    />
  );
}

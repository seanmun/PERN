import { redirect } from 'next/navigation';
import { getAuthContext } from '@/lib/auth/current-user';
import { isPlatformAdmin } from '@/lib/auth/permissions';
import ComingSoon from '@/components/ComingSoon';

export default async function AdminPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect('/sign-in');

  const isAdmin =
    isPlatformAdmin(ctx) || ctx.tripMember?.role === 'trip_admin';

  if (!isAdmin) {
    return (
      <ComingSoon
        title="Admin"
        description="You don't have admin access to this trip."
      />
    );
  }

  return (
    <ComingSoon
      title="Admin"
      description="Trip configuration, roster management, score overrides, and the matchup builder."
      phase="Phase 6"
    />
  );
}

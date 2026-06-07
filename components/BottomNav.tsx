import { getGlobalAuthContext } from '@/lib/auth/current-user';
import BottomNavClient from './BottomNavClient';

export default async function BottomNav() {
  const ctx = await getGlobalAuthContext();
  if (!ctx) return null;

  const isAdmin =
    ctx.isPlatformAdmin || ctx.tripMember?.role === 'trip_admin';

  return <BottomNavClient isAdmin={isAdmin} />;
}

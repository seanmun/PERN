import { getGlobalAuthContext } from '@/lib/auth/current-user';
import BottomNavClient from './BottomNavClient';

export default async function BottomNav() {
  const ctx = await getGlobalAuthContext();
  if (!ctx) return null;
  return <BottomNavClient />;
}

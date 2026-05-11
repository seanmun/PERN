import { redirect } from 'next/navigation';
import { getAuthContext } from '@/lib/auth/current-user';
import ComingSoon from '@/components/ComingSoon';

export default async function SchedulePage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect('/sign-in');

  return (
    <ComingSoon
      title="Schedule"
      description="Six rounds, four courses, twenty-one points across the weekend."
      phase="Phase 4"
    />
  );
}

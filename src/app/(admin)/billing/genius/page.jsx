import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { options as authOptions } from '@/app/api/auth/[...nextauth]/options';
import GeniusWorkspace from '@/components/nemt/GeniusWorkspace';

const ALLOWED_GENIUS_USER_IDS = new Set(['user-16', 'user-20']);

export const metadata = {
  title: 'Genius'
};

const GeniusBillingPage = async () => {
  const session = await getServerSession(authOptions);
  const userId = String(session?.user?.id || '').trim();

  if (!userId || !ALLOWED_GENIUS_USER_IDS.has(userId)) {
    redirect('/billing');
  }

  return <GeniusWorkspace />;
};

export default GeniusBillingPage;

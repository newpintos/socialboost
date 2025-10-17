import { getSupabaseServerClient } from '@/lib/supabase-server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import Button from '@/components/Button';
import Card from '@/components/Card';
import Badge from '@/components/Badge';
import { formatRelativeTime } from '@/lib/utils';
import type { Profile, Generation } from '@socialboost/shared';

export default async function DashboardPage() {
  const supabase = await getSupabaseServerClient();

  // Check authentication
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  // Ensure profile exists (call API route)
  await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/profile/ensure`, {
    method: 'POST',
    headers: {
      cookie: (await import('next/headers')).cookies().toString(),
    },
  });

  // Fetch profile
  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('uid', user.id)
    .single<Profile>();

  // Fetch recent generations
  const { data: generations } = await supabase
    .from('generations')
    .select('*')
    .eq('uid', user.id)
    .order('created_at', { ascending: false })
    .limit(5);

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="mb-2 text-3xl font-bold">Dashboard</h1>
        <p className="text-gray-600">Welcome back! Here&apos;s your account overview.</p>
      </div>

      {/* Stats Cards */}
      <div className="mb-8 grid gap-6 md:grid-cols-3">
        <Card>
          <h3 className="mb-2 text-sm font-medium text-gray-500">Current Plan</h3>
          <p className="text-2xl font-bold capitalize">{profile?.plan || 'Free'}</p>
          {profile?.plan === 'free' && (
            <Link href="/billing">
              <Button variant="outline" size="sm" className="mt-4">
                Upgrade to Pro
              </Button>
            </Link>
          )}
        </Card>

        <Card>
          <h3 className="mb-2 text-sm font-medium text-gray-500">Credits Available</h3>
          <p className="text-2xl font-bold">{profile?.credits || 0}</p>
          <p className="mt-2 text-xs text-gray-500">1 credit = 3 variants</p>
        </Card>

        <Card>
          <h3 className="mb-2 text-sm font-medium text-gray-500">Total Generations</h3>
          <p className="text-2xl font-bold">{generations?.length || 0}</p>
          <Link href="/generate">
            <Button size="sm" className="mt-4">
              Start Generation
            </Button>
          </Link>
        </Card>
      </div>

      {/* Recent Generations */}
      <div>
        <h2 className="mb-4 text-xl font-bold">Recent Generations</h2>

        {generations && generations.length > 0 ? (
          <div className="space-y-4">
            {generations.map((gen: Generation) => (
              <Card key={gen.id} className="flex items-center justify-between">
                <div className="flex-1">
                  <p className="font-medium">
                    {gen.product_description.slice(0, 100)}
                    {gen.product_description.length > 100 ? '...' : ''}
                  </p>
                  <p className="mt-1 text-sm text-gray-500">
                    {formatRelativeTime(gen.created_at)}
                  </p>
                </div>

                <div className="flex items-center gap-4">
                  <Badge status={gen.status} />
                  {gen.status === 'succeeded' && (
                    <Link href={`/results/${gen.id}`}>
                      <Button variant="outline" size="sm">
                        View Results
                      </Button>
                    </Link>
                  )}
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <Card className="text-center">
            <p className="mb-4 text-gray-600">No generations yet. Create your first one!</p>
            <Link href="/generate">
              <Button>Start Generating</Button>
            </Link>
          </Card>
        )}
      </div>
    </div>
  );
}

'use client';

import { getSupabaseBrowserClient } from '@/lib/supabase';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Button from './Button';
import { useEffect, useState } from 'react';

export default function Header() {
  const router = useRouter();
  const supabase = getSupabaseBrowserClient();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadUser = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      setUser(user);
      setLoading(false);
    };
    loadUser();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user || null);
    });

    return () => subscription.unsubscribe();
  }, [supabase]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  return (
    <header className="border-b bg-white">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        <Link href="/" className="text-xl font-bold text-brand-600">
          SocialBoost AI
        </Link>

        <nav className="flex items-center gap-6">
          {!loading && (
            <>
              {user ? (
                <>
                  <Link href="/" className="text-sm text-gray-700 hover:text-gray-900">
                    Dashboard
                  </Link>
                  <Link href="/generate" className="text-sm text-gray-700 hover:text-gray-900">
                    Generate
                  </Link>
                  <Link href="/billing" className="text-sm text-gray-700 hover:text-gray-900">
                    Billing
                  </Link>
                  <Button variant="ghost" size="sm" onClick={handleSignOut}>
                    Sign Out
                  </Button>
                </>
              ) : (
                <Link href="/login">
                  <Button size="sm">Sign In</Button>
                </Link>
              )}
            </>
          )}
        </nav>
      </div>
    </header>
  );
}

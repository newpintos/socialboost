'use client';

import { getSupabaseBrowserClient } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import Button from '@/components/Button';
import Card from '@/components/Card';

export default function LoginPage() {
  const router = useRouter();
  const supabase = getSupabaseBrowserClient();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Check if already logged in
    const checkUser = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        router.push('/');
      }
    };
    checkUser();
  }, [supabase, router]);

  const handleGoogleSignIn = async () => {
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      if (error) {
        console.error('Sign in error:', error);
        alert('Failed to sign in with Google');
      }
    } catch (error) {
      console.error('Unexpected error:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto flex min-h-[calc(100vh-64px)] items-center justify-center px-4">
      <Card className="w-full max-w-md text-center">
        <div className="mb-6">
          <h1 className="mb-2 text-3xl font-bold">Welcome to SocialBoost AI</h1>
          <p className="text-gray-600">
            Create professional social media content with AI. Sign in to get started with 50 free
            credits.
          </p>
        </div>

        <Button onClick={handleGoogleSignIn} disabled={loading} size="lg" className="w-full">
          {loading ? 'Signing in...' : 'Sign in with Google'}
        </Button>

        <div className="mt-6 text-sm text-gray-500">
          <p className="mb-2">What you get:</p>
          <ul className="space-y-1 text-left">
            <li>✓ 50 free credits on signup</li>
            <li>✓ 3 variants per generation</li>
            <li>✓ Studio, Lifestyle, and UGC styles</li>
            <li>✓ Download and copy captions</li>
          </ul>
        </div>
      </Card>
    </div>
  );
}

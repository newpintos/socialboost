'use client';

import { getSupabaseBrowserClient } from '@/lib/supabase';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import Card from '@/components/Card';
import Badge from '@/components/Badge';
import Skeleton from '@/components/Skeleton';
import VariantCard from '@/components/VariantCard';
import Button from '@/components/Button';
import { formatDate } from '@/lib/utils';
import type { Generation } from '@socialboost/shared';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default function ResultsPage() {
  const params = useParams();
  const router = useRouter();
  const genId = params.genId as string;
  const supabase = getSupabaseBrowserClient();

  const [generation, setGeneration] = useState<Generation | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let pollInterval: NodeJS.Timeout;

    const pollGeneration = async () => {
      const { data: updated } = await supabase
        .from('generations')
        .select('*')
        .eq('id', genId)
        .single();

      if (updated) {
        const typedGeneration = updated as Generation;
        console.log('Polling update:', typedGeneration.status);
        setGeneration(typedGeneration);

        // Stop polling if finished
        if (typedGeneration.status === 'succeeded' || typedGeneration.status === 'failed') {
          if (pollInterval) clearInterval(pollInterval);
        }
      }
    };

    const loadGeneration = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push('/login');
        return;
      }

      // Fetch generation initially
      await pollGeneration();
      setLoading(false);

      // Subscribe to realtime updates
      const channel = supabase
        .channel(`generation:${genId}`)
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'generations',
            filter: `id=eq.${genId}`,
          },
          (payload) => {
            console.log('Realtime update received:', payload.new);
            setGeneration(payload.new as Generation);
          }
        )
        .subscribe();

      // Poll every 2 seconds for updates
      pollInterval = setInterval(pollGeneration, 2000);

      return () => {
        supabase.removeChannel(channel);
        if (pollInterval) clearInterval(pollInterval);
      };
    };

    loadGeneration();

    return () => {
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [genId, supabase, router]);

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Skeleton className="mb-4 h-8 w-64" />
        <Skeleton className="mb-8 h-20 w-full" />
        <div className="grid gap-6 md:grid-cols-3">
          <Skeleton className="h-96" />
          <Skeleton className="h-96" />
          <Skeleton className="h-96" />
        </div>
      </div>
    );
  }

  if (!generation) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Card className="text-center">
          <h1 className="mb-2 text-2xl font-bold">Generation Not Found</h1>
          <p className="mb-4 text-gray-600">The generation you&apos;re looking for doesn&apos;t exist.</p>
          <Button onClick={() => router.push('/')}>Go to Dashboard</Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-3xl font-bold">Generation Results</h1>
          <Badge status={generation.status} />
        </div>

        <Card className="mb-4">
          <h3 className="mb-2 text-sm font-medium text-gray-500">Product Description</h3>
          <p className="text-gray-900">{generation.product_description}</p>

          <div className="mt-4 flex gap-4 text-sm text-gray-500">
            <div>
              <span className="font-medium">Created:</span> {formatDate(generation.created_at)}
            </div>
            {generation.started_at && (
              <div>
                <span className="font-medium">Started:</span> {formatDate(generation.started_at)}
              </div>
            )}
            {generation.finished_at && (
              <div>
                <span className="font-medium">Finished:</span> {formatDate(generation.finished_at)}
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* Status-specific content */}
      {generation.status === 'queued' && (
        <Card className="text-center">
          <div className="mb-4">
            <div className="mx-auto h-16 w-16 animate-spin rounded-full border-4 border-gray-200 border-t-brand-600"></div>
          </div>
          <h2 className="mb-2 text-xl font-bold">Queued</h2>
          <p className="text-gray-600">Your generation is waiting to be processed...</p>
        </Card>
      )}

      {generation.status === 'processing' && !generation.result && (
        <Card className="text-center">
          <div className="mb-4">
            <div className="mx-auto h-16 w-16 animate-spin rounded-full border-4 border-gray-200 border-t-brand-600"></div>
          </div>
          <h2 className="mb-2 text-xl font-bold">Processing</h2>
          <p className="text-gray-600">
            Our AI is creating your variants. This usually takes 30-60 seconds...
          </p>
        </Card>
      )}

      {/* Show partial results while images are generating */}
      {generation.status === 'processing' && generation.result && (
        <div>
          <div className="mb-4 rounded-lg bg-blue-50 p-4 text-center">
            <p className="text-blue-900">
              <span className="font-semibold">Generating images...</span> Text content is ready!
              Images will appear as they finish.
            </p>
          </div>
          <h2 className="mb-4 text-xl font-bold">Your Variants</h2>
          <div className="grid gap-6 md:grid-cols-3">
            {generation.result.variants.map((variant, index) => (
              <VariantCard key={index} variant={variant} index={index} />
            ))}
          </div>
        </div>
      )}

      {generation.status === 'failed' && (
        <Card className="border-red-200 bg-red-50">
          <div className="text-center">
            <h2 className="mb-3 text-2xl font-bold text-red-600">Generation Failed</h2>
            <div className="mb-4 rounded-lg bg-white p-4 text-left">
              <p className="mb-2 font-medium text-gray-900">Error Details:</p>
              <p className="whitespace-pre-wrap font-mono text-sm text-gray-700">
                {generation.error || 'An unknown error occurred'}
              </p>
            </div>
            <Button onClick={() => router.push('/generate')} className="mt-2">
              Try Again
            </Button>
          </div>
        </Card>
      )}

      {generation.status === 'succeeded' && generation.result && (
        <div>
          <h2 className="mb-4 text-xl font-bold">Your Variants</h2>
          <div className="grid gap-6 md:grid-cols-3">
            {generation.result.variants.map((variant, index) => (
              <VariantCard key={index} variant={variant} index={index} />
            ))}
          </div>

          <div className="mt-8 text-center">
            <Button onClick={() => router.push('/generate')}>Create Another</Button>
          </div>
        </div>
      )}
    </div>
  );
}

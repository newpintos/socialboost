'use client';

import { getSupabaseBrowserClient } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import Button from '@/components/Button';
import Card from '@/components/Card';
import Badge from '@/components/Badge';
import { formatDate } from '@/lib/utils';
import { showToast } from '@/components/Toast';
import type { Profile, Payment } from '@socialboost/shared';

export default function BillingPage() {
  const router = useRouter();
  const supabase = getSupabaseBrowserClient();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push('/login');
        return;
      }

      // Load profile
      const { data: profileData } = await supabase
        .from('profiles')
        .select('*')
        .eq('uid', user.id)
        .single();

      if (profileData) {
        setProfile(profileData);
      }

      // Load payments
      const { data: paymentsData } = await supabase
        .from('payments')
        .select('*')
        .eq('uid', user.id)
        .order('created_at', { ascending: false });

      if (paymentsData) {
        setPayments(paymentsData);
      }

      setLoading(false);
    };

    loadData();
  }, [supabase, router]);

  const handleStripePurchase = () => {
    showToast('Stripe integration coming soon. Configure webhook in production.', 'info');
    // In production, create Stripe Checkout session with metadata.uid
  };

  const handleRazorpayPurchase = () => {
    showToast('Razorpay integration coming soon. Configure webhook in production.', 'info');
    // In production, create Razorpay Order with notes.uid
  };

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <p>Loading...</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="mb-2 text-3xl font-bold">Billing & Payments</h1>
        <p className="text-gray-600">Manage your subscription and view payment history</p>
      </div>

      {/* Current Plan */}
      <div className="mb-8">
        <h2 className="mb-4 text-xl font-bold">Current Plan</h2>
        <Card className="mb-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="mb-1 text-2xl font-bold capitalize">{profile?.plan}</p>
              <p className="text-gray-600">
                <span className="font-semibold">{profile?.credits}</span> credits available
              </p>
            </div>
            <Badge variant={profile?.plan === 'pro' ? 'success' : 'default'}>
              {profile?.plan === 'pro' ? 'Active' : 'Free Tier'}
            </Badge>
          </div>
        </Card>
      </div>

      {/* Upgrade Options */}
      {profile?.plan === 'free' && (
        <div className="mb-8">
          <h2 className="mb-4 text-xl font-bold">Upgrade to Pro</h2>
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <div className="mb-4">
                <h3 className="mb-2 text-2xl font-bold">Pro Plan</h3>
                <p className="mb-4 text-gray-600">One-time purchase, lifetime access</p>
                <div className="mb-4">
                  <span className="text-4xl font-bold">$49</span>
                  <span className="text-gray-500"> USD</span>
                </div>
                <ul className="mb-6 space-y-2 text-sm">
                  <li>✓ 500 credits instantly</li>
                  <li>✓ Priority processing</li>
                  <li>✓ All style presets</li>
                  <li>✓ Download all variants</li>
                </ul>
                <Button onClick={handleStripePurchase} className="w-full">
                  Pay with Stripe
                </Button>
              </div>
            </Card>

            <Card>
              <div className="mb-4">
                <h3 className="mb-2 text-2xl font-bold">Pro Plan</h3>
                <p className="mb-4 text-gray-600">One-time purchase, lifetime access</p>
                <div className="mb-4">
                  <span className="text-4xl font-bold">₹3,999</span>
                  <span className="text-gray-500"> INR</span>
                </div>
                <ul className="mb-6 space-y-2 text-sm">
                  <li>✓ 500 credits instantly</li>
                  <li>✓ Priority processing</li>
                  <li>✓ All style presets</li>
                  <li>✓ Download all variants</li>
                </ul>
                <Button onClick={handleRazorpayPurchase} className="w-full">
                  Pay with Razorpay
                </Button>
              </div>
            </Card>
          </div>

          <div className="mt-4 rounded-lg bg-blue-50 p-4">
            <p className="text-sm text-blue-900">
              <strong>Note:</strong> This is a demo environment. In production, configure Stripe
              and Razorpay webhooks to automatically upgrade accounts. Test webhook:
            </p>
            <code className="mt-2 block rounded bg-blue-100 p-2 text-xs">
              curl -X POST [YOUR_WEBHOOK_URL] -H &quot;Content-Type: application/json&quot; -d
              &apos;{'{...}'}
              &apos;
            </code>
          </div>
        </div>
      )}

      {/* Payment History */}
      <div>
        <h2 className="mb-4 text-xl font-bold">Payment History</h2>

        {payments.length > 0 ? (
          <div className="space-y-4">
            {payments.map((payment) => (
              <Card key={payment.id} className="flex items-center justify-between">
                <div>
                  <p className="font-medium capitalize">{payment.provider} Payment</p>
                  <p className="text-sm text-gray-500">{formatDate(payment.created_at)}</p>
                </div>

                <div className="text-right">
                  <p className="font-bold">
                    {payment.currency} {(payment.amount_cents / 100).toFixed(2)}
                  </p>
                  <Badge variant={payment.status === 'succeeded' ? 'success' : 'default'}>
                    {payment.status}
                  </Badge>
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <Card className="text-center">
            <p className="text-gray-600">No payment history yet</p>
          </Card>
        )}
      </div>
    </div>
  );
}

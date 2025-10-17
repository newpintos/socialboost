'use client';

import { getSupabaseBrowserClient, getAccessToken } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import Button from '@/components/Button';
import Card from '@/components/Card';
import Textarea from '@/components/Textarea';
import Upload from '@/components/Upload';
import { showToast } from '@/components/Toast';
import { PRESETS } from '@socialboost/shared';
import type { Profile } from '@socialboost/shared';

export default function GeneratePage() {
  const router = useRouter();
  const supabase = getSupabaseBrowserClient();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(false);
  const [description, setDescription] = useState('');
  const [referenceFile, setReferenceFile] = useState<File | null>(null);
  const [selectedPreset, setSelectedPreset] = useState<keyof typeof PRESETS | null>(null);

  useEffect(() => {
    const loadProfile = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push('/login');
        return;
      }

      const { data } = await supabase.from('profiles').select('*').eq('uid', user.id).single();

      if (data) {
        setProfile(data);
      }
    };

    loadProfile();
  }, [supabase, router]);

  const applyPreset = (preset: keyof typeof PRESETS) => {
    setSelectedPreset(preset);
    const presetConfig = PRESETS[preset];
    setDescription((prev) => {
      if (prev.trim()) {
        return `${prev}\n\nStyle: ${presetConfig.hint}`;
      }
      return presetConfig.hint;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!description.trim() || description.trim().length < 10) {
      showToast('Description must be at least 10 characters', 'error');
      return;
    }

    if (!referenceFile) {
      showToast('Please upload a product image', 'error');
      return;
    }

    if (!selectedPreset) {
      showToast('Please select a style preset', 'error');
      return;
    }

    if (!profile || profile.credits < 1) {
      showToast('Insufficient credits', 'error');
      return;
    }

    setLoading(true);

    try {
      // Upload reference image if provided
      let referenceImageUrl: string | undefined;

      if (referenceFile) {
        const formData = new FormData();
        formData.append('file', referenceFile);

        let uploadRes;
        try {
          uploadRes = await fetch('/api/storage/upload', {
            method: 'POST',
            body: formData,
          });
        } catch (fetchError: any) {
          console.error('Fetch error:', fetchError);
          throw new Error(`Network error: ${fetchError.message}. Check if you're logged in and the server is running.`);
        }

        if (!uploadRes.ok) {
          const errorData = await uploadRes.json().catch(() => ({ error: 'Unknown error' }));
          console.error('Upload failed:', uploadRes.status, errorData);
          throw new Error(`Failed to upload reference image: ${errorData.error || uploadRes.statusText}`);
        }

        const uploadData = await uploadRes.json();
        referenceImageUrl = uploadData.url;
      }

      // Call Edge Function to start generation
      const token = await getAccessToken();

      if (!token) {
        throw new Error('Not authenticated');
      }

      const functionsUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!.replace(
        'https://',
        'https://'
      ).replace('.supabase.co', '.supabase.co');

      const response = await fetch(`${functionsUrl}/functions/v1/start_generation`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          productDescription: description.trim(),
          referenceImageUrl,
          selectedStyle: selectedPreset,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to start generation');
      }

      const { genId } = await response.json();

      showToast('Generation started!', 'success');
      router.push(`/results/${genId}`);
    } catch (error: any) {
      console.error('Generation error:', error);
      showToast(error.message || 'Failed to start generation', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="mb-2 text-3xl font-bold">Create Generation</h1>
        <p className="text-gray-600">
          Describe your product and get 3 AI-generated image variants with captions
        </p>
      </div>

      {profile && (
        <div className="mb-6 rounded-lg bg-brand-50 p-4">
          <p className="text-sm text-brand-900">
            You have <span className="font-bold">{profile.credits}</span> credits available. Each
            generation costs 1 credit.
          </p>
        </div>
      )}

      {/* Style Presets */}
      <div className="mb-6">
        <h2 className="mb-3 text-lg font-semibold">Style Presets</h2>
        <div className="grid gap-4 md:grid-cols-3">
          {Object.entries(PRESETS).map(([key, preset]) => (
            <Card
              key={key}
              className={`cursor-pointer transition-all ${
                selectedPreset === key ? 'ring-2 ring-brand-500' : ''
              }`}
              onClick={() => applyPreset(key as keyof typeof PRESETS)}
            >
              <h3 className="mb-1 font-semibold">{preset.name}</h3>
              <p className="mb-2 text-sm text-gray-600">{preset.description}</p>
              <p className="text-xs text-gray-500">Aspect Ratio: {preset.aspectRatio}</p>
            </Card>
          ))}
        </div>
      </div>

      {/* Generation Form */}
      <form onSubmit={handleSubmit}>
        <Card className="mb-6">
          <Textarea
            label="Product Description *"
            placeholder="Describe your product in detail. What is it? What makes it special? What's the context or setting?"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={6}
            maxLength={2000}
          />
          <p className="mt-2 text-sm text-gray-500">{description.length} / 2000 characters</p>
        </Card>

        <Card className="mb-6">
          <Upload
            label="Product Image (Required)"
            onFileSelect={setReferenceFile}
            accept="image/*"
            maxSizeMB={5}
          />
          <p className="mt-2 text-sm text-gray-500">
            Upload your product image. The AI will apply the selected style while keeping your product intact.
          </p>
        </Card>

        <Button type="submit" disabled={loading || !profile || profile.credits < 1} size="lg">
          {loading ? 'Starting Generation...' : 'Generate (1 credit)'}
        </Button>
      </form>
    </div>
  );
}

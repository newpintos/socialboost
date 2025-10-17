'use client';

import { copyToClipboard, downloadImage } from '@/lib/utils';
import { showToast } from './Toast';
import Button from './Button';
import Card from './Card';
import type { Variant } from '@socialboost/shared';
import Image from 'next/image';

interface VariantCardProps {
  variant: Variant;
  index: number;
}

export default function VariantCard({ variant, index }: VariantCardProps) {
  const handleCopy = async () => {
    await copyToClipboard(variant.caption);
    showToast('Caption copied to clipboard!', 'success');
  };

  const handleDownload = () => {
    downloadImage(variant.image_url, `variant-${index + 1}.png`);
    showToast('Image download started', 'success');
  };

  const isImageLoading = !variant.image_url;

  return (
    <Card className="overflow-hidden">
      <div className="relative aspect-square w-full overflow-hidden rounded-lg bg-gray-100">
        {isImageLoading ? (
          <div className="flex h-full items-center justify-center">
            <div className="text-center">
              <div className="mx-auto mb-3 h-12 w-12 animate-spin rounded-full border-4 border-gray-200 border-t-brand-600"></div>
              <p className="text-sm text-gray-500">Generating image...</p>
            </div>
          </div>
        ) : (
          <Image
            src={variant.image_url}
            alt={`Variant ${index + 1}`}
            fill
            className="object-cover"
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
          />
        )}
      </div>

      <div className="mt-4">
        <p className="mb-2 text-xs text-gray-500">Caption</p>
        <p className="mb-4 text-sm font-medium">{variant.caption}</p>

        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleCopy} className="flex-1">
            Copy Caption
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleDownload}
            className="flex-1"
            disabled={isImageLoading}
          >
            {isImageLoading ? 'Loading...' : 'Download'}
          </Button>
        </div>
      </div>
    </Card>
  );
}

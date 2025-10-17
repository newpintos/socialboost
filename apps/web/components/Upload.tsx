'use client';

import { cn } from '@/lib/utils';
import { ChangeEvent, useRef, useState } from 'react';
import Button from './Button';

interface UploadProps {
  label?: string;
  onFileSelect: (file: File | null) => void;
  accept?: string;
  maxSizeMB?: number;
  previewUrl?: string;
}

export default function Upload({
  label = 'Upload Image',
  onFileSelect,
  accept = 'image/*',
  maxSizeMB = 5,
  previewUrl,
}: UploadProps) {
  const [preview, setPreview] = useState<string | null>(previewUrl || null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setError(null);

    if (!file) {
      setPreview(null);
      onFileSelect(null);
      return;
    }

    // Validate file size
    const maxSizeBytes = maxSizeMB * 1024 * 1024;
    if (file.size > maxSizeBytes) {
      setError(`File size must be less than ${maxSizeMB}MB`);
      return;
    }

    // Create preview
    const reader = new FileReader();
    reader.onloadend = () => {
      setPreview(reader.result as string);
      onFileSelect(file);
    };
    reader.readAsDataURL(file);
  };

  const handleClear = () => {
    setPreview(null);
    setError(null);
    onFileSelect(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="w-full">
      {label && <label className="mb-2 block text-sm font-medium text-gray-700">{label}</label>}

      <div
        className={cn(
          'relative flex min-h-[200px] w-full flex-col items-center justify-center rounded-lg border-2 border-dashed',
          preview ? 'border-gray-300' : 'border-gray-300 bg-gray-50'
        )}
      >
        {preview ? (
          <div className="relative h-full w-full">
            <img
              src={preview}
              alt="Preview"
              className="h-full w-full rounded-lg object-contain"
            />
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={handleClear}
              className="absolute right-2 top-2"
            >
              Remove
            </Button>
          </div>
        ) : (
          <div className="flex flex-col items-center p-6 text-center">
            <svg
              className="mb-2 h-12 w-12 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
            <p className="mb-2 text-sm text-gray-600">
              <span className="font-semibold">Click to upload</span> or drag and drop
            </p>
            <p className="text-xs text-gray-500">PNG, JPG, WEBP up to {maxSizeMB}MB</p>
            <Button type="button" variant="outline" size="sm" className="mt-4">
              Select File
            </Button>
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept={accept}
          onChange={handleFileChange}
          className="absolute inset-0 cursor-pointer opacity-0"
        />
      </div>

      {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
    </div>
  );
}

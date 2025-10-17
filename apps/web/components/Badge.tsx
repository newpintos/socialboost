import { cn } from '@/lib/utils';
import { HTMLAttributes } from 'react';
import type { GenerationStatus } from '@socialboost/shared';

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'success' | 'warning' | 'error';
  status?: GenerationStatus;
}

export default function Badge({ className, variant, status, children, ...props }: BadgeProps) {
  // Auto-detect variant from status
  const computedVariant =
    variant ||
    (status === 'succeeded'
      ? 'success'
      : status === 'failed'
        ? 'error'
        : status === 'processing'
          ? 'warning'
          : 'default');

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
        {
          'bg-gray-100 text-gray-800': computedVariant === 'default',
          'bg-green-100 text-green-800': computedVariant === 'success',
          'bg-yellow-100 text-yellow-800': computedVariant === 'warning',
          'bg-red-100 text-red-800': computedVariant === 'error',
        },
        className
      )}
      {...props}
    >
      {children || status}
    </span>
  );
}

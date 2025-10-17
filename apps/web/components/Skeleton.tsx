import { cn } from '@/lib/utils';
import { HTMLAttributes } from 'react';

interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {}

export default function Skeleton({ className, ...props }: SkeletonProps) {
  return (
    <div className={cn('animate-pulse rounded-md bg-gray-200', className)} {...props} />
  );
}

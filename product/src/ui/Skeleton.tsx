import { cx } from './class-names';

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cx('animate-pulse rounded-control bg-surface-muted', className)}
    />
  );
}

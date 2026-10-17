import type { ReactNode } from 'react';
import { cx } from './class-names';

export function EmptyState({
  title,
  description,
  action,
  className,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cx(
        'space-y-3 rounded-card border border-border bg-surface p-6 text-center',
        className,
      )}
    >
      <div className="space-y-1">
        <h2 className="text-base font-semibold tracking-tight">{title}</h2>
        {description ? <p className="text-sm text-text-muted">{description}</p> : null}
      </div>
      {action ? <div className="flex justify-center">{action}</div> : null}
    </div>
  );
}

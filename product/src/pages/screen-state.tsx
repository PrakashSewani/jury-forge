import { Button, EmptyState, Skeleton } from '../ui';

/**
 * The loading state shared by the dashboard screens. The visible text keeps the harness's
 * "is the dashboard still loading?" probe honest while the skeletons carry the shape.
 */
export function PageLoading({ label = 'Loading…' }: { label?: string }) {
  return (
    <div aria-busy="true" className="space-y-4" role="status">
      <p className="text-sm text-text-muted">{label}</p>
      <Skeleton className="h-20 w-full" />
      <Skeleton className="h-32 w-full" />
    </div>
  );
}

/** The error state shared by the dashboard screens: one human sentence and a retry. */
export function PageError({
  title = 'We could not load this page',
  message,
  onRetry,
}: {
  title?: string;
  message: string;
  onRetry: () => Promise<void>;
}) {
  return (
    <EmptyState
      action={<Button onClick={() => void onRetry()}>Try again</Button>}
      description={message}
      title={title}
    />
  );
}

import { Badge, buttonClass, Card, Field, inputClass, Notice, secondaryButtonClass } from './ui';

export { Badge, buttonClass, Card, Field, inputClass, Notice, secondaryButtonClass };

export function Loading({ label = 'Loading…' }: { label?: string }) {
  return <p className="text-sm text-text-muted">{label}</p>;
}

export function LoadFailed({ onRetry }: { onRetry: () => Promise<void> }) {
  return (
    <>
      <p className="text-sm text-text-body">The dashboard API did not respond.</p>
      <button className={secondaryButtonClass} onClick={() => void onRetry()} type="button">
        Try again
      </button>
    </>
  );
}

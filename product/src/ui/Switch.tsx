import { cx, focusRing, tapTarget } from './class-names';

export interface SwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: string;
  className?: string;
}

export function Switch({ checked, onCheckedChange, label, className }: SwitchProps) {
  return (
    <button
      aria-checked={checked}
      className={cx(
        `inline-flex items-center gap-2 rounded-control text-sm ${tapTarget} ${focusRing}`,
        checked ? 'text-text' : 'text-text-muted',
        className,
      )}
      onClick={() => onCheckedChange(!checked)}
      role="switch"
      type="button"
    >
      <span
        aria-hidden="true"
        className={cx(
          'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition',
          checked ? 'bg-accent' : 'bg-surface-muted',
        )}
      >
        <span
          className={cx(
            'inline-block h-4 w-4 rounded-full bg-surface transition',
            checked ? 'translate-x-4' : 'translate-x-0.5',
          )}
        />
      </span>
      <span>{label}</span>
    </button>
  );
}

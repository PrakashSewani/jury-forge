import { Switch as SwitchPrimitive } from 'radix-ui';
import { cx, focusRing, tapTarget } from './class-names';

export interface SwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: string;
  className?: string;
}

/**
 * A labelled on/off control. Radix supplies `role="switch"`, `aria-checked`, and the Space/Enter
 * activation; the visible label is the accessible name, so the control reads the same to a screen
 * reader as it looks.
 */
export function Switch({ checked, onCheckedChange, label, className }: SwitchProps) {
  return (
    <SwitchPrimitive.Root
      checked={checked}
      className={cx(
        `group inline-flex items-center gap-2.5 rounded-control text-sm ${tapTarget} ${focusRing}`,
        checked ? 'text-text' : 'text-text-muted',
        className,
      )}
      onCheckedChange={onCheckedChange}
    >
      <span
        aria-hidden="true"
        className={cx(
          'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors',
          checked ? 'border-accent bg-accent' : 'border-border-strong bg-surface-muted',
        )}
      >
        <SwitchPrimitive.Thumb
          className={cx(
            'block h-3.5 w-3.5 rounded-full shadow-panel transition-transform',
            checked
              ? 'translate-x-[1.1rem] bg-text-inverse'
              : 'translate-x-[0.2rem] bg-text-subtle',
          )}
        />
      </span>
      <span>{label}</span>
    </SwitchPrimitive.Root>
  );
}

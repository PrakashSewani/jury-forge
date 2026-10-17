import type { ReactNode } from 'react';
import { useEffect, useRef } from 'react';
import { cx } from './class-names';

export function Dialog({
  open,
  onClose,
  title,
  children,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (element === null) {
      return;
    }
    if (open) {
      if (typeof element.showModal === 'function' && !element.open) {
        element.showModal();
      }
    } else if (typeof element.close === 'function' && element.open) {
      element.close();
    }
  }, [open]);

  return (
    <dialog
      className={cx('rounded-card border border-border bg-surface p-6 text-text', className)}
      onClose={onClose}
      ref={ref}
    >
      <h2 className="text-base font-semibold tracking-tight">{title}</h2>
      {children}
    </dialog>
  );
}

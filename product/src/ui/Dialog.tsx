import { Dialog as DialogPrimitive } from 'radix-ui';
import type { ReactNode } from 'react';
import { cx } from './class-names';

/**
 * A modal dialog. Built on Radix for the parts that are easy to get wrong by hand: focus moves into
 * the dialog when it opens and returns to the trigger when it closes, Tab stays inside it, Escape
 * and the overlay dismiss it, and the page behind is made inert while it is open.
 *
 * The caller controls `open`; `onClose` fires for every dismissal (Escape, overlay, close button)
 * so the caller's state never disagrees with what the user sees.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <DialogPrimitive.Root
      onOpenChange={(next) => {
        if (!next) {
          onClose();
        }
      }}
      open={open}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-surface-inverse/40 backdrop-blur-sm data-[state=closed]:animate-out data-[state=open]:animate-in" />
        <DialogPrimitive.Content
          className={cx(
            'fixed left-1/2 top-[12vh] z-50 w-[min(92vw,36rem)] -translate-x-1/2 rounded-card border border-border bg-surface p-6 text-text shadow-raised focus:outline-none',
            className,
          )}
        >
          <DialogPrimitive.Title className="text-base font-semibold tracking-tight">
            {title}
          </DialogPrimitive.Title>
          {description ? (
            <DialogPrimitive.Description className="mt-1 text-sm text-text-muted">
              {description}
            </DialogPrimitive.Description>
          ) : (
            <DialogPrimitive.Description className="sr-only">{title}</DialogPrimitive.Description>
          )}
          {children}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export const DialogClose = DialogPrimitive.Close;

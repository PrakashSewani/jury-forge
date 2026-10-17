import type { ReactNode } from 'react';
import { cx } from './class-names';

const CARD_CLASS = 'space-y-4 rounded-card border border-border bg-surface p-6';

interface SurfaceProps {
  title?: string;
  children: ReactNode;
  className?: string;
}

function Surface({ title, children, className }: SurfaceProps) {
  return (
    <section className={cx(CARD_CLASS, className)}>
      {title ? <h2 className="text-base font-semibold tracking-tight">{title}</h2> : null}
      {children}
    </section>
  );
}

export function Card(props: SurfaceProps) {
  return <Surface {...props} />;
}

export function Panel(props: SurfaceProps) {
  return <Surface {...props} />;
}

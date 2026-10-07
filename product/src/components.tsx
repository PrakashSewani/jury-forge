import type { ReactNode } from 'react';

export const buttonClass =
  'inline-flex items-center justify-center rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-50';

export const secondaryButtonClass =
  'inline-flex items-center justify-center rounded-md border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-900 transition hover:border-neutral-500 disabled:cursor-not-allowed disabled:opacity-50';

export const inputClass =
  'w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-neutral-900';

export function Card({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className="space-y-4 rounded-lg border border-neutral-200 bg-white p-6">
      {title ? <h2 className="text-base font-semibold tracking-tight">{title}</h2> : null}
      {children}
    </section>
  );
}

export function Notice({ tone, children }: { tone: 'error' | 'info'; children: ReactNode }) {
  return (
    <p
      className={
        tone === 'error'
          ? 'rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800'
          : 'rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800'
      }
    >
      {children}
    </p>
  );
}

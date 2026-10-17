/**
 * Join class names, skipping every falsy value.
 *
 * This concatenates, it does not resolve conflicts: a caller's `className` beats a primitive's own
 * utility by CSS source order, never by argument order, so an override that must win needs a class
 * the primitive does not also emit. Returns `undefined` — not `''` — when there is nothing to join,
 * so `class` is omitted from the markup instead of rendered empty.
 */
export function cx(...classes: (string | false | null | undefined)[]): string | undefined {
  const joined = classes
    .filter((value): value is string => typeof value === 'string' && value !== '')
    .join(' ');
  return joined === '' ? undefined : joined;
}

// A visible keyboard focus indicator. Tailwind v4's outline-* utilities emit a real
// `outline-style: solid`, which is what the layout harness reads. It is scoped to
// :focus-visible on purpose — keyboard users are the audience, and it must not light up on
// every mouse click.
export const focusRing =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';

// 44px minimum on both axes for interactive controls, on every viewport — not just mobile.
export const tapTarget = 'min-h-11 min-w-11';

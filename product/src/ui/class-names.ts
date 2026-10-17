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

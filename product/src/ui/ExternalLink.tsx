import type { ComponentPropsWithoutRef } from 'react';
import { cx, focusRing, tapTarget } from './class-names';

/**
 * A link that leaves the app. Anything outside this instance — GitHub's install and review pages,
 * a provider's console — opens in a new tab, so the dashboard the operator is working in stays
 * where it was, and carries `rel="noopener noreferrer"` so the destination gets no handle on
 * `window.opener` and no referrer.
 *
 * The two links that have to come back *into* the instance stay same-tab and are deliberately not
 * built from this primitive: the OAuth "Sign in with GitHub" anchor (`/api/auth/github/start`) and
 * the manifest form POST, both of which GitHub answers with a redirect into the app.
 *
 * `target` and `rel` are not overridable: a caller cannot pass its own and silently drop the
 * opener protection.
 */
export function ExternalLink({
  className,
  children,
  ...props
}: Omit<ComponentPropsWithoutRef<'a'>, 'target' | 'rel'>) {
  return (
    <a
      {...props}
      className={cx(focusRing, tapTarget, className)}
      rel="noopener noreferrer"
      target="_blank"
    >
      {children}
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  );
}

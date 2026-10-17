import type { SessionUser } from '@jury-forge/shared';
import { Button } from '../ui';

export function UserMenu({
  user,
  busy,
  onLogout,
  className,
}: {
  user: SessionUser;
  busy: boolean;
  onLogout: () => void;
  className?: string;
}) {
  return (
    <div className={className}>
      {user.avatarUrl ? (
        <img alt="" className="h-8 w-8 shrink-0 rounded-full" src={user.avatarUrl} />
      ) : (
        <span
          aria-hidden="true"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-muted text-xs font-medium text-text-muted"
        >
          {user.login.slice(0, 1).toUpperCase()}
        </span>
      )}
      <span className="min-w-0 max-w-[5rem] truncate text-sm text-text-muted">{user.login}</span>
      <Button busy={busy} onClick={onLogout} size="sm" variant="ghost">
        Log out
      </Button>
    </div>
  );
}

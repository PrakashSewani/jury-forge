import type { FindingSeverity, RunStatus } from '@jury-forge/shared';

export type Tone = 'neutral' | 'green' | 'red' | 'amber';

export function runStatusTone(status: RunStatus): Tone {
  switch (status) {
    case 'completed':
      return 'green';
    case 'failed':
      return 'red';
    case 'running':
      return 'amber';
    case 'skipped':
      return 'neutral';
  }
}

export function severityTone(severity: FindingSeverity): Tone {
  switch (severity) {
    case 'error':
      return 'red';
    case 'warning':
      return 'amber';
    case 'info':
      return 'neutral';
  }
}

export function formatTime(unixSeconds: number | null): string {
  if (unixSeconds === null) {
    return '—';
  }
  return new Date(unixSeconds * 1_000).toLocaleString();
}

export function shortSha(sha: string): string {
  return sha.slice(0, 7);
}

/** Decimal byte sizes for pack sizes; the knowledge budget uses the same units. */
export function formatBytes(bytes: number): string {
  if (bytes < 1_000) {
    return `${bytes} B`;
  }
  if (bytes < 1_000_000) {
    return `${(bytes / 1_000).toFixed(bytes < 10_000 ? 1 : 0)} KB`;
  }
  return `${(bytes / 1_000_000).toFixed(1)} MB`;
}

/**
 * A coarse, human relative time for list screens ("3m ago", "2d ago"). It is computed at render
 * time only — no timer, because live updating is slice D.
 */
export function formatRelativeTime(unixSeconds: number | null, nowMs = Date.now()): string {
  if (unixSeconds === null) {
    return '—';
  }
  const seconds = Math.max(0, Math.floor(nowMs / 1_000) - unixSeconds);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

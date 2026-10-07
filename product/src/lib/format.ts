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

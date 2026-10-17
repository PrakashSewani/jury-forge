import type {
  InstanceReadiness,
  InstanceReadinessNextStep,
  InstanceReadinessStep,
} from '@jury-forge/shared';
import { getMeta } from './instance';

export const READINESS_TOTAL = 5;

const STEPS: Pick<InstanceReadinessStep, 'key' | 'label' | 'href'>[] = [
  { key: 'claim', label: 'Instance claimed', href: '/setup' },
  { key: 'install-app', label: 'GitHub App installed', href: '/setup' },
  { key: 'enable-repo', label: 'A repository is enabled', href: '/repositories' },
  { key: 'add-reviewer', label: 'A reviewer has a model key', href: '/reviewers' },
  { key: 'first-run', label: 'The first run finished', href: '/runs' },
];

const NEXT_STEPS: Record<
  InstanceReadinessNextStep['key'],
  Omit<InstanceReadinessNextStep, 'key'>
> = {
  claim: {
    title: 'Finish setting up this instance',
    body: 'Register your private GitHub App and claim the instance with the setup code.',
    href: '/setup',
    label: 'Continue setup',
  },
  'install-app': {
    title: 'Install the GitHub App',
    body: 'Jury Forge cannot review anything until the app is installed on an account.',
    href: '/setup',
    label: 'Install the app',
  },
  'enable-repo': {
    title: 'Enable a repository',
    body: 'Only enabled repositories are reviewed. Switch on the ones you want the jury to watch.',
    href: '/repositories',
    label: 'Choose repositories',
  },
  'add-reviewer': {
    title: 'Give a reviewer a model key',
    body: 'Every reviewer calls your own provider. Set a model key on at least one reviewer.',
    href: '/reviewers',
    label: 'Open reviewers',
  },
  'first-run': {
    title: 'Send the first pull request',
    body: 'Open or update a pull request on an enabled repository and the jury reviews it within minutes.',
    href: '/runs',
    label: 'Watch runs',
  },
  done: {
    title: 'Your jury is reviewing',
    body: 'Every enabled repository, every pull request. Recent runs are one click away.',
    href: '/runs',
    label: 'View runs',
  },
};

const REPO_REVIEWER_PAIRS_SQL =
  'SELECT COUNT(*) AS count FROM reviewers r JOIN repositories repo ON repo.enabled = 1 LEFT JOIN reviewer_repositories rr ON rr.reviewer_id = r.id AND rr.repo_id = repo.repo_id WHERE r.enabled = 1 AND COALESCE(rr.enabled, 1) = 1';

async function countRows(db: D1Database, sql: string): Promise<number> {
  const row = await db.prepare(sql).first<{ count: number }>();
  return row?.count ?? 0;
}

export async function computeReadiness(db: D1Database): Promise<InstanceReadiness> {
  const [claimedAt, installationId, reposEnabled, reviewersWithKey, repoReviewerPairs, firstRun] =
    await Promise.all([
      getMeta(db, 'claimed_at'),
      getMeta(db, 'installation_id'),
      countRows(db, 'SELECT COUNT(*) AS count FROM repositories WHERE enabled = 1'),
      countRows(
        db,
        "SELECT COUNT(*) AS count FROM reviewers WHERE enabled = 1 AND api_key_enc != ''",
      ),
      countRows(db, REPO_REVIEWER_PAIRS_SQL),
      db
        .prepare("SELECT MIN(created_at) AS at FROM runs WHERE status != 'skipped'")
        .first<{ at: number | null }>(),
    ]);

  const claimed = claimedAt !== null;
  const appInstalled = installationId !== null;
  const firstRunAt = firstRun?.at ?? null;
  const doneByKey: Record<InstanceReadinessStep['key'], boolean> = {
    claim: claimed,
    'install-app': appInstalled,
    'enable-repo': reposEnabled > 0,
    'add-reviewer': reviewersWithKey > 0,
    'first-run': firstRunAt !== null,
  };

  const steps: InstanceReadinessStep[] = STEPS.map((step) => ({
    ...step,
    done: doneByKey[step.key],
  }));
  const completed = steps.filter((step) => step.done).length;
  const next = steps.find((step) => !step.done);
  const nextStep: InstanceReadinessNextStep = next
    ? { key: next.key, ...NEXT_STEPS[next.key] }
    : { key: 'done', ...NEXT_STEPS.done };

  return {
    claimed,
    appInstalled,
    reposEnabled,
    reviewersWithKey,
    repoReviewerPairs,
    firstRunAt,
    completed,
    total: READINESS_TOTAL,
    steps,
    nextStep,
  };
}

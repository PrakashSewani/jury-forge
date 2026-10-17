import type { Reviewer } from '@jury-forge/shared';
import { RepositorySchema, ReviewerSchema } from '@jury-forge/shared';
import type { ChangeEvent } from 'react';
import { useCallback, useRef, useState } from 'react';
import { z } from 'zod';
import {
  downloadReviewersExport,
  exportReviewers,
  importReviewers,
  listRepositories,
  listReviewers,
  updateReviewer,
} from '../lib/api';
import { handleAppLink } from '../lib/router';
import { useResource } from '../lib/use-resource';
import {
  Badge,
  Button,
  buttonClass,
  Card,
  EmptyState,
  focusRing,
  Notice,
  Row,
  secondaryButtonClass,
  Switch,
  Table,
  tapTarget,
  Toolbar,
} from '../ui';
import { errorMessage } from './messages';
import { PageError, PageLoading } from './screen-state';

const ReviewersDataSchema = z.object({
  reviewers: z.array(ReviewerSchema),
  repositories: z.array(RepositorySchema),
});

type NoticeState = { tone: 'error' | 'info'; text: string };

export default function ReviewersPage() {
  const load = useCallback(async (signal: AbortSignal) => {
    const [reviewers, repositories] = await Promise.all([
      listReviewers(signal),
      listRepositories(false, signal),
    ]);
    return { reviewers, repositories };
  }, []);
  const { data, failed, reload } = useResource(ReviewersDataSchema, load);
  const enabledRepoCount =
    data?.repositories.filter((repository) => repository.enabled).length ?? 0;
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  async function handleExport() {
    setBusy(true);
    setNotice(null);
    try {
      downloadReviewersExport(await exportReviewers());
    } catch (caught) {
      setNotice({
        tone: 'error',
        text: errorMessage(caught, 'Could not export the reviewers. Try again.'),
      });
    } finally {
      setBusy(false);
    }
  }

  async function handleImportFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) {
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      const text = await file.text();
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        setNotice({ tone: 'error', text: 'That file is not valid JSON.' });
        return;
      }
      const result = await importReviewers(parsed);
      setNotice({
        tone: 'info',
        text: `Imported: ${result.created} created, ${result.updated} updated, ${result.unchanged} unchanged, ${result.skipped} skipped.`,
      });
      await reload();
    } catch (caught) {
      setNotice({
        tone: 'error',
        text: errorMessage(caught, 'Could not import that file. Check it and try again.'),
      });
    } finally {
      setBusy(false);
    }
  }

  async function toggleEnabled(reviewer: Reviewer, enabled: boolean) {
    setNotice(null);
    try {
      await updateReviewer(reviewer.id, { enabled });
      await reload();
    } catch (caught) {
      setNotice({
        tone: 'error',
        text: errorMessage(caught, 'Could not update that reviewer. Try again.'),
      });
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight">Reviewers</h1>
        <Toolbar className="flex-wrap">
          <Button disabled={busy} onClick={() => void handleExport()} variant="secondary">
            Export
          </Button>
          <Button disabled={busy} onClick={() => fileInput.current?.click()} variant="secondary">
            Import
          </Button>
          <input
            accept="application/json,.json"
            className="hidden"
            onChange={(event) => void handleImportFile(event)}
            ref={fileInput}
            type="file"
          />
          <a className={buttonClass} href="/reviewers/new" onClick={handleAppLink}>
            New reviewer
          </a>
        </Toolbar>
      </header>
      {notice ? <Notice tone={notice.tone}>{notice.text}</Notice> : null}
      {failed ? (
        <PageError
          message="The reviewer list could not be loaded. Check the Worker and try again."
          onRetry={reload}
        />
      ) : data === null ? (
        <PageLoading />
      ) : data.reviewers.length === 0 ? (
        <EmptyState
          action={
            <a className={buttonClass} href="/reviewers/new" onClick={handleAppLink}>
              New reviewer
            </a>
          }
          description="A reviewer is an agent with its own instructions, rules, and model. Add your first one to start building the jury."
          title="No reviewers yet"
        />
      ) : (
        <Card>
          <Table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs uppercase tracking-wide text-text-muted">
                <th className="py-2 pr-4 font-medium">Name</th>
                <th className="py-2 pr-4 font-medium">Model</th>
                <th className="py-2 pr-4 font-medium">Key</th>
                <th className="py-2 pr-4 font-medium">Repositories</th>
                <th className="py-2 pr-4 font-medium">Enabled</th>
                <th className="py-2 pr-4 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.reviewers.map((reviewer) => {
                const repositories = reviewer.repositories;
                return (
                  <Row className="border-b border-border last:border-0" key={reviewer.id}>
                    <td className="pr-4 font-medium">
                      <a
                        className={`inline-flex items-center hover:underline ${tapTarget} ${focusRing}`}
                        href={`/reviewers/${encodeURIComponent(reviewer.id)}`}
                        onClick={handleAppLink}
                      >
                        {reviewer.name}
                      </a>
                    </td>
                    <td className="pr-4">
                      <span className="block">{reviewer.model}</span>
                      <span className="text-xs text-text-muted">{reviewer.flavor}</span>
                    </td>
                    <td className="pr-4">
                      <Badge tone={reviewer.hasApiKey ? 'green' : 'amber'}>
                        {reviewer.hasApiKey ? 'set' : 'no key'}
                      </Badge>
                    </td>
                    <td className="pr-4 text-text-body">
                      {repositories.length === 0 ? (
                        <span className="text-text-muted">None</span>
                      ) : repositories.length === enabledRepoCount && enabledRepoCount > 0 ? (
                        `All ${enabledRepoCount} enabled repositories`
                      ) : (
                        repositories.join(', ')
                      )}
                    </td>
                    <td className="pr-4">
                      <Switch
                        checked={reviewer.enabled}
                        label={reviewer.enabled ? 'Enabled' : 'Disabled'}
                        onCheckedChange={(enabled) => void toggleEnabled(reviewer, enabled)}
                      />
                    </td>
                    <td className="pr-4">
                      <a
                        className={secondaryButtonClass}
                        href={`/reviewers/${encodeURIComponent(reviewer.id)}`}
                        onClick={handleAppLink}
                      >
                        Edit
                      </a>
                    </td>
                  </Row>
                );
              })}
            </tbody>
          </Table>
        </Card>
      )}
    </div>
  );
}

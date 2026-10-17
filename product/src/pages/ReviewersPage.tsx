import type { ChangeEvent } from 'react';
import { useCallback, useRef, useState } from 'react';
import {
  Badge,
  buttonClass,
  Card,
  LoadFailed,
  Loading,
  Notice,
  secondaryButtonClass,
} from '../components';
import {
  ApiError,
  downloadReviewersExport,
  exportReviewers,
  importReviewers,
  listReviewers,
} from '../lib/api';
import { useLoadable } from '../lib/use-loadable';

type NoticeState = { tone: 'error' | 'info'; text: string };

export default function ReviewersPage() {
  const load = useCallback(() => listReviewers(), []);
  const { data, failed, reload } = useLoadable(load);
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  async function handleExport() {
    setBusy(true);
    setNotice(null);
    try {
      downloadReviewersExport(await exportReviewers());
    } catch (caught) {
      setNotice({ tone: 'error', text: errorText(caught) });
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
      setNotice({ tone: 'error', text: errorText(caught) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold tracking-tight">Reviewers</h1>
        <div className="flex items-center gap-2">
          <button
            className={secondaryButtonClass}
            disabled={busy}
            onClick={() => void handleExport()}
            type="button"
          >
            Export
          </button>
          <button
            className={secondaryButtonClass}
            disabled={busy}
            onClick={() => fileInput.current?.click()}
            type="button"
          >
            Import
          </button>
          <input
            accept="application/json,.json"
            className="hidden"
            onChange={(event) => void handleImportFile(event)}
            ref={fileInput}
            type="file"
          />
          <a className={buttonClass} href="/reviewers/new">
            New reviewer
          </a>
        </div>
      </header>
      {notice ? <Notice tone={notice.tone}>{notice.text}</Notice> : null}
      <Card>
        {failed ? (
          <LoadFailed onRetry={reload} />
        ) : data === null ? (
          <Loading />
        ) : data.length === 0 ? (
          <p className="text-sm text-neutral-500">
            No reviewers yet — create one to give your jury its first member.
          </p>
        ) : (
          <ul className="divide-y divide-neutral-100">
            {data.map((reviewer) => (
              <li key={reviewer.id}>
                <a
                  className="flex items-center justify-between gap-4 py-3 transition hover:bg-neutral-50"
                  href={`/reviewers/${encodeURIComponent(reviewer.id)}`}
                >
                  <div>
                    <p className="text-sm font-medium">{reviewer.name}</p>
                    <p className="text-xs text-neutral-500">
                      {reviewer.flavor} · {reviewer.model}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {reviewer.hasApiKey ? null : <Badge tone="amber">no key</Badge>}
                    {reviewer.enabled ? (
                      <Badge tone="green">enabled</Badge>
                    ) : (
                      <Badge>disabled</Badge>
                    )}
                  </div>
                </a>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function errorText(caught: unknown): string {
  return caught instanceof ApiError ? caught.code : 'request_failed';
}

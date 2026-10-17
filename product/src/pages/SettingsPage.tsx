import type { InstanceSettings, SettingsResponse } from '@jury-forge/shared';
import { useCallback, useState } from 'react';
import {
  buttonClass,
  Card,
  Field,
  inputClass,
  LoadFailed,
  Loading,
  Notice,
  secondaryButtonClass,
} from '../components';
import { ApiError, getSettings, updateSettings } from '../lib/api';
import { useLoadable } from '../lib/use-loadable';

type NumberKey =
  | 'inlineCommentsPerReviewer'
  | 'inlineCommentsPerRun'
  | 'contextTotalBytes'
  | 'contextFileBytes'
  | 'descriptionLimit'
  | 'blockingErrorThreshold';

const NUMBER_FIELDS: { key: NumberKey; label: string; min: number; max: number }[] = [
  { key: 'inlineCommentsPerReviewer', label: 'Inline comments per reviewer', min: 1, max: 50 },
  { key: 'inlineCommentsPerRun', label: 'Inline comments per run', min: 1, max: 100 },
  { key: 'contextTotalBytes', label: 'Context total bytes', min: 20_000, max: 1_000_000 },
  { key: 'contextFileBytes', label: 'Context file bytes', min: 4_000, max: 200_000 },
  { key: 'descriptionLimit', label: 'PR description limit', min: 500, max: 20_000 },
];

export default function SettingsPage() {
  const load = useCallback(() => getSettings(), []);
  const { data, failed, reload } = useLoadable(load);
  const [server, setServer] = useState<SettingsResponse | null>(null);
  const [draft, setDraft] = useState<Partial<InstanceSettings>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const current = server ?? data;
  const draftEmpty = Object.keys(draft).length === 0;

  function update<K extends keyof InstanceSettings>(key: K, value: InstanceSettings[K]) {
    setDraft((previous) => ({ ...previous, [key]: value }));
    setSaved(false);
    setError(null);
  }

  function updateNumber(key: NumberKey, raw: string) {
    if (raw === '') {
      setDraft((previous) => {
        const next = { ...previous };
        delete next[key];
        return next;
      });
      setSaved(false);
      setError(null);
      return;
    }
    update(key, Number(raw));
  }

  function resetField<K extends keyof InstanceSettings>(key: K) {
    if (current === null) {
      return;
    }
    update(key, current.defaults[key]);
  }

  function resetAll() {
    if (current === null) {
      return;
    }
    setDraft({ ...current.defaults });
    setSaved(false);
    setError(null);
  }

  async function handleSave() {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const response = await updateSettings(draft);
      setServer(response);
      setDraft({});
      setSaved(true);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.code : 'request_failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-neutral-500">
          These are the instance&rsquo;s review numbers — the D-009/D-010 caps and budgets. Each
          field shows its default, and resetting only stages the value until you save.
        </p>
      </header>
      {failed ? (
        <Card>
          <LoadFailed onRetry={reload} />
        </Card>
      ) : current === null ? (
        <Card>
          <Loading />
        </Card>
      ) : (
        <>
          <Card title="Advanced">
            <div className="space-y-5">
              {NUMBER_FIELDS.map((field) => (
                <div key={field.key} className="flex items-start gap-3">
                  <div className="flex-1">
                    <Field hint={`Default: ${current.defaults[field.key]}`} label={field.label}>
                      <input
                        className={inputClass}
                        max={field.max}
                        min={field.min}
                        onChange={(event) => updateNumber(field.key, event.target.value)}
                        type="number"
                        value={draft[field.key] ?? current.settings[field.key]}
                      />
                    </Field>
                  </div>
                  <button
                    className="pt-6 text-sm text-neutral-500 underline transition hover:text-neutral-900"
                    onClick={() => resetField(field.key)}
                    type="button"
                  >
                    Reset
                  </button>
                </div>
              ))}
            </div>
          </Card>
          <Card title="Blocking mode">
            <label className="flex items-start gap-2 text-sm">
              <input
                checked={draft.blockingMode ?? current.settings.blockingMode}
                onChange={(event) => update('blockingMode', event.target.checked)}
                type="checkbox"
              />
              <span>
                <span className="block font-medium">Request changes on error findings</span>
                <span className="block text-xs text-neutral-500">
                  Off by default. When on, a run that finds at least the threshold of
                  &ldquo;error&rdquo; findings posts REQUEST_CHANGES; every other run posts a
                  comment.
                </span>
              </span>
            </label>
            <div className="flex items-start gap-3">
              <div className="flex-1">
                <Field
                  hint={`Default: ${current.defaults.blockingErrorThreshold}`}
                  label="Error findings required to block"
                >
                  <input
                    className={inputClass}
                    disabled={!(draft.blockingMode ?? current.settings.blockingMode)}
                    max={50}
                    min={1}
                    onChange={(event) => updateNumber('blockingErrorThreshold', event.target.value)}
                    type="number"
                    value={draft.blockingErrorThreshold ?? current.settings.blockingErrorThreshold}
                  />
                </Field>
              </div>
              <button
                className="pt-6 text-sm text-neutral-500 underline transition hover:text-neutral-900 disabled:opacity-50"
                disabled={!(draft.blockingMode ?? current.settings.blockingMode)}
                onClick={() => resetField('blockingErrorThreshold')}
                type="button"
              >
                Reset
              </button>
            </div>
          </Card>
          {error ? <Notice tone="error">{error}</Notice> : null}
          {saved ? <Notice tone="info">Saved.</Notice> : null}
          <div className="flex items-center gap-3">
            <button
              className={buttonClass}
              disabled={busy || draftEmpty}
              onClick={() => void handleSave()}
              type="button"
            >
              {busy ? 'Saving…' : 'Save changes'}
            </button>
            <button
              className={secondaryButtonClass}
              disabled={busy}
              onClick={resetAll}
              type="button"
            >
              Reset all to defaults
            </button>
          </div>
        </>
      )}
    </div>
  );
}

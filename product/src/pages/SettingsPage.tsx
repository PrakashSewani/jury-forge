import type { InstanceSettings, SettingsResponse } from '@jury-forge/shared';
import { SettingsResponseSchema } from '@jury-forge/shared';
import { useCallback, useState } from 'react';
import { getSettings, updateSettings } from '../lib/api';
import { useResource } from '../lib/use-resource';
import { Button, Card, Field, Input, Notice, Switch } from '../ui';
import { errorMessage } from './messages';
import { PageError, PageLoading } from './screen-state';

type NumberKey =
  | 'inlineCommentsPerReviewer'
  | 'inlineCommentsPerRun'
  | 'contextTotalBytes'
  | 'contextFileBytes'
  | 'descriptionLimit'
  | 'blockingErrorThreshold'
  | 'repoInstructionsMaxBytes'
  | 'referenceContextFiles'
  | 'referenceContextFileBytes'
  | 'referenceContextTotalBytes';

interface NumberField {
  key: NumberKey;
  label: string;
  hint: string;
  min: number;
  max: number;
}

const COMMENT_FIELDS: NumberField[] = [
  {
    key: 'inlineCommentsPerReviewer',
    label: 'Inline comments per reviewer',
    hint: 'The most inline comments one reviewer can post on a run.',
    min: 1,
    max: 50,
  },
  {
    key: 'inlineCommentsPerRun',
    label: 'Inline comments per run',
    hint: 'The most inline comments across the whole run; the rest land in the summary.',
    min: 1,
    max: 100,
  },
];

const CONTEXT_FIELDS: NumberField[] = [
  {
    key: 'contextTotalBytes',
    label: 'Context total bytes',
    hint: 'The diff budget across all files sent to one reviewer.',
    min: 20_000,
    max: 1_000_000,
  },
  {
    key: 'contextFileBytes',
    label: 'Context file bytes',
    hint: 'The diff budget for a single file.',
    min: 4_000,
    max: 200_000,
  },
  {
    key: 'descriptionLimit',
    label: 'PR description limit',
    hint: 'How much of the pull request description reaches the prompt.',
    min: 500,
    max: 20_000,
  },
];

const REFERENCE_FIELDS: NumberField[] = [
  {
    key: 'referenceContextFiles',
    label: 'Reference files per run',
    hint: 'The most repository files a run fetches for reviewers that name reference paths.',
    min: 1,
    max: 100,
  },
  {
    key: 'referenceContextFileBytes',
    label: 'Reference file bytes',
    hint: 'The most text kept from one reference file.',
    min: 1_000,
    max: 100_000,
  },
  {
    key: 'referenceContextTotalBytes',
    label: 'Reference block bytes',
    hint: 'The most reference text added to one reviewer prompt.',
    min: 10_000,
    max: 1_000_000,
  },
];

export default function SettingsPage() {
  const load = useCallback((signal: AbortSignal) => getSettings(signal), []);
  const { data, failed, reload } = useResource(SettingsResponseSchema, load);
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

  function resetField(key: NumberKey | 'blockingMode' | 'repoInstructions') {
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
      setError(
        errorMessage(caught, 'Could not save the settings. Check the values and try again.'),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-text-muted">
          These are the instance&rsquo;s review numbers — the comment caps, context budgets, and
          blocking behavior. Each field shows its default, and resetting only stages the value until
          you save.
        </p>
      </header>
      {failed ? (
        <PageError
          message="The instance settings could not be loaded. Check the Worker and try again."
          onRetry={reload}
        />
      ) : current === null ? (
        <PageLoading />
      ) : (
        <>
          <Card title="Comment volume">
            <div className="space-y-5">
              {COMMENT_FIELDS.map((field) => (
                <NumberSetting
                  current={current}
                  draft={draft}
                  field={field}
                  key={field.key}
                  onChange={updateNumber}
                  onReset={resetField}
                />
              ))}
            </div>
          </Card>

          <Card title="Context budget">
            <div className="space-y-5">
              {CONTEXT_FIELDS.map((field) => (
                <NumberSetting
                  current={current}
                  draft={draft}
                  field={field}
                  key={field.key}
                  onChange={updateNumber}
                  onReset={resetField}
                />
              ))}
            </div>
          </Card>

          <Card title="Reference context">
            <div className="space-y-5">
              {REFERENCE_FIELDS.map((field) => (
                <NumberSetting
                  current={current}
                  draft={draft}
                  field={field}
                  key={field.key}
                  onChange={updateNumber}
                  onReset={resetField}
                />
              ))}
            </div>
            <p className="mt-3 text-xs text-text-muted">
              These bound the read-only files a reviewer adds from its reference paths. A pair with
              no reference paths costs nothing.
            </p>
          </Card>

          <Card title="Blocking mode">
            <div className="space-y-4">
              <Switch
                checked={draft.blockingMode ?? current.settings.blockingMode}
                label="Request changes on error findings"
                onCheckedChange={(checked) => update('blockingMode', checked)}
              />
              <p className="text-xs text-text-muted">
                Off by default. When on, a run that finds at least the threshold of
                &ldquo;error&rdquo; findings posts REQUEST_CHANGES; every other run posts a comment.
              </p>
              <NumberSetting
                current={current}
                disabled={!(draft.blockingMode ?? current.settings.blockingMode)}
                draft={draft}
                field={{
                  key: 'blockingErrorThreshold',
                  label: 'Error findings required to block',
                  hint: 'How many error findings a run needs before it requests changes.',
                  min: 1,
                  max: 50,
                }}
                onChange={updateNumber}
                onReset={resetField}
              />
            </div>
          </Card>

          <Card title="Repository instructions">
            <div className="space-y-4">
              <Switch
                checked={draft.repoInstructions ?? current.settings.repoInstructions}
                label="Include repository instructions"
                onCheckedChange={(checked) => update('repoInstructions', checked)}
              />
              <p className="text-xs text-text-muted">
                Off by default. When on, the run reads AGENTS.md and CONTRIBUTING.md at the pull
                request&rsquo;s revision and includes bounded excerpts in the prompts.
              </p>
              <NumberSetting
                current={current}
                disabled={!(draft.repoInstructions ?? current.settings.repoInstructions)}
                draft={draft}
                field={{
                  key: 'repoInstructionsMaxBytes',
                  label: 'Excerpt budget (bytes)',
                  hint: 'The most repository-instruction text added to one prompt.',
                  min: 1_000,
                  max: 50_000,
                }}
                onChange={updateNumber}
                onReset={resetField}
              />
            </div>
          </Card>

          {error ? <Notice tone="error">{error}</Notice> : null}
          {saved ? <Notice tone="info">Saved.</Notice> : null}
          <div className="flex flex-wrap items-center gap-3">
            <Button busy={busy} disabled={draftEmpty} onClick={() => void handleSave()}>
              Save changes
            </Button>
            <Button disabled={busy} onClick={resetAll} variant="secondary">
              Reset all to defaults
            </Button>
            <p className="text-xs text-text-muted">
              Changes are staged until you save them; resetting a field only affects the staged
              value.
            </p>
          </div>
        </>
      )}
    </div>
  );
}

function NumberSetting({
  field,
  current,
  draft,
  disabled = false,
  onChange,
  onReset,
}: {
  field: NumberField;
  current: SettingsResponse;
  draft: Partial<InstanceSettings>;
  disabled?: boolean;
  onChange: (key: NumberKey, raw: string) => void;
  onReset: (key: NumberKey) => void;
}) {
  return (
    <div className="flex items-start gap-3">
      <Field
        className="flex-1"
        hint={`Default: ${current.defaults[field.key]}. ${field.hint}`}
        label={field.label}
      >
        <Input
          disabled={disabled}
          max={field.max}
          min={field.min}
          onChange={(event) => onChange(field.key, event.target.value)}
          type="number"
          value={draft[field.key] ?? current.settings[field.key]}
        />
      </Field>
      <Button
        className="mt-6"
        disabled={disabled}
        onClick={() => onReset(field.key)}
        size="sm"
        variant="secondary"
      >
        Reset
      </Button>
    </div>
  );
}

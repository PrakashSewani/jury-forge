import type { ProviderFlavor, Reviewer, ReviewerTemplate } from '@jury-forge/shared';
import { REVIEWER_TEMPLATES } from '@jury-forge/shared';
import type { FormEvent } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReviewerCreateInput, ReviewerUpdateInput } from '../lib/api';
import {
  createReviewer,
  deleteReviewer,
  getReviewer,
  listReviewers,
  updateReviewer,
} from '../lib/api';
import { handleAppLink, navigate, registerNavigationBlocker } from '../lib/router';
import {
  Button,
  Card,
  cx,
  Field,
  focusRing,
  Input,
  Notice,
  Select,
  Switch,
  tapTarget,
  Textarea,
} from '../ui';
import { errorMessage } from './messages';
import { PageError, PageLoading } from './screen-state';

type KeySource = 'paste' | 'reuse';

interface FormState {
  name: string;
  flavor: ProviderFlavor;
  baseUrl: string;
  model: string;
  instructions: string;
  rules: string;
  paramsText: string;
  enabled: boolean;
  apiKeyText: string;
  clearApiKey: boolean;
  hasApiKey: boolean;
  /** Where the stored key comes from on save: one typed in, or another reviewer's stored one. */
  keySource: KeySource;
  reuseFrom: string;
}

interface FormErrors {
  name?: string;
  model?: string;
  baseUrl?: string;
  params?: string;
}

/** The three fields a starter prefills. The values held before a template was applied are kept as
 * the snapshot "Blank reviewer" restores. */
interface StarterFields {
  name: string;
  instructions: string;
  rules: string;
}

function findTemplate(key: string): ReviewerTemplate | undefined {
  return REVIEWER_TEMPLATES.find((template) => template.key === key);
}

/** `reviewers.name` has no unique constraint, so a name two sources share gets a short id appended:
 * the operator has to be able to tell which stored key the option is about to copy. */
function reuseSourceLabel(source: Reviewer, duplicateName: boolean): string {
  const label = `${source.name} — ${source.model}`;
  return duplicateName ? `${label} (${source.id.slice(0, 8)})` : label;
}

const NEW_REVIEWER: FormState = {
  name: '',
  flavor: 'openai',
  baseUrl: 'https://api.openai.com/v1',
  model: '',
  instructions: '',
  rules: '',
  paramsText: '{}',
  enabled: true,
  apiKeyText: '',
  clearApiKey: false,
  hasApiKey: false,
  keySource: 'paste',
  reuseFrom: '',
};

function parseParams(text: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(text);
    return value !== null && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function validate(form: FormState): FormErrors {
  const errors: FormErrors = {};
  if (form.name.trim() === '') {
    errors.name = 'Give this reviewer a name.';
  }
  if (form.model.trim() === '') {
    errors.model = 'Enter the model this reviewer should call.';
  }
  const baseUrl = form.baseUrl.trim();
  if (baseUrl === '') {
    errors.baseUrl = 'Enter the provider base URL.';
  } else {
    try {
      new URL(baseUrl);
    } catch {
      errors.baseUrl = 'Enter a full URL, for example https://api.openai.com/v1.';
    }
  }
  if (parseParams(form.paramsText) === null) {
    errors.params = 'Parameters must be a JSON object, for example {"temperature": 0.2}.';
  }
  return errors;
}

export default function ReviewerEditorPage({ id }: { id?: string }) {
  const [form, setForm] = useState<FormState | null>(id === undefined ? NEW_REVIEWER : null);
  const [baseline, setBaseline] = useState<FormState | null>(
    id === undefined ? NEW_REVIEWER : null,
  );
  const [errors, setErrors] = useState<FormErrors>({});
  const [loadFailed, setLoadFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [startFrom, setStartFrom] = useState<'blank' | 'template'>('blank');
  const [templateKey, setTemplateKey] = useState('');
  const [appliedTemplate, setAppliedTemplate] = useState<string | null>(null);
  // What name, instructions and rules held before a template was applied, so that choosing "Blank
  // reviewer" after previewing one returns the operator to a genuinely blank form.
  const [beforeTemplate, setBeforeTemplate] = useState<StarterFields | null>(null);
  const [keySources, setKeySources] = useState<Reviewer[]>([]);

  // Set once a save or a delete has landed. The navigation that follows is a client route change,
  // so the `beforeunload` handler reads this ref rather than waiting for React to flush the state
  // update — otherwise the browser asks "Leave site?" for changes that are already stored.
  const savedRef = useRef(false);

  const load = useCallback(async () => {
    if (id === undefined) {
      return;
    }
    setLoadFailed(false);
    try {
      const reviewer = await getReviewer(id);
      const loaded: FormState = {
        name: reviewer.name,
        flavor: reviewer.flavor,
        baseUrl: reviewer.baseUrl,
        model: reviewer.model,
        instructions: reviewer.instructions,
        rules: reviewer.rules,
        paramsText: JSON.stringify(reviewer.params, null, 2),
        enabled: reviewer.enabled,
        apiKeyText: '',
        clearApiKey: false,
        hasApiKey: reviewer.hasApiKey,
        keySource: 'paste',
        reuseFrom: '',
      };
      setForm(loaded);
      setBaseline(loaded);
    } catch {
      setLoadFailed(true);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  // The reuse offer comes from the reviewers that already hold a key. It is an offer, not a
  // requirement: when the list cannot be read the key section simply falls back to pasting a key,
  // which is the only path that ever holds one.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const reviewers = await listReviewers();
        if (!cancelled) {
          setKeySources(reviewers.filter((reviewer) => reviewer.hasApiKey && reviewer.id !== id));
        }
      } catch {
        // Nothing to offer; the paste path still works.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const dirty =
    form !== null && baseline !== null && JSON.stringify(form) !== JSON.stringify(baseline);

  useEffect(() => {
    if (!dirty) {
      return;
    }
    function onBeforeUnload(event: BeforeUnloadEvent) {
      if (savedRef.current) {
        return;
      }
      event.preventDefault();
      event.returnValue = '';
    }
    window.addEventListener('beforeunload', onBeforeUnload);
    // `beforeunload` never fires for a client-side route change (slice D turned every in-app link
    // into a `pushState`), so the guard has to live in the router as well: this blocker is what
    // makes the nav links, the shell's links and the back button ask before they drop the edits.
    const unregister = registerNavigationBlocker(() => {
      if (savedRef.current) {
        return true;
      }
      return window.confirm('This reviewer has unsaved changes. Leave the page and discard them?');
    });
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      unregister();
    };
  }, [dirty]);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => (current === null ? current : { ...current, [key]: value }));
    setErrors((current) => {
      if (Object.keys(current).length === 0) {
        return current;
      }
      const next = { ...current };
      if (key === 'name') delete next.name;
      if (key === 'model') delete next.model;
      if (key === 'baseUrl') delete next.baseUrl;
      if (key === 'paramsText') delete next.params;
      return next;
    });
  }

  /** Choosing "reuse" drops anything typed: only one key source may ever be sent. */
  function chooseKeySource(next: KeySource) {
    setForm((current) => {
      if (current === null) {
        return current;
      }
      if (next === 'reuse') {
        return {
          ...current,
          apiKeyText: '',
          clearApiKey: false,
          keySource: 'reuse',
          reuseFrom: current.reuseFrom === '' ? (keySources[0]?.id ?? '') : current.reuseFrom,
        };
      }
      return { ...current, keySource: 'paste' };
    });
  }

  /** One update replaces exactly the three prefilled fields; the model, base URL, params and key
   * inputs are left to the operator and are never touched here. */
  function applyStarterFields(fields: StarterFields) {
    setForm((current) => (current === null ? current : { ...current, ...fields }));
    setErrors((current) => {
      if (current.name === undefined || fields.name.trim() === '') {
        return current;
      }
      const next = { ...current };
      delete next.name;
      return next;
    });
  }

  function handleTemplateChange(key: string) {
    setTemplateKey(key);
    const template = findTemplate(key);
    if (template === undefined) {
      // The placeholder option: nothing is applied yet, and nothing already applied is forgotten.
      return;
    }
    if (form !== null && beforeTemplate === null) {
      // Remembered once, on the first template: "Blank reviewer" restores exactly these values, not
      // whatever a template has since written over them.
      setBeforeTemplate({ name: form.name, instructions: form.instructions, rules: form.rules });
    }
    applyStarterFields({
      name: template.name,
      instructions: template.instructions,
      rules: template.rules,
    });
    setAppliedTemplate(template.name);
  }

  /** Going back to blank undoes what a template prefilled: the radio's copy promises a reviewer the
   * operator fills in themselves, so a template has to be a preview and not a lock-in. */
  function chooseBlankStarter() {
    setStartFrom('blank');
    setAppliedTemplate(null);
    setTemplateKey('');
    if (beforeTemplate === null) {
      return;
    }
    applyStarterFields(beforeTemplate);
    setBeforeTemplate(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (form === null) {
      return;
    }
    const found = validate(form);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      return;
    }
    const params = parseParams(form.paramsText);
    if (params === null) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const draft = {
        name: form.name.trim(),
        flavor: form.flavor,
        baseUrl: form.baseUrl.trim(),
        model: form.model.trim(),
        instructions: form.instructions,
        rules: form.rules,
        params,
        enabled: form.enabled,
      };
      // One key source per save: the API refuses `apiKey` and `apiKeyFromReviewerId` together, so
      // the form sends the choice, and a reused key is an id — never a value.
      const reusing = form.keySource === 'reuse' && form.reuseFrom !== '';
      if (id === undefined) {
        const input: ReviewerCreateInput = { ...draft };
        if (reusing) {
          input.apiKeyFromReviewerId = form.reuseFrom;
        } else if (form.apiKeyText !== '') {
          input.apiKey = form.apiKeyText;
        }
        await createReviewer(input);
      } else {
        const input: ReviewerUpdateInput = { ...draft };
        if (reusing) {
          input.apiKeyFromReviewerId = form.reuseFrom;
        } else if (form.apiKeyText !== '') {
          input.apiKey = form.apiKeyText;
        } else if (form.clearApiKey) {
          input.apiKey = null;
        }
        await updateReviewer(id, input);
      }
      // The stored state is now the form's state: disarm the guard and take the saved values as the
      // new baseline before leaving the page.
      savedRef.current = true;
      setBaseline(form);
      navigate('/reviewers');
    } catch (caught) {
      setError(
        errorMessage(caught, 'Could not save the reviewer. Check the fields and try again.'),
      );
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (id === undefined) {
      return;
    }
    if (!window.confirm('Delete this reviewer? Existing run history is kept.')) {
      return;
    }
    setBusy(true);
    try {
      await deleteReviewer(id);
      // Same guard, same disarm: the record is gone, there is nothing left to warn about.
      savedRef.current = true;
      navigate('/reviewers');
    } catch (caught) {
      setError(errorMessage(caught, 'Could not delete the reviewer. Try again.'));
      setBusy(false);
    }
  }

  // A name two sources share is ambiguous in the picker, so it alone gets the id suffix.
  const duplicateNames = new Set(
    keySources
      .map((source) => source.name)
      .filter((name, index, names) => names.indexOf(name) !== index),
  );

  if (form === null) {
    return (
      <div className="space-y-6">
        <EditorHeader id={id} />
        {loadFailed ? (
          <PageError
            message="This reviewer could not be loaded. It may have been deleted, or the API did not answer."
            onRetry={load}
          />
        ) : (
          <PageLoading />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <EditorHeader id={id} />
      <form className="space-y-6" onSubmit={(event) => void handleSubmit(event)}>
        {id === undefined ? (
          <Card title="Start from">
            <p className="text-sm text-text-muted">
              A template is optional: start from a blank reviewer and fill in everything yourself,
              or pick one of the seven built-in starters to prefill three fields. Every field stays
              editable either way.
            </p>
            <fieldset className="space-y-1">
              <legend className="sr-only">Start from</legend>
              <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
                <input
                  checked={startFrom === 'blank'}
                  className={cx('h-4 w-4 accent-accent', focusRing)}
                  name="start-from"
                  onChange={chooseBlankStarter}
                  type="radio"
                  value="blank"
                />
                Blank reviewer
              </label>
              <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
                <input
                  checked={startFrom === 'template'}
                  className={cx('h-4 w-4 accent-accent', focusRing)}
                  name="start-from"
                  onChange={() => setStartFrom('template')}
                  type="radio"
                  value="template"
                />
                Start from a template
              </label>
            </fieldset>
            {startFrom === 'template' ? (
              <Field
                hint={
                  findTemplate(templateKey)?.summary ??
                  'Pick a starter — nothing is prefilled until then.'
                }
                label="Template"
              >
                <Select
                  onChange={(event) => handleTemplateChange(event.target.value)}
                  value={templateKey}
                >
                  <option value="">Choose a template…</option>
                  {REVIEWER_TEMPLATES.map((template) => (
                    <option key={template.key} value={template.key}>
                      {template.name}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : null}
            {appliedTemplate !== null ? (
              <Notice tone="info">
                {`Applied the ${appliedTemplate} template. Name, instructions and rules were replaced — everything can still be edited before saving.`}
              </Notice>
            ) : null}
          </Card>
        ) : null}

        <Card title="Identity">
          <Field error={errors.name} label="Name">
            <Input
              maxLength={120}
              onChange={(event) => update('name', event.target.value)}
              placeholder="Security"
              value={form.name}
            />
          </Field>
          <div className="flex items-center justify-between gap-3">
            <Switch
              checked={form.enabled}
              label="Enabled"
              onCheckedChange={(enabled) => update('enabled', enabled)}
            />
            <p className="text-xs text-text-muted">
              Disabled reviewers keep their settings but are skipped on every run.
            </p>
          </div>
        </Card>

        <Card title="Model">
          <div className="grid gap-5 sm:grid-cols-2">
            <Field hint="Which API shape the provider speaks." label="Flavor">
              <Select
                onChange={(event) => update('flavor', event.target.value as ProviderFlavor)}
                value={form.flavor}
              >
                <option value="openai">OpenAI-compatible</option>
                <option value="anthropic">Anthropic-compatible</option>
              </Select>
            </Field>
            <Field error={errors.model} label="Model">
              <Input
                maxLength={200}
                onChange={(event) => update('model', event.target.value)}
                placeholder="gpt-5"
                value={form.model}
              />
            </Field>
          </div>
          <Field
            error={errors.baseUrl}
            hint="Any base URL — requests go straight from this instance to your provider."
            label="Base URL"
          >
            <Input
              onChange={(event) => update('baseUrl', event.target.value)}
              placeholder="https://api.openai.com/v1"
              value={form.baseUrl}
            />
          </Field>
        </Card>

        <Card title="API key">
          {keySources.length > 0 ? (
            <fieldset className="space-y-1">
              <legend className="text-sm font-medium">Model key</legend>
              <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
                <input
                  checked={form.keySource === 'paste'}
                  className={cx('h-4 w-4 accent-accent', focusRing)}
                  name="key-source"
                  onChange={() => chooseKeySource('paste')}
                  type="radio"
                  value="paste"
                />
                Paste a new key
              </label>
              <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
                <input
                  checked={form.keySource === 'reuse'}
                  className={cx('h-4 w-4 accent-accent', focusRing)}
                  name="key-source"
                  onChange={() => chooseKeySource('reuse')}
                  type="radio"
                  value="reuse"
                />
                Reuse a stored key
              </label>
            </fieldset>
          ) : null}
          {form.keySource === 'reuse' && keySources.length > 0 ? (
            <Field
              hint="The stored key is copied to this reviewer as it is. It is never shown, never typed again, and never logged."
              label="Reuse the key stored on"
            >
              <Select
                onChange={(event) => update('reuseFrom', event.target.value)}
                value={form.reuseFrom}
              >
                {keySources.map((source) => (
                  <option key={source.id} value={source.id}>
                    {reuseSourceLabel(source, duplicateNames.has(source.name))}
                  </option>
                ))}
              </Select>
            </Field>
          ) : (
            <Field
              hint={
                form.hasApiKey
                  ? 'A key is set — type a new one to replace it.'
                  : 'Stored encrypted; never shown again after saving.'
              }
              label="API key"
            >
              <Input
                autoComplete="off"
                onChange={(event) => {
                  update('apiKeyText', event.target.value);
                  if (event.target.value !== '') {
                    update('clearApiKey', false);
                  }
                }}
                placeholder={form.hasApiKey ? '••••••••' : 'sk-…'}
                type="password"
                value={form.apiKeyText}
              />
            </Field>
          )}
          {id !== undefined && form.hasApiKey && form.keySource === 'paste' ? (
            form.clearApiKey ? (
              <p className="text-sm text-text-muted">
                The stored key will be removed on save.{' '}
                <button
                  className={cx('underline', tapTarget, focusRing)}
                  onClick={() => update('clearApiKey', false)}
                  type="button"
                >
                  Undo
                </button>
              </p>
            ) : (
              <Button onClick={() => update('clearApiKey', true)} type="button" variant="ghost">
                Remove stored key
              </Button>
            )
          ) : null}
        </Card>

        <Card title="Instructions">
          <Field hint="What this reviewer cares about." label="Instructions">
            <Textarea
              onChange={(event) => update('instructions', event.target.value)}
              placeholder="Hunt for injection, auth, and data-leak bugs."
              rows={6}
              value={form.instructions}
            />
          </Field>
        </Card>

        <Card title="Rules">
          <Field hint="Hard rules the reviewer must apply." label="Rules">
            <Textarea
              onChange={(event) => update('rules', event.target.value)}
              placeholder="Block on leaked secrets."
              rows={4}
              value={form.rules}
            />
          </Field>
        </Card>

        <Card title="Parameters">
          <Field
            error={errors.params}
            hint='Extra provider body parameters, for example {"temperature": 0.2}.'
            label="Params (JSON)"
          >
            <Textarea
              className="font-mono"
              onChange={(event) => update('paramsText', event.target.value)}
              rows={4}
              value={form.paramsText}
            />
          </Field>
        </Card>

        {error ? <Notice tone="error">{error}</Notice> : null}

        <div className="sticky bottom-0 z-20 flex flex-wrap items-center justify-between gap-3 rounded-card border border-border bg-surface p-3 shadow-panel">
          <div className="flex items-center gap-3">
            <Button busy={busy} type="submit">
              {id === undefined ? 'Create reviewer' : 'Save changes'}
            </Button>
            <span className="text-xs text-text-muted">
              {dirty ? 'Unsaved changes' : 'All changes saved'}
            </span>
          </div>
          {id === undefined ? null : (
            <Button
              disabled={busy}
              onClick={() => void handleDelete()}
              type="button"
              variant="ghost"
            >
              Delete reviewer
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}

function EditorHeader({ id }: { id?: string }) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-xl font-semibold tracking-tight">
        {id === undefined ? 'New reviewer' : 'Edit reviewer'}
      </h1>
      <a
        className={cx(
          'inline-flex items-center text-sm text-text-muted hover:text-text',
          tapTarget,
          focusRing,
        )}
        href="/reviewers"
        onClick={handleAppLink}
      >
        ← All reviewers
      </a>
    </header>
  );
}

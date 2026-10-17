import type { ProviderFlavor } from '@jury-forge/shared';
import type { FormEvent } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { buttonClass, Card, Field, inputClass, LoadFailed, Loading, Notice } from '../components';
import type { ReviewerCreateInput, ReviewerUpdateInput } from '../lib/api';
import { createReviewer, deleteReviewer, getReviewer, updateReviewer } from '../lib/api';

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
};

export default function ReviewerEditorPage({ id }: { id?: string }) {
  const [form, setForm] = useState<FormState | null>(id === undefined ? NEW_REVIEWER : null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (id === undefined) {
      return;
    }
    setLoadFailed(false);
    try {
      const reviewer = await getReviewer(id);
      setForm({
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
      });
    } catch {
      setLoadFailed(true);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => (current === null ? current : { ...current, [key]: value }));
  }

  function parsedParams(): Record<string, unknown> | null {
    try {
      const value: unknown = JSON.parse(form?.paramsText ?? '');
      return value !== null && typeof value === 'object' && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : null;
    } catch {
      return null;
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (form === null) {
      return;
    }
    const params = parsedParams();
    if (params === null) {
      setError('Params must be a JSON object (for example {"temperature": 0.2}).');
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
      if (id === undefined) {
        const input: ReviewerCreateInput = { ...draft };
        if (form.apiKeyText !== '') {
          input.apiKey = form.apiKeyText;
        }
        await createReviewer(input);
      } else {
        const input: ReviewerUpdateInput = { ...draft };
        if (form.apiKeyText !== '') {
          input.apiKey = form.apiKeyText;
        } else if (form.clearApiKey) {
          input.apiKey = null;
        }
        await updateReviewer(id, input);
      }
      window.location.href = '/reviewers';
    } catch {
      setError('Could not save the reviewer. Check the fields and try again.');
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
      window.location.href = '/reviewers';
    } catch {
      setError('Could not delete the reviewer.');
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold tracking-tight">
          {id === undefined ? 'New reviewer' : 'Edit reviewer'}
        </h1>
        <a className="text-sm text-neutral-500 transition hover:text-neutral-900" href="/reviewers">
          ← All reviewers
        </a>
      </header>
      {form === null ? (
        <Card>{loadFailed ? <LoadFailed onRetry={load} /> : <Loading />}</Card>
      ) : (
        <Card>
          <form className="space-y-5" onSubmit={handleSubmit}>
            <Field label="Name">
              <input
                className={inputClass}
                maxLength={120}
                onChange={(event) => update('name', event.target.value)}
                placeholder="Security"
                required
                value={form.name}
              />
            </Field>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Flavor" hint="Which API shape the provider speaks.">
                <select
                  className={inputClass}
                  onChange={(event) => update('flavor', event.target.value as ProviderFlavor)}
                  value={form.flavor}
                >
                  <option value="openai">OpenAI-compatible</option>
                  <option value="anthropic">Anthropic-compatible</option>
                </select>
              </Field>
              <Field label="Model">
                <input
                  className={inputClass}
                  maxLength={200}
                  onChange={(event) => update('model', event.target.value)}
                  placeholder="gpt-5"
                  required
                  value={form.model}
                />
              </Field>
            </div>
            <Field
              label="Base URL"
              hint="Any base URL — requests go straight from this instance to your provider."
            >
              <input
                className={inputClass}
                onChange={(event) => update('baseUrl', event.target.value)}
                placeholder="https://api.openai.com/v1"
                required
                value={form.baseUrl}
              />
            </Field>
            <Field
              label="API key"
              hint={
                form.hasApiKey
                  ? 'A key is set — type a new one to replace it.'
                  : 'Stored encrypted; never shown again after saving.'
              }
            >
              <input
                autoComplete="off"
                className={inputClass}
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
            {id !== undefined && form.hasApiKey ? (
              form.clearApiKey ? (
                <p className="text-xs text-neutral-500">
                  The stored key will be removed on save.{' '}
                  <button
                    className="underline"
                    onClick={() => update('clearApiKey', false)}
                    type="button"
                  >
                    Undo
                  </button>
                </p>
              ) : (
                <button
                  className="text-xs text-red-600 underline"
                  onClick={() => update('clearApiKey', true)}
                  type="button"
                >
                  Remove stored key
                </button>
              )
            ) : null}
            <Field label="Instructions" hint="What this reviewer cares about.">
              <textarea
                className={inputClass}
                onChange={(event) => update('instructions', event.target.value)}
                placeholder="Hunt for injection, auth, and data-leak bugs."
                rows={6}
                value={form.instructions}
              />
            </Field>
            <Field label="Rules" hint="Hard rules the reviewer must apply.">
              <textarea
                className={inputClass}
                onChange={(event) => update('rules', event.target.value)}
                placeholder="Block on leaked secrets."
                rows={4}
                value={form.rules}
              />
            </Field>
            <Field
              label="Params (JSON)"
              hint='Extra provider body parameters, for example {"temperature": 0.2}.'
            >
              <textarea
                className={`${inputClass} font-mono`}
                onChange={(event) => update('paramsText', event.target.value)}
                rows={4}
                value={form.paramsText}
              />
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <input
                checked={form.enabled}
                onChange={(event) => update('enabled', event.target.checked)}
                type="checkbox"
              />
              Enabled
            </label>
            {error ? <Notice tone="error">{error}</Notice> : null}
            <div className="flex items-center justify-between gap-3">
              <button className={buttonClass} disabled={busy} type="submit">
                {busy ? 'Saving…' : id === undefined ? 'Create reviewer' : 'Save changes'}
              </button>
              {id === undefined ? null : (
                <button
                  className="text-sm text-red-600 underline disabled:opacity-50"
                  disabled={busy}
                  onClick={() => void handleDelete()}
                  type="button"
                >
                  Delete reviewer
                </button>
              )}
            </div>
          </form>
        </Card>
      )}
    </div>
  );
}

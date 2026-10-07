import type { SetupCodeResponse } from '@jury-forge/shared';
import { manifestForm } from './wizard';

/**
 * GitHub's manifest flow wants a regular form POST (JSON in a hidden `manifest` field) that
 * navigates the browser to the app-creation page. Build it and submit it.
 */
export function submitManifestForm(response: SetupCodeResponse): void {
  const { action, fields } = manifestForm(response);
  const form = document.createElement('form');
  form.method = 'POST';
  form.action = action;
  for (const [name, value] of Object.entries(fields)) {
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = name;
    input.value = value;
    form.append(input);
  }
  document.body.append(form);
  form.submit();
}

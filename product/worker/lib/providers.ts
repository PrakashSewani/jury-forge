import type { ProviderFlavor } from '@jury-forge/shared';

const PROVIDER_TIMEOUT_MS = 120_000;
const ANTHROPIC_DEFAULT_MAX_TOKENS = 4_096;
const ANTHROPIC_VERSION = '2023-06-01';

export interface ProviderCall {
  flavor: ProviderFlavor;
  baseUrl: string;
  apiKey: string;
  model: string;
  params: Record<string, unknown>;
  system: string;
  user: string;
  timeoutMs?: number;
}

/**
 * Calls the reviewer's provider and returns the parsed JSON value of its response; the caller
 * validates the findings shape (see `consolidate.parseFindings`). A failure here fails only
 * this reviewer's call.
 */
export async function callProvider(call: ProviderCall): Promise<unknown> {
  const built = call.flavor === 'anthropic' ? anthropicRequest(call) : openAiRequest(call);
  const response = await fetch(built.url, {
    method: 'POST',
    headers: built.headers,
    body: JSON.stringify(built.body),
    signal: AbortSignal.timeout(call.timeoutMs ?? PROVIDER_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`${call.flavor} provider responded with status ${response.status}`);
  }
  const body: unknown = await response.json();
  const text = call.flavor === 'anthropic' ? anthropicText(body) : openAiText(body);
  return extractJsonValue(text);
}

interface ProviderRequest {
  url: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
}

function openAiRequest(call: ProviderCall): ProviderRequest {
  return {
    url: `${trimTrailingSlashes(call.baseUrl)}/chat/completions`,
    headers: {
      Authorization: `Bearer ${call.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: {
      ...call.params,
      model: call.model,
      messages: [
        { role: 'system', content: call.system },
        { role: 'user', content: call.user },
      ],
    },
  };
}

function anthropicRequest(call: ProviderCall): ProviderRequest {
  return {
    url: `${trimTrailingSlashes(call.baseUrl)}/v1/messages`,
    headers: {
      'x-api-key': call.apiKey,
      'anthropic-version': ANTHROPIC_VERSION,
      'Content-Type': 'application/json',
    },
    body: {
      // The Anthropic API requires max_tokens; params_json can override this default.
      max_tokens: ANTHROPIC_DEFAULT_MAX_TOKENS,
      ...call.params,
      model: call.model,
      system: call.system,
      messages: [{ role: 'user', content: call.user }],
    },
  };
}

function trimTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, '');
}

function openAiText(body: unknown): string {
  const content = (body as { choices?: { message?: { content?: unknown } }[] }).choices?.[0]
    ?.message?.content;
  if (typeof content !== 'string') {
    throw new Error('provider response did not contain message content');
  }
  return content;
}

function anthropicText(body: unknown): string {
  const content = (body as { content?: unknown }).content;
  if (!Array.isArray(content)) {
    throw new Error('provider response did not contain content blocks');
  }
  const texts: string[] = [];
  for (const block of content) {
    const { type, text } = block as { type?: unknown; text?: unknown };
    if (type === 'text' && typeof text === 'string') {
      texts.push(text);
    }
  }
  if (texts.length === 0) {
    throw new Error('provider response did not contain text');
  }
  return texts.join('\n');
}

/**
 * Tolerant JSON extraction: the response contract is strict JSON, but models sometimes wrap it
 * in prose or a fenced code block, so try the whole text, a fenced block, then the widest
 * brace (or bracket) span.
 */
export function extractJsonValue(text: string): unknown {
  const candidates: string[] = [text.trim()];
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced?.[1] !== undefined) {
    candidates.push(fenced[1].trim());
  }
  for (const [open, close] of [
    ['{', '}'],
    ['[', ']'],
  ] as const) {
    const start = text.indexOf(open);
    const end = text.lastIndexOf(close);
    if (start !== -1 && end > start) {
      candidates.push(text.slice(start, end + 1));
    }
  }
  for (const candidate of candidates) {
    if (candidate === '') {
      continue;
    }
    try {
      return JSON.parse(candidate);
    } catch {
      // try the next candidate
    }
  }
  throw new Error('provider response did not contain a JSON value');
}

import { delay, http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { callProvider, extractJsonValue } from '../worker/lib/providers';
import { network } from './network';

const BASE = {
  baseUrl: 'https://api.example.com/v1',
  apiKey: 'pk-test',
  model: 'model-x',
  params: {},
  system: 'system prompt',
  user: 'user prompt',
};

describe('provider adapters', () => {
  it('calls an OpenAI-compatible endpoint and parses the findings', async () => {
    const seen: { authorization: string | null; body: Record<string, unknown> }[] = [];
    network.use(
      http.post('https://api.example.com/v1/chat/completions', async ({ request }) => {
        seen.push({
          authorization: request.headers.get('Authorization'),
          body: (await request.json()) as Record<string, unknown>,
        });
        return HttpResponse.json({
          choices: [
            {
              message: {
                content:
                  '{"findings":[{"file":"src/x.ts","line":3,"severity":"warning","title":"t","body":"b"}]}',
              },
            },
          ],
        });
      }),
    );

    const { value, usage } = await callProvider({
      ...BASE,
      flavor: 'openai',
      params: { temperature: 0.2 },
    });

    expect(seen[0]?.authorization).toBe('Bearer pk-test');
    expect(seen[0]?.body.model).toBe('model-x');
    expect(seen[0]?.body.temperature).toBe(0.2);
    const messages = seen[0]?.body.messages as { role: string; content: string }[];
    expect(messages.map((message) => message.role)).toEqual(['system', 'user']);
    expect(messages[0]?.content).toBe('system prompt');
    expect(messages[1]?.content).toBe('user prompt');
    expect(value).toEqual({
      findings: [{ file: 'src/x.ts', line: 3, severity: 'warning', title: 't', body: 'b' }],
    });
    expect(usage).toBeNull();
  });

  it('calls an Anthropic-compatible endpoint with a default max_tokens', async () => {
    const seen: {
      apiKey: string | null;
      version: string | null;
      body: Record<string, unknown>;
    }[] = [];
    network.use(
      http.post('https://api.example.com/v1/messages', async ({ request }) => {
        seen.push({
          apiKey: request.headers.get('x-api-key'),
          version: request.headers.get('anthropic-version'),
          body: (await request.json()) as Record<string, unknown>,
        });
        return HttpResponse.json({
          content: [{ type: 'text', text: 'Here you go:\n```json\n{"findings": []}\n```' }],
        });
      }),
    );

    const { value } = await callProvider({
      ...BASE,
      baseUrl: 'https://api.example.com',
      flavor: 'anthropic',
    });

    expect(seen[0]?.apiKey).toBe('pk-test');
    expect(seen[0]?.version).toBe('2023-06-01');
    expect(seen[0]?.body.system).toBe('system prompt');
    expect(seen[0]?.body.max_tokens).toBe(4096);
    expect(seen[0]?.body.messages).toEqual([{ role: 'user', content: 'user prompt' }]);
    expect(value).toEqual({ findings: [] });
  });

  it('lets params override the Anthropic max_tokens default', async () => {
    let maxTokens: unknown;
    network.use(
      http.post('https://api.example.com/v1/messages', async ({ request }) => {
        const body = (await request.json()) as { max_tokens?: unknown };
        maxTokens = body.max_tokens;
        return HttpResponse.json({ content: [{ type: 'text', text: '{"findings":[]}' }] });
      }),
    );

    await callProvider({
      ...BASE,
      baseUrl: 'https://api.example.com',
      flavor: 'anthropic',
      params: { max_tokens: 512 },
    });
    expect(maxTokens).toBe(512);
  });

  it('normalizes OpenAI token usage', async () => {
    network.use(
      http.post('https://api.example.com/v1/chat/completions', () =>
        HttpResponse.json({
          choices: [{ message: { content: '{"findings":[]}' } }],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        }),
      ),
    );

    const { usage } = await callProvider({ ...BASE, flavor: 'openai' });
    expect(usage).toEqual({ promptTokens: 10, completionTokens: 5, totalTokens: 15 });
  });

  it('normalizes Anthropic token usage with a summed total', async () => {
    network.use(
      http.post('https://api.example.com/v1/messages', () =>
        HttpResponse.json({
          content: [{ type: 'text', text: '{"findings":[]}' }],
          usage: { input_tokens: 10, output_tokens: 5 },
        }),
      ),
    );

    const { usage } = await callProvider({
      ...BASE,
      baseUrl: 'https://api.example.com',
      flavor: 'anthropic',
    });
    expect(usage).toEqual({ promptTokens: 10, completionTokens: 5, totalTokens: 15 });
  });

  it('nulls missing or non-numeric usage fields', async () => {
    network.use(
      http.post('https://api.example.com/v1/chat/completions', () =>
        HttpResponse.json({
          choices: [{ message: { content: '{"findings":[]}' } }],
          usage: { prompt_tokens: 'ten', total_tokens: 15 },
        }),
      ),
    );

    const { usage } = await callProvider({ ...BASE, flavor: 'openai' });
    expect(usage).toEqual({ promptTokens: null, completionTokens: null, totalTokens: 15 });
  });

  it('returns null usage without failing when the envelope reports none', async () => {
    network.use(
      http.post('https://api.example.com/v1/chat/completions', () =>
        HttpResponse.json({ choices: [{ message: { content: '{"findings":[]}' } }] }),
      ),
    );

    const { value, usage } = await callProvider({ ...BASE, flavor: 'openai' });
    expect(value).toEqual({ findings: [] });
    expect(usage).toBeNull();
  });

  it('rejects a non-success response', async () => {
    network.use(
      http.post(
        'https://api.example.com/v1/chat/completions',
        () => new HttpResponse(null, { status: 502 }),
      ),
    );
    await expect(callProvider({ ...BASE, flavor: 'openai' })).rejects.toThrow('502');
  });

  it('rejects a response without a JSON value', async () => {
    network.use(
      http.post('https://api.example.com/v1/chat/completions', () =>
        HttpResponse.json({ choices: [{ message: { content: 'no json here' } }] }),
      ),
    );
    await expect(callProvider({ ...BASE, flavor: 'openai' })).rejects.toThrow('JSON');
  });

  it('aborts a call that outlives the timeout', async () => {
    network.use(
      http.post('https://api.example.com/v1/chat/completions', async () => {
        await delay(250);
        return HttpResponse.json({ choices: [{ message: { content: '{"findings":[]}' } }] });
      }),
    );
    await expect(callProvider({ ...BASE, flavor: 'openai', timeoutMs: 40 })).rejects.toThrow();
  });
});

describe('extractJsonValue', () => {
  it('parses a bare JSON value', () => {
    expect(extractJsonValue('{"findings":[]}')).toEqual({ findings: [] });
  });

  it('parses a fenced JSON value', () => {
    expect(extractJsonValue('```json\n{"findings":[]}\n```')).toEqual({ findings: [] });
  });

  it('parses a JSON value embedded in prose', () => {
    expect(extractJsonValue('Sure! The result is {"findings":[{"a":1}]} — done.')).toEqual({
      findings: [{ a: 1 }],
    });
  });

  it('throws when there is no JSON value', () => {
    expect(() => extractJsonValue('nothing to see')).toThrow();
  });
});

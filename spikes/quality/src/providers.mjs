// THROWAWAY SPIKE CODE - not part of the Jury Forge product.
import { redact } from './util.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function secretsFor(modelCfg, env = process.env) {
  return modelCfg.apiKeyEnv && env[modelCfg.apiKeyEnv] ? [env[modelCfg.apiKeyEnv]] : [];
}

function assertSafeBaseUrl(baseUrl) {
  const u = new URL(baseUrl);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname);
  if (u.protocol !== 'https:' && !local)
    throw new Error(`refusing to send a key over ${u.protocol}// to ${u.hostname}`);
}

/**
 * One model call. No tools, no streaming, no repair retry. Same code path for every condition.
 * Returns { text, usage:{input,output}, latencyMs, stopReason, attempts }.
 * `registry` lets tests inject a stub provider; real providers are 'openai' and 'anthropic'.
 */
export async function callModel(
  modelCfg,
  { system, user, maxTokens, temperature, cfg, env = process.env, registry = {}, fetchImpl = fetch }
) {
  if (registry[modelCfg.provider]) {
    const t0 = Date.now();
    const r = await registry[modelCfg.provider]({ modelCfg, system, user, maxTokens, temperature });
    return { stopReason: 'stop', attempts: 1, ...r, latencyMs: r.latencyMs ?? Date.now() - t0 };
  }
  const secrets = secretsFor(modelCfg, env);
  const apiKey = secrets[0];
  if (!apiKey) throw Object.assign(new Error(`environment variable ${modelCfg.apiKeyEnv} is not set`), { fatal: true });
  assertSafeBaseUrl(modelCfg.baseUrl);
  const base = modelCfg.baseUrl.replace(/\/+$/, '');

  let url;
  let headers;
  let body;
  if (modelCfg.provider === 'openai') {
    url = `${base}/chat/completions`;
    headers = { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` };
    body = {
      model: modelCfg.model,
      temperature,
      [modelCfg.maxTokensParam || 'max_tokens']: maxTokens,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user }
      ]
    };
  } else if (modelCfg.provider === 'anthropic') {
    url = `${base}/v1/messages`;
    headers = {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': modelCfg.anthropicVersion || '2023-06-01'
    };
    body = {
      model: modelCfg.model,
      temperature,
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: user }]
    };
  } else {
    throw new Error(`unknown provider kind: ${modelCfg.provider}`);
  }

  const t0 = Date.now();
  let lastErr;
  for (let attempt = 1; attempt <= cfg.retries.max + 1; attempt++) {
    try {
      const res = await fetchImpl(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(cfg.requestTimeoutMs)
      });
      const raw = await res.text();
      if (res.ok) {
        const j = JSON.parse(raw);
        if (modelCfg.provider === 'openai') {
          const c = j.choices?.[0];
          return {
            text: c?.message?.content ?? '',
            usage: { input: j.usage?.prompt_tokens ?? 0, output: j.usage?.completion_tokens ?? 0 },
            latencyMs: Date.now() - t0,
            stopReason: c?.finish_reason ?? 'unknown',
            attempts: attempt
          };
        }
        return {
          text: (j.content || []).filter((b) => b.type === 'text').map((b) => b.text).join(''),
          usage: { input: j.usage?.input_tokens ?? 0, output: j.usage?.output_tokens ?? 0 },
          latencyMs: Date.now() - t0,
          stopReason: j.stop_reason ?? 'unknown',
          attempts: attempt
        };
      }
      const msg = redact(raw.slice(0, 300), secrets);
      if (res.status === 400 && /temperature/i.test(raw))
        throw Object.assign(
          new Error(`model rejected temperature=${temperature}; the protocol requires temperature 0 - STOP and ask the owner: ${msg}`),
          { fatal: true }
        );
      if (res.status === 429 || res.status >= 500) {
        lastErr = new Error(`HTTP ${res.status}: ${msg}`);
        const ra = Number(res.headers.get('retry-after'));
        await sleep(ra > 0 ? ra * 1000 : cfg.retries.baseDelayMs * 2 ** (attempt - 1));
        continue;
      }
      throw Object.assign(new Error(`HTTP ${res.status}: ${msg}`), { fatal: true });
    } catch (e) {
      if (e.fatal) throw e;
      lastErr = new Error(redact(e.message, secrets));
      await sleep(cfg.retries.baseDelayMs * 2 ** (attempt - 1));
    }
  }
  throw new Error(`gave up after ${cfg.retries.max + 1} attempts: ${lastErr?.message}`);
}

export function costUsd(usage, price) {
  if (!price) return null;
  return (usage.input * price.inputPerMTok + usage.output * price.outputPerMTok) / 1e6;
}

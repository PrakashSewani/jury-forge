import { PRODUCT_NAME, type HealthResponse } from '@jury-forge/shared';
import { useEffect, useState } from 'react';

export default function App() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/health')
      .then((response) => {
        if (!response.ok) {
          throw new Error(`API returned ${response.status}`);
        }
        return response.json() as Promise<HealthResponse>;
      })
      .then((body) => {
        if (!cancelled) setHealth(body);
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : String(reason));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center gap-8 p-8 text-center">
      <div className="space-y-3">
        <h1 className="text-4xl font-semibold tracking-tight">{PRODUCT_NAME}</h1>
        <p className="text-neutral-500">
          Self-hosted AI code review — your reviewers, your models, your keys.
        </p>
      </div>
      <section className="w-full rounded-lg border border-neutral-200 p-4 font-mono text-sm">
        {health ? <p>api: ok ({health.name})</p> : null}
        {error ? <p>api: {error}</p> : null}
        {!health && !error ? <p>api: checking…</p> : null}
      </section>
    </main>
  );
}

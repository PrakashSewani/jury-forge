import { afterEach, describe, expect, it, vi } from 'vitest';
import { type Fetch, runHealthcheck } from './healthcheck.ts';

const respond =
  (status: number, body = ''): Fetch =>
  async () =>
    new Response(body, { status });

describe('runHealthcheck', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('exits 0 on a 200 from loopback', async () => {
    const seen: string[] = [];
    const fetchImpl: Fetch = async (url, init) => {
      seen.push(url);
      expect(init.redirect).toBe('manual');
      expect(init.signal).toBeInstanceOf(AbortSignal);
      return new Response('{}', { status: 200 });
    };
    expect(await runHealthcheck(['http://127.0.0.1:3000/readyz'], fetchImpl)).toBe(0);
    expect(await runHealthcheck(['http://localhost:8080/healthz'], fetchImpl)).toBe(0);
    expect(await runHealthcheck(['http://[::1]:3000/readyz'], fetchImpl)).toBe(0);
    expect(seen).toHaveLength(3);
  });

  it('exits 1 and prints the breakdown on a 503', async () => {
    const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    const body = '{"status":"not_ready","components":{"database":"error"}}';
    expect(await runHealthcheck(['http://127.0.0.1:3000/readyz'], respond(503, body))).toBe(1);
    expect(String(stderr.mock.calls[0]?.[0])).toContain('503 {"status":"not_ready"');
  });

  it('exits 1 on a redirect or a network error', async () => {
    vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    expect(await runHealthcheck(['http://127.0.0.1:3000/'], respond(308))).toBe(1);
    const failing: Fetch = async () => {
      throw new TypeError('fetch failed');
    };
    expect(await runHealthcheck(['http://127.0.0.1:3000/readyz'], failing)).toBe(1);
  });

  it.each([
    [[]],
    [['http://127.0.0.1:3000/readyz', 'extra']],
    [['not a url']],
    [['https://127.0.0.1:3000/readyz']],
    [['http://app:3000/readyz']],
    [['http://10.0.0.1:3000/readyz']],
    [['http://user@127.0.0.1:3000/readyz']],
    [['file:///etc/passwd']],
  ])('refuses %j without fetching', async (argv) => {
    vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    let fetched = false;
    const fetchImpl: Fetch = async () => {
      fetched = true;
      return new Response('', { status: 200 });
    };
    expect(await runHealthcheck(argv, fetchImpl)).toBe(2);
    expect(fetched).toBe(false);
  });
});

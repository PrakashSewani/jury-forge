// `main.js healthcheck <url>`: the container healthcheck. The distroless image has no shell and no
// curl, so the image probes itself with Node (deployment.md §3). It accepts only plain-HTTP URLs on
// the container's own loopback, so it cannot be pointed at another host. Exit 0 on a 200, else 1.

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]']);
const TIMEOUT_MS = 2500;

export type Fetch = (url: string, init: RequestInit) => Promise<Response>;

export async function runHealthcheck(
  argv: readonly string[],
  fetchImpl: Fetch = fetch,
): Promise<number> {
  const [target, ...rest] = argv;
  if (target === undefined || rest.length > 0) {
    process.stderr.write('usage: healthcheck http://127.0.0.1:<port>/<path>\n');
    return 2;
  }
  let url: URL;
  try {
    url = new URL(target);
  } catch {
    process.stderr.write('healthcheck: not a URL\n');
    return 2;
  }
  if (
    url.protocol !== 'http:' ||
    !LOOPBACK_HOSTS.has(url.hostname) ||
    url.username !== '' ||
    url.password !== ''
  ) {
    process.stderr.write('healthcheck: only http:// URLs on loopback are allowed\n');
    return 2;
  }
  try {
    const response = await fetchImpl(url.toString(), {
      redirect: 'manual',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const body = await response.text();
    if (response.status === 200) return 0;
    // The readiness breakdown, so `docker inspect` shows which component is not ready.
    process.stderr.write(`healthcheck: ${response.status} ${body.slice(0, 500)}\n`);
    return 1;
  } catch (error) {
    process.stderr.write(
      `healthcheck: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    return 1;
  }
}

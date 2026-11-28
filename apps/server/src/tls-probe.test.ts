// The probe's failure paths. Its success path, a publicly trusted chain, is checked end to end
// against Pebble in scripts/compose-smoke-test.sh, so no test key is checked in.
import { createServer, type Server } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { createTlsProbe } from './tls-probe.ts';

let server: Server | null = null;
const sockets = new Set<import('node:net').Socket>();

afterEach(async () => {
  for (const socket of sockets) socket.destroy();
  sockets.clear();
  await new Promise<void>((resolve) =>
    server === null ? resolve() : server.close(() => resolve()),
  );
  server = null;
});

function listen(onConnection: (socket: import('node:net').Socket) => void): Promise<number> {
  server = createServer((socket) => {
    sockets.add(socket);
    onConnection(socket);
  });
  return new Promise((resolve) => {
    server?.listen(0, '127.0.0.1', () => {
      const address = server?.address();
      resolve(typeof address === 'object' && address !== null ? address.port : 0);
    });
  });
}

describe('createTlsProbe', () => {
  it('reports pending when nothing listens', async () => {
    const port = await listen(() => {});
    await new Promise<void>((resolve) => server?.close(() => resolve()));
    server = null;
    const result = await createTlsProbe({ host: '127.0.0.1', port }, 2000)('review.example.com');
    expect(result).toEqual({ issued: false, reason: 'ECONNREFUSED' });
  });

  it('reports pending when the handshake is closed, as Caddy does when ask refuses', async () => {
    const port = await listen((socket) => socket.destroy());
    const result = await createTlsProbe({ host: '127.0.0.1', port }, 2000)('review.example.com');
    expect(result.issued).toBe(false);
  });

  it('reports a timeout when the peer never answers', async () => {
    const port = await listen(() => {});
    const result = await createTlsProbe({ host: '127.0.0.1', port }, 200)('review.example.com');
    expect(result).toEqual({ issued: false, reason: 'timeout' });
  });
});

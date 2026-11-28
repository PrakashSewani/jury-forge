import { Writable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { createLogger } from './logger.ts';

function capture(): { stream: Writable; lines: () => Record<string, unknown>[] } {
  const chunks: string[] = [];
  const stream = new Writable({
    write(chunk, _encoding, done) {
      chunks.push(String(chunk));
      done();
    },
  });
  const lines = () =>
    chunks
      .join('')
      .split('\n')
      .filter((line) => line !== '')
      .map((line) => JSON.parse(line) as Record<string, unknown>);
  return { stream, lines };
}

describe('createLogger', () => {
  it('writes JSON lines tagged with the role', () => {
    const { stream, lines } = capture();
    createLogger('info', 'app', stream).info('hello');
    expect(lines()).toEqual([expect.objectContaining({ role: 'app', msg: 'hello', level: 30 })]);
  });

  it('redacts credential headers', () => {
    const { stream, lines } = capture();
    createLogger('info', 'app', stream).info(
      {
        req: {
          headers: {
            authorization: 'Bearer placeholder-token',
            cookie: 'jf_session=placeholder',
            'x-hub-signature-256': 'sha256=placeholder',
          },
        },
        res: { headers: { 'set-cookie': 'jf_session=placeholder' } },
      },
      'request',
    );
    const text = JSON.stringify(lines());
    expect(text).not.toContain('placeholder');
    expect(text.match(/\[redacted\]/g)).toHaveLength(4);
  });

  it('warns when verbose logging is on, and only then', () => {
    for (const level of ['debug', 'trace'] as const) {
      const { stream, lines } = capture();
      createLogger(level, 'worker', stream);
      expect(lines()).toEqual([
        expect.objectContaining({ level: 40, role: 'worker', logLevel: level }),
      ]);
    }
    const quiet = capture();
    createLogger('info', 'worker', quiet.stream);
    expect(quiet.lines()).toEqual([]);
  });
});

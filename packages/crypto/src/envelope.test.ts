import { randomBytes } from 'node:crypto';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  EncryptionKeyMismatchError,
  open,
  type SealedSecret,
  SecretIntegrityError,
  seal,
} from './envelope.ts';
import { MasterKey } from './master-key.ts';

const key = MasterKey.fromBase64(randomBytes(32).toString('base64'));
const other = MasterKey.fromBase64(randomBytes(32).toString('base64'));
const CONTEXT = '0190f5c0-0000-7000-8000-000000000001/provider_api_key';

describe('seal and open', () => {
  it('round-trips text and bytes, with a fresh DEK and IVs every time', () => {
    const a = seal(key, 'sk-test-placeholder', CONTEXT);
    const b = seal(key, 'sk-test-placeholder', CONTEXT);
    expect(open(key, a, CONTEXT).toString('utf8')).toBe('sk-test-placeholder');
    expect(a.keyId).toBe(key.keyId);
    expect(a.ciphertext.equals(b.ciphertext)).toBe(false);
    expect(a.wrappedDek.equals(b.wrappedDek)).toBe(false);
    const bytes = randomBytes(300);
    expect(open(key, seal(key, bytes, CONTEXT), CONTEXT).equals(bytes)).toBe(true);
    expect(open(key, seal(key, '', CONTEXT), CONTEXT).length).toBe(0);
  });

  it('never stores the plaintext or the master key in the record', () => {
    const secret = 'ghs_placeholderplaceholderplaceholder';
    const sealed = seal(key, secret, CONTEXT);
    for (const part of [sealed.ciphertext, sealed.wrappedDek]) {
      expect(part.includes(Buffer.from(secret))).toBe(false);
    }
    expect(sealed.ciphertext.length).toBe(1 + 12 + 16 + secret.length);
    expect(sealed.wrappedDek.length).toBe(1 + 12 + 16 + 32);
  });

  it('refuses another master key as encryption_key_mismatch', () => {
    const sealed = seal(key, 'x', CONTEXT);
    let caught: unknown;
    try {
      open(other, sealed, CONTEXT);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(EncryptionKeyMismatchError);
    expect((caught as EncryptionKeyMismatchError).code).toBe('encryption_key_mismatch');
    // Even with the key id forged to match, the wrapped DEK does not open under another key.
    expect(() => open(other, { ...sealed, keyId: other.keyId }, CONTEXT)).toThrow(
      SecretIntegrityError,
    );
  });

  it('refuses another context: a ciphertext moved to another org or kind does not open', () => {
    const sealed = seal(key, 'x', CONTEXT);
    expect(() => open(key, sealed, `${CONTEXT}x`)).toThrow(SecretIntegrityError);
    expect(() => open(key, sealed, 'other-org/provider_api_key')).toThrow(SecretIntegrityError);
  });

  it('refuses a missing context', () => {
    expect(() => seal(key, 'x', '')).toThrow(TypeError);
    expect(() => open(key, seal(key, 'x', CONTEXT), '')).toThrow(TypeError);
  });

  it('refuses unknown versions and truncated records', () => {
    const sealed = seal(key, 'secret', CONTEXT);
    const cases: SealedSecret[] = [
      { ...sealed, ciphertext: Buffer.concat([Buffer.of(2), sealed.ciphertext.subarray(1)]) },
      { ...sealed, ciphertext: sealed.ciphertext.subarray(0, 10) },
      { ...sealed, wrappedDek: sealed.wrappedDek.subarray(0, 28) },
      { ...sealed, wrappedDek: Buffer.alloc(0) },
    ];
    for (const record of cases) {
      expect(() => open(key, record, CONTEXT)).toThrow(SecretIntegrityError);
    }
  });

  it('detects any single-byte change in either part', () => {
    const sealed = seal(key, 'a secret worth protecting', CONTEXT);
    fc.assert(
      fc.property(
        fc.boolean(),
        fc.nat(),
        fc.integer({ min: 1, max: 255 }),
        (inDek, position, flip) => {
          const part = inDek ? sealed.wrappedDek : sealed.ciphertext;
          const changed = Buffer.from(part);
          const index = position % changed.length;
          changed[index] = (changed[index] as number) ^ flip;
          const record = inDek
            ? { ...sealed, wrappedDek: changed }
            : { ...sealed, ciphertext: changed };
          expect(() => open(key, record, CONTEXT)).toThrow(SecretIntegrityError);
        },
      ),
    );
  });
});

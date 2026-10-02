import { describe, expect, it } from 'vitest';
import {
  decryptSecret,
  encryptSecret,
  importEncryptionKey,
  randomToken,
  sha256Hex,
} from '../worker/lib/crypto';

const KEY = btoa(Array.from({ length: 32 }, (_, index) => String.fromCharCode(index)).join(''));
const OTHER_KEY = btoa(String.fromCharCode(255).repeat(32));

describe('crypto', () => {
  it('round-trips a secret', async () => {
    const key = await importEncryptionKey(KEY);
    const encrypted = await encryptSecret(key, 'github-app-private-key');
    expect(encrypted).toMatch(/^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    await expect(decryptSecret(key, encrypted)).resolves.toBe('github-app-private-key');
  });

  it('uses a fresh IV per encryption', async () => {
    const key = await importEncryptionKey(KEY);
    const first = await encryptSecret(key, 'same');
    const second = await encryptSecret(key, 'same');
    expect(first).not.toBe(second);
    await expect(decryptSecret(key, first)).resolves.toBe('same');
    await expect(decryptSecret(key, second)).resolves.toBe('same');
  });

  it('rejects a wrong key', async () => {
    const key = await importEncryptionKey(KEY);
    const otherKey = await importEncryptionKey(OTHER_KEY);
    const encrypted = await encryptSecret(key, 'secret');
    await expect(decryptSecret(otherKey, encrypted)).rejects.toThrow();
  });

  it('rejects tampered and malformed input', async () => {
    const key = await importEncryptionKey(KEY);
    const encrypted = await encryptSecret(key, 'secret');
    const tampered = `${encrypted.slice(0, -1)}${encrypted.endsWith('A') ? 'B' : 'A'}`;
    await expect(decryptSecret(key, tampered)).rejects.toThrow();
    await expect(decryptSecret(key, 'not-a-secret')).rejects.toThrow();
    await expect(decryptSecret(key, 'v2.a.b')).rejects.toThrow();
  });

  it('validates the key', async () => {
    await expect(importEncryptionKey(btoa('too-short'))).rejects.toThrow(/32 bytes/);
    await expect(importEncryptionKey('not base64 !!!')).rejects.toThrow();
  });

  it('hashes with SHA-256', async () => {
    await expect(sha256Hex('abc')).resolves.toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('generates distinct base64url tokens', () => {
    const first = randomToken();
    const second = randomToken();
    expect(first).not.toBe(second);
    expect(first).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });
});

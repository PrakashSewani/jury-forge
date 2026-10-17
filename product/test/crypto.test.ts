import { describe, expect, it } from 'vitest';
import {
  decryptSecret,
  encryptSecret,
  importEncryptionKey,
  isCurrentCiphertext,
  loadKeyRing,
  randomToken,
  reencryptSecret,
  sha256Hex,
  type EncryptionKeyRing,
} from '../worker/lib/crypto';

const KEY = btoa(Array.from({ length: 32 }, (_, index) => String.fromCharCode(index)).join(''));
const OTHER_KEY = btoa(String.fromCharCode(255).repeat(32));

function ring(values: {
  key: string;
  version?: string;
  previousKey?: string;
  previousVersion?: string;
}): Promise<EncryptionKeyRing> {
  return loadKeyRing(values);
}

async function encryptLegacyV1(key: CryptoKey, plaintext: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(plaintext),
  );
  return ['v1', toBase64Url(iv), toBase64Url(new Uint8Array(ciphertext))].join('.');
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

describe('crypto', () => {
  it('round-trips a secret with the current key and stamps its version', async () => {
    const keyRing = await ring({ key: KEY });
    const encrypted = await encryptSecret(keyRing, 'github-app-private-key');
    expect(encrypted).toMatch(/^v2\.1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    await expect(decryptSecret(keyRing, encrypted)).resolves.toBe('github-app-private-key');
  });

  it('uses a fresh IV per encryption', async () => {
    const keyRing = await ring({ key: KEY });
    const first = await encryptSecret(keyRing, 'same');
    const second = await encryptSecret(keyRing, 'same');
    expect(first).not.toBe(second);
    await expect(decryptSecret(keyRing, first)).resolves.toBe('same');
    await expect(decryptSecret(keyRing, second)).resolves.toBe('same');
  });

  it('rejects a wrong key', async () => {
    const keyRing = await ring({ key: KEY });
    const wrongRing = await ring({ key: OTHER_KEY });
    const encrypted = await encryptSecret(keyRing, 'secret');
    await expect(decryptSecret(wrongRing, encrypted)).rejects.toThrow();
  });

  it('rejects tampered, malformed, and unknown-version input', async () => {
    const keyRing = await ring({ key: KEY });
    const encrypted = await encryptSecret(keyRing, 'secret');
    // Flip a character that always carries data bits — the final base64url character can be
    // mostly padding, in which case flipping it leaves the ciphertext unchanged (~25% of runs).
    const flipped = encrypted.at(-2) === 'A' ? 'B' : 'A';
    const tampered = `${encrypted.slice(0, -2)}${flipped}${encrypted.slice(-1)}`;
    await expect(decryptSecret(keyRing, tampered)).rejects.toThrow();
    await expect(decryptSecret(keyRing, 'not-a-secret')).rejects.toThrow();
    await expect(decryptSecret(keyRing, 'v2.a.b')).rejects.toThrow();
    await expect(
      decryptSecret(keyRing, 'v2.9.AAAAAAAAAAAAAAAA.AAAAAAAAAAAAAAAAAAAAAA'),
    ).rejects.toThrow('Unsupported secret format');
  });

  it('decrypts a legacy v1 value with the previous key', async () => {
    const previousKey = await importEncryptionKey(OTHER_KEY);
    const legacy = await encryptLegacyV1(previousKey, 'legacy-secret');
    const keyRing = await ring({
      key: KEY,
      version: '2',
      previousKey: OTHER_KEY,
      previousVersion: '1',
    });
    await expect(decryptSecret(keyRing, legacy)).resolves.toBe('legacy-secret');
  });

  it('decrypts a v2 value held under the previous version only while configured', async () => {
    const previousRing = await ring({ key: OTHER_KEY, version: '1' });
    const oldValue = await encryptSecret(previousRing, 'old-secret');
    expect(oldValue).toMatch(/^v2\.1\./);

    const rotated = await ring({
      key: KEY,
      version: '2',
      previousKey: OTHER_KEY,
      previousVersion: '1',
    });
    await expect(decryptSecret(rotated, oldValue)).resolves.toBe('old-secret');

    const withoutPrevious = await ring({ key: KEY, version: '2' });
    await expect(decryptSecret(withoutPrevious, oldValue)).rejects.toThrow(
      'Unsupported secret format',
    );
  });

  it('detects whether a ciphertext is current', async () => {
    const previousRing = await ring({ key: OTHER_KEY, version: '1' });
    const oldValue = await encryptSecret(previousRing, 'old-secret');
    const keyRing = await ring({
      key: KEY,
      version: '2',
      previousKey: OTHER_KEY,
      previousVersion: '1',
    });
    expect(isCurrentCiphertext(keyRing, oldValue)).toBe(false);
    expect(isCurrentCiphertext(keyRing, await encryptSecret(keyRing, 'fresh'))).toBe(true);
  });

  it('re-wraps only an out-of-date ciphertext, preserving the plaintext', async () => {
    const previousRing = await ring({ key: OTHER_KEY, version: '1' });
    const oldValue = await encryptSecret(previousRing, 'rotate-me');
    const keyRing = await ring({
      key: KEY,
      version: '2',
      previousKey: OTHER_KEY,
      previousVersion: '1',
    });

    const rewrapped = await reencryptSecret(keyRing, oldValue);
    expect(rewrapped).toMatch(/^v2\.2\./);
    if (rewrapped === null) {
      throw new Error('expected a re-wrapped ciphertext');
    }
    await expect(decryptSecret(keyRing, rewrapped)).resolves.toBe('rotate-me');

    const fresh = await encryptSecret(keyRing, 'rotate-me');
    expect(await reencryptSecret(keyRing, fresh)).toBeNull();
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

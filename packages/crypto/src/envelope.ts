// Envelope encryption (technical-approach §3.9; security.md §7): each secret gets its own random
// data key (DEK); the secret is sealed with the DEK, and the DEK is wrapped by the master key (KEK).
// Both use AES-256-GCM with a random 96-bit IV, from node:crypto only.
//
// Layout of `ciphertext` and `wrappedDek`: version (1 byte, 0x01) | IV (12) | tag (16) | data.
// - The DEK's additional data binds it to the KEK's key id.
// - The secret's additional data is the caller's context, for example `<org_id>/<kind>`, so a
//   ciphertext moved to another org or kind does not open.
// A different master key is `encryption_key_mismatch` (first-run-setup, recovery paths). A record
// that was changed, or opened with the wrong context, is a SecretIntegrityError.

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { type MasterKey, masterKeyBytes } from './master-key.ts';

const VERSION = 0x01;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const HEADER_BYTES = 1 + IV_BYTES + TAG_BYTES;
const DEK_BYTES = 32;

export interface SealedSecret {
  ciphertext: Buffer;
  wrappedDek: Buffer;
  /** The master key that wrapped the DEK (MasterKey.keyId). */
  keyId: string;
}

export class EncryptionKeyMismatchError extends Error {
  override name = 'EncryptionKeyMismatchError';
  readonly code = 'encryption_key_mismatch';
}

export class SecretIntegrityError extends Error {
  override name = 'SecretIntegrityError';
}

export function seal(key: MasterKey, plaintext: Buffer | string, context: string): SealedSecret {
  requireContext(context);
  const dek = randomBytes(DEK_BYTES);
  try {
    const data = typeof plaintext === 'string' ? Buffer.from(plaintext, 'utf8') : plaintext;
    return {
      ciphertext: encrypt(dek, data, secretAad(context)),
      wrappedDek: encrypt(masterKeyBytes(key), dek, dekAad(key.keyId)),
      keyId: key.keyId,
    };
  } finally {
    dek.fill(0);
  }
}

export function open(key: MasterKey, sealed: SealedSecret, context: string): Buffer {
  requireContext(context);
  if (sealed.keyId !== key.keyId) {
    throw new EncryptionKeyMismatchError(
      `The secret was wrapped by master key ${sealed.keyId}, not ${key.keyId}.`,
    );
  }
  let dek: Buffer;
  try {
    dek = decrypt(masterKeyBytes(key), sealed.wrappedDek, dekAad(key.keyId));
  } catch {
    // The key id matched, so the master key is right and the wrapped DEK was changed.
    throw new SecretIntegrityError('The wrapped data key does not verify.');
  }
  try {
    return decrypt(dek, sealed.ciphertext, secretAad(context));
  } catch {
    throw new SecretIntegrityError('The secret does not verify in this context.');
  } finally {
    dek.fill(0);
  }
}

function encrypt(key: Buffer, data: Buffer, aad: Buffer): Buffer {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(aad);
  const body = Buffer.concat([cipher.update(data), cipher.final()]);
  return Buffer.concat([Buffer.of(VERSION), iv, cipher.getAuthTag(), body]);
}

function decrypt(key: Buffer, sealed: Buffer, aad: Buffer): Buffer {
  if (sealed.length < HEADER_BYTES || sealed[0] !== VERSION) {
    throw new SecretIntegrityError('Unknown envelope format.');
  }
  const iv = sealed.subarray(1, 1 + IV_BYTES);
  const tag = sealed.subarray(1 + IV_BYTES, HEADER_BYTES);
  const decipher = createDecipheriv('aes-256-gcm', key, iv, { authTagLength: TAG_BYTES });
  decipher.setAAD(aad);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(sealed.subarray(HEADER_BYTES)), decipher.final()]);
}

function dekAad(keyId: string): Buffer {
  return Buffer.from(`jury-forge/dek/v1\0${keyId}`, 'utf8');
}

function secretAad(context: string): Buffer {
  return Buffer.from(`jury-forge/secret/v1\0${context}`, 'utf8');
}

function requireContext(context: string): void {
  if (typeof context !== 'string' || context === '') {
    throw new TypeError('A secret needs a context, for example `<org_id>/<kind>`.');
  }
}

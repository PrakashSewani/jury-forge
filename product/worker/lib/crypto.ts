const ENCRYPTION_KEY_BYTES = 32;
const IV_BYTES = 12;
const SECRET_FORMAT_VERSION = 'v2';
const LEGACY_SECRET_FORMAT_VERSION = 'v1';

export interface EncryptionKey {
  version: string;
  key: CryptoKey;
}

export interface EncryptionKeyRing {
  current: EncryptionKey;
  previous?: EncryptionKey;
}

export interface EncryptionKeyValues {
  key: string;
  version?: string;
  previousKey?: string;
  previousVersion?: string;
}

export const DEFAULT_KEY_VERSION = '1';
export const DEFAULT_PREVIOUS_KEY_VERSION = '0';

export async function importEncryptionKey(encoded: string): Promise<CryptoKey> {
  let raw: Uint8Array;
  try {
    raw = fromBase64Url(encoded);
  } catch {
    throw new Error('ENCRYPTION_KEY is not valid base64');
  }
  if (raw.length !== ENCRYPTION_KEY_BYTES) {
    throw new Error('ENCRYPTION_KEY must decode to 32 bytes');
  }
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

/** Builds the ring values from the Worker environment; null when ENCRYPTION_KEY is unset. */
export function keyRingValues(env: {
  ENCRYPTION_KEY?: string;
  ENCRYPTION_KEY_VERSION?: string;
  ENCRYPTION_KEY_PREVIOUS?: string;
  ENCRYPTION_KEY_PREVIOUS_VERSION?: string;
}): EncryptionKeyValues | null {
  if (!env.ENCRYPTION_KEY) {
    return null;
  }
  return {
    key: env.ENCRYPTION_KEY,
    version: env.ENCRYPTION_KEY_VERSION,
    previousKey: env.ENCRYPTION_KEY_PREVIOUS,
    previousVersion: env.ENCRYPTION_KEY_PREVIOUS_VERSION,
  };
}

export async function loadKeyRing(values: EncryptionKeyValues): Promise<EncryptionKeyRing> {
  const ring: EncryptionKeyRing = {
    current: {
      version: keyVersionLabel(values.version, DEFAULT_KEY_VERSION),
      key: await importEncryptionKey(values.key),
    },
  };
  if (values.previousKey) {
    ring.previous = {
      version: keyVersionLabel(values.previousVersion, DEFAULT_PREVIOUS_KEY_VERSION),
      key: await importEncryptionKey(values.previousKey),
    };
  }
  return ring;
}

/** v2.<keyVersion>.<iv>.<ciphertext>, always with the ring's current key. */
export async function encryptSecret(ring: EncryptionKeyRing, plaintext: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    ring.current.key,
    new TextEncoder().encode(plaintext),
  );
  return [
    SECRET_FORMAT_VERSION,
    ring.current.version,
    toBase64Url(iv),
    toBase64Url(new Uint8Array(ciphertext)),
  ].join('.');
}

/** Reads a v2 value with the key whose version matches, or a legacy v1 value with the current
 *  key first and the previous key second. Throws when nothing can read it. */
export async function decryptSecret(ring: EncryptionKeyRing, secret: string): Promise<string> {
  const parts = secret.split('.');
  if (parts.length === 4 && parts[0] === SECRET_FORMAT_VERSION) {
    const key = keyForVersion(ring, parts[1]);
    if (!key) {
      throw new Error('Unsupported secret format');
    }
    return decryptWith(key, parts[2], parts[3]);
  }
  if (parts.length === 3 && parts[0] === LEGACY_SECRET_FORMAT_VERSION) {
    try {
      return await decryptWith(ring.current.key, parts[1], parts[2]);
    } catch (error) {
      if (!ring.previous) {
        throw error;
      }
      return decryptWith(ring.previous.key, parts[1], parts[2]);
    }
  }
  throw new Error('Unsupported secret format');
}

/** True when `secret` is already written with the ring's current key version. */
export function isCurrentCiphertext(ring: EncryptionKeyRing, secret: string): boolean {
  const parts = secret.split('.');
  return (
    parts.length === 4 && parts[0] === SECRET_FORMAT_VERSION && parts[1] === ring.current.version
  );
}

/** The ciphertext re-wrapped with the current key when it is not current (a rotation), else null. */
export async function reencryptSecret(
  ring: EncryptionKeyRing,
  secret: string,
): Promise<string | null> {
  if (isCurrentCiphertext(ring, secret)) {
    return null;
  }
  return encryptSecret(ring, await decryptSecret(ring, secret));
}

function keyVersionLabel(value: string | undefined, fallback: string): string {
  return value === undefined || value === '' ? fallback : value;
}

function keyForVersion(ring: EncryptionKeyRing, version: string): CryptoKey | null {
  if (version === ring.current.version) {
    return ring.current.key;
  }
  if (ring.previous && version === ring.previous.version) {
    return ring.previous.key;
  }
  return null;
}

async function decryptWith(
  key: CryptoKey,
  ivPart: string,
  ciphertextPart: string,
): Promise<string> {
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64Url(ivPart) },
    key,
    fromBase64Url(ciphertextPart),
  );
  return new TextDecoder().decode(plaintext);
}

export function randomToken(byteLength = 32): string {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(byteLength)));
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = new Uint8Array(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)),
  );
  let hex = '';
  for (const byte of digest) {
    hex += byte.toString(16).padStart(2, '0');
  }
  return hex;
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

function fromBase64Url(value: string): Uint8Array {
  const base64 = value.replaceAll('-', '+').replaceAll('_', '/');
  const binary = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '='));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

export async function constantTimeEqual(left: string, right: string): Promise<boolean> {
  const [leftHash, rightHash] = await Promise.all([sha256Hex(left), sha256Hex(right)]);
  let mismatch = 0;
  for (let index = 0; index < leftHash.length; index += 1) {
    mismatch |= leftHash.charCodeAt(index) ^ rightHash.charCodeAt(index);
  }
  return mismatch === 0;
}

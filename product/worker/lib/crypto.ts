const ENCRYPTION_KEY_BYTES = 32;
const IV_BYTES = 12;
const SECRET_FORMAT_VERSION = 'v1';

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

export async function encryptSecret(key: CryptoKey, plaintext: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(plaintext),
  );
  return [SECRET_FORMAT_VERSION, toBase64Url(iv), toBase64Url(new Uint8Array(ciphertext))].join(
    '.',
  );
}

export async function decryptSecret(key: CryptoKey, secret: string): Promise<string> {
  const parts = secret.split('.');
  const [version, ivPart, ciphertextPart] = parts;
  if (parts.length !== 3 || version !== SECRET_FORMAT_VERSION) {
    throw new Error('Unsupported secret format');
  }
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

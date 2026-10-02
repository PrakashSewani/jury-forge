const algorithm = {
  name: 'RSASSA-PKCS1-v1_5',
  modulusLength: 2048,
  publicExponent: new Uint8Array([1, 0, 1]),
  hash: 'SHA-256',
};

const generated = await crypto.subtle.generateKey(algorithm, true, ['sign', 'verify']);
if (!('privateKey' in generated)) {
  throw new Error('expected an RSA key pair');
}

const exported = await crypto.subtle.exportKey('pkcs8', generated.privateKey);
if (!(exported instanceof ArrayBuffer)) {
  throw new Error('expected an ArrayBuffer key export');
}

export const testPrivateKeyPem = pemEncode(
  'RSA PRIVATE KEY',
  pkcs8ToPkcs1(new Uint8Array(exported)),
);

interface DerValue {
  start: number;
  end: number;
}

function derValue(bytes: Uint8Array, offset: number): DerValue {
  const first = bytes[offset + 1];
  let length: number;
  let next: number;
  if (first < 0x80) {
    length = first;
    next = offset + 2;
  } else {
    const count = first & 0x7f;
    length = 0;
    for (let index = 0; index < count; index += 1) {
      length = (length << 8) | bytes[offset + 2 + index];
    }
    next = offset + 2 + count;
  }
  return { start: next, end: next + length };
}

function pkcs8ToPkcs1(pkcs8: Uint8Array): Uint8Array {
  const outer = derValue(pkcs8, 0);
  const version = derValue(pkcs8, outer.start);
  const algorithm = derValue(pkcs8, version.end + 2);
  const key = derValue(pkcs8, algorithm.end + 2);
  return pkcs8.slice(key.start, key.end);
}

function pemEncode(label: string, der: Uint8Array): string {
  let binary = '';
  for (const byte of der) {
    binary += String.fromCharCode(byte);
  }
  const lines = btoa(binary).match(/.{1,64}/g) ?? [];
  return `-----BEGIN ${label}-----\n${lines.join('\n')}\n-----END ${label}-----`;
}

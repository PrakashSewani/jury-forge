export function normalizePrivateKeyPem(pem: string): string {
  if (pem.includes('-----BEGIN PRIVATE KEY-----')) {
    return pem;
  }
  if (pem.includes('-----BEGIN RSA PRIVATE KEY-----')) {
    return pemEncode('PRIVATE KEY', wrapPkcs1InPkcs8(pemDecode(pem)));
  }
  throw new Error('unsupported_private_key_format');
}

function pemDecode(pem: string): Uint8Array {
  const binary = atob(pem.replace(/-----[^-]+-----|\s+/g, ''));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function pemEncode(label: string, der: Uint8Array): string {
  let binary = '';
  for (const byte of der) {
    binary += String.fromCharCode(byte);
  }
  const lines = btoa(binary).match(/.{1,64}/g) ?? [];
  return `-----BEGIN ${label}-----\n${lines.join('\n')}\n-----END ${label}-----`;
}

function wrapPkcs1InPkcs8(pkcs1: Uint8Array): Uint8Array {
  const version = Uint8Array.from([0x02, 0x01, 0x00]);
  const algorithm = Uint8Array.from([
    0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01, 0x05, 0x00,
  ]);
  const body = concat(version, algorithm, derWrap(0x04, pkcs1));
  return derWrap(0x30, body);
}

function derWrap(tag: number, content: Uint8Array): Uint8Array {
  let header: Uint8Array;
  if (content.length < 0x80) {
    header = Uint8Array.from([tag, content.length]);
  } else if (content.length < 0x100) {
    header = Uint8Array.from([tag, 0x81, content.length]);
  } else {
    header = Uint8Array.from([tag, 0x82, content.length >> 8, content.length & 0xff]);
  }
  return concat(header, content);
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

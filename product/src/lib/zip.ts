/**
 * A deliberately small ZIP reader for pack uploads. It handles the two methods a folder archive
 * from macOS, Windows or GitHub actually uses — stored and deflate — and rejects everything that
 * would need more machinery (encryption, ZIP64, multi-disk). It never writes to disk: the entries
 * come back as text and the Worker validates them again.
 */

export interface ZipEntry {
  path: string;
  text: string;
}

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;
const MAX_ENTRIES = 2_000;
const MAX_ENTRY_BYTES = 10_000_000;
const MAX_TOTAL_BYTES = 10_000_000;
const EOCD_MIN = 22;
const EOCD_MAX_COMMENT = 0xffff;

const OS_JUNK = /(^|\/)(__MACOSX|\.DS_Store|Thumbs\.db)(\/|$)/i;

function hasControlCharacters(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 0x1f || code === 0x7f) {
      return true;
    }
  }
  return false;
}

function isSafePath(path: string): boolean {
  if (path === '' || path.length > 300 || path.startsWith('/') || /^[A-Za-z]:/.test(path)) {
    return false;
  }
  const segments = path.split('/');
  return !segments.some(
    (segment) =>
      segment === '' || segment === '.' || segment === '..' || hasControlCharacters(segment),
  );
}

let crcTable: Uint32Array | null = null;

function crc32(bytes: Uint8Array): number {
  if (crcTable === null) {
    crcTable = new Uint32Array(256);
    for (let index = 0; index < 256; index += 1) {
      let value = index;
      for (let bit = 0; bit < 8; bit += 1) {
        value = (value & 1) !== 0 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
      }
      crcTable[index] = value >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = (crcTable[(crc ^ byte) & 0xff] as number) ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data.slice()])
    .stream()
    .pipeThrough(new DecompressionStream('deflate-raw'));
  const output = await new Response(stream).arrayBuffer();
  return new Uint8Array(output);
}

/** Parse a zip archive into UTF-8 text entries. Throws a user-facing message on rejection. */
export async function readZipBytes(buffer: ArrayBuffer): Promise<ZipEntry[]> {
  const view = new DataView(buffer);
  if (view.byteLength < EOCD_MIN) {
    throw new Error('This file is not a ZIP archive.');
  }
  let eocd = -1;
  const stop = Math.max(0, view.byteLength - EOCD_MIN - EOCD_MAX_COMMENT);
  for (let offset = view.byteLength - EOCD_MIN; offset >= stop; offset -= 1) {
    if (view.getUint32(offset, true) === EOCD_SIGNATURE) {
      eocd = offset;
      break;
    }
  }
  if (eocd < 0) {
    throw new Error('This file is not a ZIP archive (no end-of-directory record).');
  }
  const disk = view.getUint16(eocd + 4, true);
  const centralDisk = view.getUint16(eocd + 6, true);
  const entriesOnDisk = view.getUint16(eocd + 8, true);
  const totalEntries = view.getUint16(eocd + 10, true);
  const centralSize = view.getUint32(eocd + 12, true);
  const centralOffset = view.getUint32(eocd + 16, true);
  if (disk !== 0 || centralDisk !== 0 || entriesOnDisk !== totalEntries) {
    throw new Error('Multi-disk ZIP archives are not supported.');
  }
  if (totalEntries === 0xffff || centralSize === 0xffffffff || centralOffset === 0xffffffff) {
    throw new Error('ZIP64 archives are not supported. Re-create the zip without ZIP64.');
  }
  if (totalEntries > MAX_ENTRIES) {
    throw new Error(`This zip has more than ${MAX_ENTRIES} entries.`);
  }
  if (centralOffset + centralSize > view.byteLength) {
    throw new Error('This zip is truncated or corrupt.');
  }

  const entries: ZipEntry[] = [];
  let offset = centralOffset;
  let totalBytes = 0;
  for (let index = 0; index < totalEntries; index += 1) {
    if (offset + 46 > view.byteLength || view.getUint32(offset, true) !== CENTRAL_SIGNATURE) {
      throw new Error('This zip has a corrupt central directory.');
    }
    const flags = view.getUint16(offset + 8, true);
    const method = view.getUint16(offset + 10, true);
    const crc = view.getUint32(offset + 16, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const uncompressedSize = view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);
    if ((flags & 0x1) !== 0) {
      throw new Error('Encrypted ZIP archives are not supported.');
    }
    if (
      compressedSize === 0xffffffff ||
      uncompressedSize === 0xffffffff ||
      localOffset === 0xffffffff
    ) {
      throw new Error('ZIP64 archives are not supported. Re-create the zip without ZIP64.');
    }
    if (method !== 0 && method !== 8) {
      throw new Error(`Compression method ${method} is not supported; use deflate or stored.`);
    }
    if (uncompressedSize > MAX_ENTRY_BYTES) {
      throw new Error('A file in this zip is too large for a knowledge pack.');
    }
    if (offset + 46 + nameLength + extraLength + commentLength > view.byteLength) {
      throw new Error('This zip has a corrupt central directory.');
    }
    const rawName = new TextDecoder().decode(new Uint8Array(buffer, offset + 46, nameLength));
    offset += 46 + nameLength + extraLength + commentLength;
    const name = rawName.replace(/\\/g, '/').replace(/^\.\//, '');
    if (name.endsWith('/') || name === '' || OS_JUNK.test(name)) {
      continue;
    }
    if (!isSafePath(name)) {
      throw new Error(`This zip contains an unsafe path: ${JSON.stringify(rawName)}.`);
    }
    if (
      localOffset + 30 > view.byteLength ||
      view.getUint32(localOffset, true) !== LOCAL_SIGNATURE
    ) {
      throw new Error('This zip has a corrupt local header.');
    }
    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    if (dataStart + compressedSize > view.byteLength) {
      throw new Error('This zip is truncated or corrupt.');
    }
    const compressed = new Uint8Array(buffer.slice(dataStart, dataStart + compressedSize));
    const bytes = method === 0 ? compressed : await inflateRaw(compressed);
    if (bytes.byteLength > MAX_ENTRY_BYTES) {
      throw new Error('A file in this zip is too large for a knowledge pack.');
    }
    if (crc32(bytes) !== crc) {
      throw new Error(`${name} is corrupt (CRC mismatch).`);
    }
    totalBytes += bytes.byteLength;
    if (totalBytes > MAX_TOTAL_BYTES) {
      throw new Error(`This zip expands to more than ${MAX_TOTAL_BYTES} bytes.`);
    }
    entries.push({ path: name, text: new TextDecoder().decode(bytes) });
  }
  return entries;
}

import { describe, expect, it } from 'vitest';
import { extractFolder, extractZip } from '../src/lib/pack-upload';
import { readZipBytes } from '../src/lib/zip';

interface Entry {
  name: string;
  text: string;
  method?: 0 | 8;
  flags?: number;
  crcOverride?: number;
  compressedOverride?: number;
  uncompressedOverride?: number;
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

async function deflate(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes.slice()])
    .stream()
    .pipeThrough(new CompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function u16(view: DataView, offset: number, value: number): void {
  view.setUint16(offset, value, true);
}

function u32(view: DataView, offset: number, value: number): void {
  view.setUint32(offset, value >>> 0, true);
}

/** Build a minimal stored/deflated zip so the reader is exercised against real bytes. */
async function makeZip(entries: Entry[]): Promise<ArrayBuffer> {
  const encoder = new TextEncoder();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    const raw = encoder.encode(entry.text);
    const method = entry.method ?? 0;
    const data = method === 8 ? await deflate(raw) : raw;
    const crc = entry.crcOverride ?? crc32(raw);
    const compressed = entry.compressedOverride ?? data.byteLength;
    const uncompressed = entry.uncompressedOverride ?? raw.byteLength;
    const flags = entry.flags ?? 0x0800;
    const local = new Uint8Array(30 + name.byteLength + data.byteLength);
    const localView = new DataView(local.buffer);
    u32(localView, 0, 0x04034b50);
    u16(localView, 4, 20);
    u16(localView, 6, flags);
    u16(localView, 8, method);
    u16(localView, 10, 0);
    u16(localView, 12, 0);
    u32(localView, 14, crc);
    u32(localView, 18, compressed);
    u32(localView, 22, uncompressed);
    u16(localView, 26, name.byteLength);
    u16(localView, 28, 0);
    local.set(name, 30);
    local.set(data, 30 + name.byteLength);
    localParts.push(local);

    const central = new Uint8Array(46 + name.byteLength);
    const centralView = new DataView(central.buffer);
    u32(centralView, 0, 0x02014b50);
    u16(centralView, 4, 20);
    u16(centralView, 6, 20);
    u16(centralView, 8, flags);
    u16(centralView, 10, method);
    u16(centralView, 12, 0);
    u16(centralView, 14, 0);
    u32(centralView, 16, crc);
    u32(centralView, 20, compressed);
    u32(centralView, 24, uncompressed);
    u16(centralView, 28, name.byteLength);
    u16(centralView, 30, 0);
    u16(centralView, 32, 0);
    u16(centralView, 34, 0);
    u16(centralView, 36, 0);
    u32(centralView, 38, 0);
    u32(centralView, 42, offset);
    central.set(name, 46);
    centralParts.push(central);
    offset += local.byteLength;
  }
  const centralSize = centralParts.reduce((sum, part) => sum + part.byteLength, 0);
  const eocd = new Uint8Array(22);
  const eocdView = new DataView(eocd.buffer);
  u32(eocdView, 0, 0x06054b50);
  u16(eocdView, 4, 0);
  u16(eocdView, 6, 0);
  u16(eocdView, 8, entries.length);
  u16(eocdView, 10, entries.length);
  u32(eocdView, 12, centralSize);
  u32(eocdView, 16, offset);
  u16(eocdView, 20, 0);
  const total = offset + centralSize + eocd.byteLength;
  const output = new Uint8Array(total);
  let cursor = 0;
  for (const part of [...localParts, ...centralParts, eocd]) {
    output.set(part, cursor);
    cursor += part.byteLength;
  }
  return output.buffer;
}

describe('zip reader', () => {
  it('reads stored and deflated entries and skips directories and OS junk', async () => {
    const buffer = await makeZip([
      { name: 'SKILL.md', text: 'manifest' },
      { name: 'docs/', text: '' },
      { name: 'docs/a.md', text: 'alpha', method: 8 },
      { name: '__MACOSX/._SKILL.md', text: 'junk' },
    ]);
    const entries = await readZipBytes(buffer);
    expect(entries).toEqual([
      { path: 'SKILL.md', text: 'manifest' },
      { path: 'docs/a.md', text: 'alpha' },
    ]);
  });

  it('rejects a corrupt CRC', async () => {
    const buffer = await makeZip([{ name: 'docs/a.md', text: 'alpha', crcOverride: 1 }]);
    await expect(readZipBytes(buffer)).rejects.toThrow('CRC mismatch');
  });

  it('rejects encrypted entries, unsupported methods and ZIP64 sizes', async () => {
    const encrypted = await makeZip([{ name: 'a.md', text: 'a', flags: 0x0801 }]);
    await expect(readZipBytes(encrypted)).rejects.toThrow('Encrypted');
    const unsupported = await makeZip([{ name: 'a.md', text: 'a', method: 12 as never }]);
    await expect(readZipBytes(unsupported)).rejects.toThrow('Compression method');
    const zip64 = await makeZip([{ name: 'a.md', text: 'a', uncompressedOverride: 0xffffffff }]);
    await expect(readZipBytes(zip64)).rejects.toThrow('ZIP64');
  });

  it('rejects unsafe paths and a file that is not a zip', async () => {
    const traversal = await makeZip([{ name: '../evil.md', text: 'x' }]);
    await expect(readZipBytes(traversal)).rejects.toThrow('unsafe path');
    await expect(readZipBytes(new Uint8Array([1, 2, 3]).buffer)).rejects.toThrow(
      'not a ZIP archive',
    );
  });
});

describe('pack extraction', () => {
  it('extracts a zip and filters binary and junk files', async () => {
    const buffer = await makeZip([
      { name: 'SKILL.md', text: '---\nname: X\ndescription: X.\n---\nBody.' },
      { name: 'docs/a.md', text: 'Alpha.' },
      { name: 'docs/logo.png', text: 'not text' },
    ]);
    const file = new File([buffer], 'pack.zip', { type: 'application/zip' });
    const extraction = await extractZip(file);
    expect(extraction.files.map((entry) => entry.path)).toEqual(['SKILL.md', 'docs/a.md']);
    expect(extraction.skipped).toContain('docs/logo.png');
  });

  it('reads folder files with their relative paths', async () => {
    const manifest = new File(['---\nname: X\ndescription: X.\n---\nBody.'], 'SKILL.md');
    const docs = new File(['Alpha.'], 'a.md');
    Object.defineProperty(docs, 'webkitRelativePath', { value: 'pack/docs/a.md' });
    const extraction = await extractFolder([manifest, docs] as unknown as FileList);
    expect(extraction.files.map((entry) => entry.path)).toEqual(['SKILL.md', 'pack/docs/a.md']);
  });
});

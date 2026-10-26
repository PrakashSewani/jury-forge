import { readZipBytes } from './zip';

export interface PackUploadFile {
  path: string;
  text: string;
}

export interface PackExtraction {
  files: PackUploadFile[];
  skipped: string[];
}

const MAX_FILE_BYTES = 1_000_000;
const MAX_TOTAL_BYTES = 2_000_000;
const MAX_FILES = 1_000;
const BINARY =
  /\.(png|jpe?g|gif|ico|webp|avif|bmp|tiff?|pdf|zip|tar|t?gz|bz2|xz|7z|rar|jar|war|class|exe|dll|dylib|so|wasm|bin|dat|db|sqlite|woff2?|ttf|otf|eot|mp[34]|m4[av]|mov|webm|wav|ogg|flac|psd|ai|sketch|fig)$/i;
const JUNK_DIRS = /(^|\/)(node_modules|\.git|dist|build|coverage|\.next|target|vendor)(\/|$)/i;
const OS_JUNK = /(^|\/)(__MACOSX|\.DS_Store|Thumbs\.db)(\/|$)/i;

function isIgnored(path: string): boolean {
  return JUNK_DIRS.test(path) || OS_JUNK.test(path);
}

function priority(path: string): number {
  if (/(^|\/)SKILL\.md$/i.test(path)) return 0;
  if (/\.md$/i.test(path)) return 1;
  if (/(^|\/)docs\//.test(path)) return 2;
  return 3;
}

function collect(source: PackUploadFile[], initialSkipped: string[] = []): PackExtraction {
  const skipped: string[] = [...initialSkipped];
  const files: PackUploadFile[] = [];
  let total = 0;
  const ordered = [...source].sort((a, b) => priority(a.path) - priority(b.path));
  for (const file of ordered) {
    const path = file.path.replace(/\\/g, '/').replace(/^\.\//, '');
    if (isIgnored(path) || BINARY.test(path) || file.text.includes('\u0000')) {
      skipped.push(path);
      continue;
    }
    const size = new TextEncoder().encode(file.text).length;
    if (size > MAX_FILE_BYTES) {
      skipped.push(path);
      continue;
    }
    if (files.length >= MAX_FILES || total + size > MAX_TOTAL_BYTES) {
      skipped.push(path);
      continue;
    }
    files.push({ path, text: file.text });
    total += size;
  }
  return { files, skipped };
}

/** Read a folder selection (`webkitdirectory`) into text files, with the junk filtered out. */
export async function extractFolder(fileList: FileList): Promise<PackExtraction> {
  const source: PackUploadFile[] = [];
  const skipped: string[] = [];
  for (const file of Array.from(fileList)) {
    const path = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
    if (isIgnored(path) || BINARY.test(path)) {
      skipped.push(path);
      continue;
    }
    if (file.size > MAX_FILE_BYTES) {
      skipped.push(path);
      continue;
    }
    source.push({ path, text: await file.text() });
  }
  return collect(source, skipped);
}

/** Read a zip file into text entries, then apply the same client-side caps. */
export async function extractZip(file: File): Promise<PackExtraction> {
  const entries = await readZipBytes(await file.arrayBuffer());
  return collect(entries);
}

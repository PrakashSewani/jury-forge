import type { PackCreateResult, PackPreview } from '@jury-forge/shared';
import type { ChangeEvent } from 'react';
import { useEffect, useState } from 'react';
import { createPack, previewPack } from '../lib/api';
import { formatBytes, shortSha } from '../lib/format';
import type { PackExtraction, PackUploadFile } from '../lib/pack-upload';
import { extractFolder, extractZip } from '../lib/pack-upload';
import { Badge, Button, buttonClass, cx, Dialog, focusRing, Notice, Select, Table } from '../ui';
import { errorMessage } from './messages';

const fileLabel = cx(buttonClass, 'cursor-pointer');
const radio = cx('m-0 size-4 cursor-pointer accent-accent', focusRing);

/**
 * One upload flow for both new packs and new versions: the browser extracts, the Worker previews,
 * and only then does `POST /api/packs` store an immutable version. The preview is mandatory so the
 * operator sees the manifest, hash, drops and the latest-always effect before it reaches a run.
 */
export function PackUploadDialog({
  open,
  onClose,
  onCreated,
  packId,
  packSlug,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (result: PackCreateResult) => void;
  packId?: string;
  packSlug?: string;
}) {
  const [files, setFiles] = useState<PackUploadFile[]>([]);
  const [skipped, setSkipped] = useState<string[]>([]);
  const [sourceName, setSourceName] = useState('');
  const [root, setRoot] = useState<string | undefined>(undefined);
  const [preview, setPreview] = useState<PackPreview | null>(null);
  const [forceNew, setForceNew] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    setFiles([]);
    setSkipped([]);
    setSourceName('');
    setRoot(undefined);
    setPreview(null);
    setForceNew(false);
    setBusy(false);
    setError(null);
  }, [open, packId]);

  async function runPreview(
    nextFiles: PackUploadFile[],
    nextRoot: string | undefined,
    nextForceNew: boolean,
  ): Promise<void> {
    if (nextFiles.length === 0) {
      setPreview(null);
      setError('No text files were found in that upload.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await previewPack({
        files: nextFiles,
        ...(nextRoot !== undefined ? { root: nextRoot } : {}),
        ...(packId !== undefined ? { packId } : {}),
        ...(nextForceNew ? { forceNew: true } : {}),
      });
      setPreview(result);
    } catch (caught) {
      setPreview(null);
      setError(errorMessage(caught, 'Could not read that pack. Check the files and try again.'));
    } finally {
      setBusy(false);
    }
  }

  async function acceptExtraction(extraction: PackExtraction, name: string): Promise<void> {
    setSourceName(name);
    setFiles(extraction.files);
    setSkipped(extraction.skipped);
    setRoot(undefined);
    setPreview(null);
    await runPreview(extraction.files, undefined, forceNew);
  }

  async function handleFolder(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const list = event.target.files;
    if (!list || list.length === 0) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const extraction = await extractFolder(list);
      event.target.value = '';
      await acceptExtraction(extraction, 'Folder');
    } catch (caught) {
      event.target.value = '';
      setError(errorMessage(caught, 'That folder could not be read.'));
      setBusy(false);
    }
  }

  async function handleZip(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await acceptExtraction(await extractZip(file), file.name);
    } catch (caught) {
      setError(errorMessage(caught, 'That zip could not be read.'));
      setBusy(false);
    }
  }

  async function changeRoot(value: string): Promise<void> {
    setRoot(value);
    await runPreview(files, value, forceNew);
  }

  async function changeForceNew(value: boolean): Promise<void> {
    setForceNew(value);
    await runPreview(files, root, value);
  }

  async function handleCreate(): Promise<void> {
    if (preview === null || !preview.valid || busy) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await createPack({
        files,
        ...(root !== undefined ? { root } : {}),
        ...(packId !== undefined ? { packId } : {}),
        ...(forceNew ? { forceNew: true } : {}),
      });
      onCreated(result);
      onClose();
    } catch (caught) {
      setError(errorMessage(caught, 'Could not store the pack. Check the Worker and try again.'));
    } finally {
      setBusy(false);
    }
  }

  const choosingRoot = preview !== null && preview.candidates.length > 0;
  const existing = preview?.existingPack ?? null;

  return (
    <Dialog
      description="A SKILL.md manifest with YAML frontmatter plus a docs/ folder. The browser reads a folder or zip; the Worker validates and hashes it."
      onClose={() => {
        if (!busy) {
          onClose();
        }
      }}
      open={open}
      title={
        packId === undefined
          ? 'Add a knowledge pack'
          : `Upload a version of ${packSlug ?? 'this pack'}`
      }
    >
      <div className="mt-4 max-h-[65vh] space-y-4 overflow-y-auto pr-1">
        <Notice tone="info">
          Pack text is stored in this instance and sent to the configured model provider when a
          reviewer runs. List anything that must never leave the instance under
          <span className="font-mono"> never_quote</span>; those file contents are withheld.
        </Notice>

        <div className="flex flex-wrap gap-2">
          <label className={fileLabel}>
            Choose a folder
            <input
              className="sr-only"
              multiple
              onChange={(event) => void handleFolder(event)}
              type="file"
              {...({ webkitdirectory: '', directory: '' } as unknown as Record<string, string>)}
            />
          </label>
          <label className={fileLabel}>
            Choose a zip
            <input
              accept=".zip,application/zip"
              className="sr-only"
              onChange={(event) => void handleZip(event)}
              type="file"
            />
          </label>
          {sourceName !== '' ? (
            <span className="self-center text-sm text-text-muted">{sourceName}</span>
          ) : null}
        </div>

        {skipped.length > 0 ? (
          <Notice tone="info">
            Skipped {skipped.length} file(s) that are binary, too large, or outside the upload cap
            {skipped.length <= 3 ? `: ${skipped.join(', ')}` : '.'}
          </Notice>
        ) : null}

        {error ? <Notice tone="error">{error}</Notice> : null}

        {choosingRoot ? (
          <div className="rounded-card border border-border bg-surface-muted p-3">
            <p className="text-sm font-medium">This upload contains several packs.</p>
            <p className="mt-1 text-xs text-text-muted">
              Choose the root to import. One pack per upload in v1.
            </p>
            <Select
              className="mt-2"
              onChange={(event) => void changeRoot(event.target.value)}
              value={root ?? ''}
            >
              <option value="">Choose a pack…</option>
              {preview?.candidates.map((candidate) => (
                <option key={`${candidate.root}:${candidate.manifestPath}`} value={candidate.root}>
                  {candidate.name ?? candidate.root} — {candidate.root || 'upload root'}/
                  {candidate.manifestPath}
                </option>
              ))}
            </Select>
          </div>
        ) : null}

        {preview !== null && !preview.valid && !choosingRoot ? (
          <>
            <Notice tone="error">This upload is not a valid pack yet.</Notice>
            <ul className="list-disc space-y-1 pl-5 text-sm text-text-error">
              {preview.errors.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          </>
        ) : null}

        {preview !== null && preview.valid ? (
          <>
            <div className="rounded-card border border-border bg-surface-muted p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{preview.manifest?.name}</span>
                <Badge tone="neutral">{preview.manifest?.kind}</Badge>
                <span className="font-mono text-xs text-text-muted">
                  {preview.hash === null ? '' : `@${shortSha(preview.hash)}`}
                </span>
              </div>
              <p className="mt-1 text-sm text-text-body">{preview.manifest?.description}</p>
              <dl className="mt-2 grid gap-1 text-xs text-text-muted sm:grid-cols-2">
                <div>
                  <dt className="inline font-medium text-text-body">Owner: </dt>
                  <dd className="inline">{preview.manifest?.owner || '—'}</dd>
                </div>
                <div>
                  <dt className="inline font-medium text-text-body">Applies: </dt>
                  <dd className="inline">
                    {preview.manifest?.apply === 'paths'
                      ? (preview.manifest?.paths.join(', ') ?? '')
                      : 'always'}
                  </dd>
                </div>
                <div>
                  <dt className="inline font-medium text-text-body">never_quote: </dt>
                  <dd className="inline">
                    {preview.manifest?.neverQuote.length
                      ? preview.manifest.neverQuote.join(', ')
                      : 'none'}
                  </dd>
                </div>
                <div>
                  <dt className="inline font-medium text-text-body">Files: </dt>
                  <dd className="inline">
                    {preview.files.length} docs ·{' '}
                    {formatBytes(preview.files.reduce((sum, file) => sum + file.bytes, 0))}
                  </dd>
                </div>
              </dl>
            </div>

            {preview.files.length > 0 ? (
              <Table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border text-xs uppercase tracking-wide text-text-muted">
                    <th className="py-2 pr-4 font-medium">docs/ file</th>
                    <th className="py-2 pr-4 font-medium">Bytes</th>
                    <th className="py-2 pr-4 font-medium">Injection</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.files.map((file) => (
                    <tr className="border-b border-border last:border-0" key={file.path}>
                      <td className="py-1 pr-4 font-mono text-xs">{file.path}</td>
                      <td className="py-1 pr-4 text-xs">{formatBytes(file.bytes)}</td>
                      <td className="py-1 pr-4">
                        <Badge tone={file.neverQuote ? 'amber' : 'green'}>
                          {file.neverQuote ? 'withheld' : 'included'}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            ) : (
              <p className="text-sm text-text-muted">
                No docs/ files — only the manifest and its body will be injected.
              </p>
            )}

            {preview.ignoredCount > 0 ? (
              <p className="text-xs text-text-muted">
                {preview.ignoredCount} file(s) outside the manifest and docs/ subtree were ignored.
              </p>
            ) : null}

            {existing !== null && packId === undefined ? (
              <fieldset className="space-y-1 rounded-card border border-border p-3">
                <legend className="px-1 text-sm font-medium">
                  What should this upload become?
                </legend>
                <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
                  <input
                    checked={!forceNew}
                    className={radio}
                    name="pack-target"
                    onChange={() => void changeForceNew(false)}
                    type="radio"
                  />
                  A new version of {existing.slug}
                </label>
                <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
                  <input
                    checked={forceNew}
                    className={radio}
                    name="pack-target"
                    onChange={() => void changeForceNew(true)}
                    type="radio"
                  />
                  A separate pack
                </label>
                <p className="text-xs text-text-muted">
                  {forceNew
                    ? 'A separate pack is stored with a suffixed slug; the existing pack and its grants are untouched.'
                    : 'A new version is used by every existing grant immediately, and every run records the new hash.'}
                </p>
              </fieldset>
            ) : null}

            {packId !== undefined ? (
              <Notice tone="info">
                This becomes a new immutable version of {packSlug ?? 'this pack'}; existing grants
                use it immediately.
              </Notice>
            ) : null}

            {preview.warnings.length > 0 ? (
              <>
                <Notice tone="info">Preview notes</Notice>
                <ul className="list-disc space-y-1 pl-5 text-sm text-text-muted">
                  {preview.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              </>
            ) : null}
          </>
        ) : null}

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border pt-3">
          <Button disabled={busy} onClick={onClose} variant="secondary">
            Cancel
          </Button>
          <Button
            busy={busy}
            disabled={preview === null || !preview.valid || choosingRoot}
            onClick={() => void handleCreate()}
          >
            {packId === undefined ? 'Store pack' : 'Store version'}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

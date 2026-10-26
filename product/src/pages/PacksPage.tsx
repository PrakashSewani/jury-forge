import type { PackSummary } from '@jury-forge/shared';
import { PackSummarySchema } from '@jury-forge/shared';
import { useCallback, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';
import { listPacks } from '../lib/api';
import { formatBytes, formatRelativeTime, shortSha } from '../lib/format';
import { handleAppLink, navigate } from '../lib/router';
import { useResource } from '../lib/use-resource';
import {
  Badge,
  Button,
  Card,
  cx,
  EmptyState,
  Field,
  focusRing,
  Input,
  Row,
  Table,
  tapTarget,
} from '../ui';
import { PackUploadDialog } from './PackUploadDialog';
import { PageError, PageLoading } from './screen-state';

const PacksSchema = z.array(PackSummarySchema);

function matches(pack: PackSummary, term: string): boolean {
  if (term === '') {
    return true;
  }
  const needle = term.toLowerCase();
  return [
    pack.name,
    pack.slug,
    pack.latest.manifest.description,
    pack.latest.manifest.kind,
    pack.latest.manifest.owner,
  ]
    .join(' ')
    .toLowerCase()
    .includes(needle);
}

export default function PacksPage() {
  const load = useCallback((signal: AbortSignal) => listPacks(signal), []);
  const { data, failed, reload } = useResource(PacksSchema, load);
  const [term, setTerm] = useState('');
  const [uploadOpen, setUploadOpen] = useState(false);

  const filtered = useMemo(
    () => (data ?? []).filter((pack) => matches(pack, term.trim())),
    [data, term],
  );

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Knowledge packs</h1>
          <p className="mt-1 max-w-2xl text-sm text-text-muted">
            Shared team knowledge, uploaded as a <span className="font-mono">SKILL.md</span>{' '}
            manifest plus <span className="font-mono">docs/</span> files. Every distinct upload is
            an immutable version; grants decide which reviewers receive it.
          </p>
        </div>
        <Button onClick={() => setUploadOpen(true)}>Add a pack</Button>
      </header>

      {failed ? (
        <PageError
          message="The knowledge packs could not be loaded. Check the Worker and try again."
          onRetry={reload}
        />
      ) : data === null ? (
        <PageLoading />
      ) : data.length === 0 ? (
        <EmptyState
          action={<Button onClick={() => setUploadOpen(true)}>Add a pack</Button>}
          description="Upload a folder or zip with a SKILL.md manifest at its root and a docs/ folder beside it. A .claude/skills/<name>/ folder or a .github/agents/<name>.md file works as-is."
          title="No knowledge packs yet"
        />
      ) : (
        <>
          <Field className="max-w-md" label="Search packs">
            <Input
              onChange={(event) => setTerm(event.target.value)}
              placeholder="Name, slug, kind, owner, or description"
              type="search"
              value={term}
            />
          </Field>

          {filtered.length === 0 ? (
            <EmptyState
              action={
                <Button onClick={() => setTerm('')} variant="secondary">
                  Clear search
                </Button>
              }
              description={`Nothing matches “${term.trim()}”.`}
              title="No matching packs"
            />
          ) : (
            <Card>
              <Table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border text-xs uppercase tracking-wide text-text-muted">
                    <th className="py-2 pr-4 font-medium">Pack</th>
                    <th className="py-2 pr-4 font-medium">Latest version</th>
                    <th className="py-2 pr-4 font-medium">Size</th>
                    <th className="py-2 pr-4 font-medium">Grants</th>
                    <th className="py-2 pr-4 font-medium">Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((pack) => (
                    <Row className="border-b border-border last:border-0" key={pack.id}>
                      <td className="py-3 pr-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <a
                            className={cx('font-medium hover:underline', tapTarget, focusRing)}
                            href={`/packs/${encodeURIComponent(pack.id)}`}
                            onClick={handleAppLink}
                          >
                            {pack.name}
                          </a>
                          <Badge tone="neutral">{pack.latest.manifest.kind}</Badge>
                        </div>
                        <p className="mt-1 font-mono text-xs text-text-muted">{pack.slug}</p>
                        <p className="mt-1 line-clamp-2 max-w-xl text-xs text-text-muted">
                          {pack.latest.manifest.description}
                        </p>
                      </td>
                      <td className="py-3 pr-4 align-top">
                        <span className="font-mono text-xs" title={pack.latest.hash}>
                          @{shortSha(pack.latest.hash)}
                        </span>
                        <p className="mt-1 text-xs text-text-muted">
                          {pack.latest.fileCount} docs · {formatRelativeTime(pack.latest.createdAt)}
                        </p>
                      </td>
                      <td className="py-3 pr-4 align-top text-xs">
                        {formatBytes(pack.latest.totalBytes)}
                      </td>
                      <td className="py-3 pr-4 align-top text-xs">{pack.grantCount}</td>
                      <td className="py-3 pr-4 align-top text-xs text-text-muted">
                        {formatRelativeTime(pack.updatedAt)}
                      </td>
                    </Row>
                  ))}
                </tbody>
              </Table>
            </Card>
          )}
        </>
      )}

      <PackUploadDialog
        onClose={() => setUploadOpen(false)}
        onCreated={(result) => {
          toast.success(`Stored ${result.pack.slug}@${shortSha(result.version.hash)}`);
          void reload().then(() => navigate(`/packs/${encodeURIComponent(result.pack.id)}`));
        }}
        open={uploadOpen}
      />
    </div>
  );
}

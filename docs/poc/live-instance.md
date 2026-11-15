# Live instance study

**Instance:** `https://jury.prakashsewani.com`
**Studied:** 2026-11-14/15, read-only.
**PoC commit:** `1cc22b7` (the live deployment was built from the same line of work).
**Method:** direct read-only D1 queries through the operator's authenticated Wrangler token, plus the
GitHub PR/review API for the one real review. No mutations were made. The dashboard itself was not
screenshotted because Cloudflare Access uses a Cloudflare OAuth login and the automated browser
failed its verification challenge; the state below is stronger evidence than a screenshot because
it is the database the UI renders.

## 1. Deployment facts

| Item | Value |
| ---- | ----- |
| Public URL | `https://jury.prakashsewani.com` |
| Cloudflare account | `Adamjones2227@gmail.com's Account` (`000afe715cc70b6ac2ab07ef9babf6e8`) |
| Zone | `prakashsewani.com` (`a04314209523aabcf9119bfee7c42381`) |
| Worker | `jury-forge` |
| D1 database | `jury-forge` (`7eeae477-07f6-41e0-89f8-e891eba8979d`) |
| Access team domain | `steep-bonus-5bb2.cloudflareaccess.com` |
| Access IdP | “Sign in with Cloudflare” (Cloudflare OAuth) |
| GitHub App | `jury-forge`, app id `5377842` |
| Installation | `172948418`, account `PrakashSewani` (user) |
| Owner | `PrakashSewani` (`81285705`) |
| Claimed at | 2026-10-19 07:52:41 UTC |

The Access configuration could not be read through the Wrangler OAuth token: `access/apps`
returned an empty list and `access/organizations` returned 403, so the Access app/policy lives
behind a permission the local token does not have (or in another Zero Trust context). This is a
tooling limitation, not a product finding.

## 2. Current state

| Table | Count / state |
| ----- | ------------- |
| `reviewers` | **0** |
| `repositories` | **47 synced, 0 enabled** |
| `instance_settings` | **0 rows** (defaults apply) |
| `packs` / `pack_versions` / `pack_grants` | **0 / 0 / 0** |
| `runs` | **25** — 23 auto `skipped`, 1 auto `completed`, 1 manual `completed` |
| `run_reviewers` | **3** rows (one failed, two completed across two runs) |
| `sessions` | 1 (expires 2026-11-21; the owner's current session) |
| `activity_log` | 40 entries |
| `webhook_deliveries` | 3 recent (older rows pruned) |

The instance is **claimed and installed, but effectively unconfigured**: every recent run is
`skipped` because no repository is enabled and no reviewer exists. The dashboard readiness should
therefore read **3 of 5** (claim, install, first run done; enable repository and add a reviewer
pending) with **Enable a repository** as the next step. The current state is the shell of the PoC,
not a running jury.

## 3. Timeline

| UTC time | Event |
| -------- | ----- |
| 2026-10-19 07:52:18 | GitHub App credentials stored (`github_app`). |
| 2026-10-19 07:52:41 | Instance claimed by `PrakashSewani`. |
| 08:12–08:22 | Webhooks for `jury-forge` #22/#23; no enabled repo/reviewer, so skipped. |
| 08:26:15 | `jury-forge-guinea-pig` enabled. |
| 08:27:27 / 08:27:58 | Reviewers `Security` and `Testing` created. |
| 08:28:11 | Both reviewers enabled on the guinea-pig repository. |
| 08:44:08 | Auto run for guinea-pig PR #3 at `152fef6`. |
| 08:44:53 | Auto run completes; one review posted; `Testing` failed with `openai provider responded with status 401`. |
| 08:46:01 | `Security` updated (among other fields, key reused from another reviewer). |
| 08:47:13 | `Testing` updated. |
| 08:47:30 | Manual try run for the same PR/SHA with `Testing`. |
| 08:48:14 | Manual run completes; 9 findings; nothing posted. |
| 2026-10-25 12:19:29 / 12:19:33 | `Testing` and `Security` deleted. |
| 2026-10-25 12:19:42 | Guinea-pig repository disabled. |
| 2026-11-14 16:58–18:30 | Webhooks from the new `jury-forge` docs PR #1; all runs skipped (no reviewers/repos enabled). |

The sequence is a complete use of the intended workflow: install → create reviewers → enable a
repo → receive an auto review → fix a provider/key problem → use **Try a reviewer** to re-run the
failed one → inspect the result. Then the operator tore the configuration down.

## 4. The only real auto review

**Run:** `1425153530:3:152fef6b1e79a8b7421d53d6f1709d41fc2206a7:3e8cb680-cb99-11f1-9bfa-0440904fa566`
**PR:** `PrakashSewani/jury-forge-guinea-pig#3` — “feat(exports): signed download links, the nightly
sweep, and a partner schema fetch”
**Review:** https://github.com/PrakashSewani/jury-forge-guinea-pig/pull/3#pullrequestreview-5568976034
**Duration:** 45 seconds (08:44:08 → 08:44:53).
**Reviewers:** 2 enabled. One completed (security-focused, 8 findings); one failed (`Testing`,
`openai provider responded with status 401`). The body states “2 reviewer(s) ran … 8 finding(s): 8
inline” and notes the failed reviewer.

**Usage (completed reviewer):** 2,306 prompt tokens, 5,802 completion tokens, 8,108 total.
**Review shape:** one `COMMENTED` review; 8 inline comments, 0 summary-only findings; per-reviewer
attribution; a failure note for `Testing`.

### Verified findings

All eight findings in the posted review were checked against the PR's code at `152fef6`:

| # | File:line | Finding | Verdict |
| - | --------- | ------- | ------- |
| 1 | `src/admin/sweep.ts:16` | `x-owner-id` interpolated into `execSync('find …')` — command injection | **Valid.** `sweepForCaller` passes the header into `sweepExports`, which interpolates it into a shell string. |
| 2 | `src/server.ts:57` | `POST /admin/sweep` performs work without authorization; `isAdmin` unused | **Valid.** The route calls `sweepForCaller` directly; `isAdmin` is never called. |
| 3 | `src/security/export-link.ts:23` | `fetchRemoteSchema` is an unrestricted SSRF | **Valid.** Raw `fetch(url)` with no scheme/host/IP check. |
| 4 | `src/security/export-link.ts:32` | Path traversal in `writeExportFile` | **Valid.** `name` is concatenated into the path with no sanitisation. |
| 5 | `src/server.ts:49` | `GET /exports/link` mints links without authz | **Valid.** `reportId`/`userId` come straight from the query string. |
| 6 | `src/security/export-link.ts:12` | Unkeyed MD5 “signature”; `verifyExportLink` accepts empty/partial keys | **Valid.** `EXPORT_SIGNING_KEY` is unused; `String.includes('')` is true. |
| 7 | `src/server.ts:61` | Signing key written into error responses and messages | **Valid.** The 500 body returns a key-like literal; `fetchRemoteSchema` embeds it in an error. The finding's “needed to forge export links” wording is slightly off because the link signature is unkeyed, but the leak is real. |
| 8 | `test/reports.test.ts:17` | Test weakened: no SQL/param assertions, only a truthy title | **Valid.** The patch removes the `owner_id = $1` and bound-parameter assertions. |

The security review's summary was also accurate: command injection, SSRF, path traversal, unkeyed
links, missing authz, and a secret echoed to clients. This is a genuinely strong first review.

### What it missed — and why

The PR also leaves a more direct key leak and SQL injection outside the changed hunks:

- `src/server.ts:78` returns `key: signingKey()` from `/reports/export`.
- `src/exporter.ts:32/40` and `src/export/job.ts:22/54` interpolate `userId`, `since`, and
  `ownerId` into SQL strings.

None of those lines are in the PR patch. The reviewer only receives the changed-file patches (plus
optional literal reference paths), so it cannot see them. This is not a model miss inside its
context; it is the **diff-only context ceiling**. A code index or a reviewer reference context for
`src/server.ts` and `src/exporter.ts` would have surfaced them. This is the strongest live argument
for the target product's repository index and retrieval (F-044).

## 5. The manual try run

**Run:** `…:try-46f5948a-d962-4700-9246-01e5a102d797`
**Reviewer:** the same `Testing` ID that failed in the auto run.
**Duration:** 44 seconds.
**Usage:** 2,296 prompt tokens, 7,428 completion tokens, 9,724 total.
**Published:** nothing (manual mode), as designed.

It produced 9 findings: 4 errors, 3 warnings, 2 info. They are test-quality findings plus repeats of
four security findings:

- `test/reports.test.ts` — dropped scoping/binding assertions (valid).
- `test/security.test.ts` — schema test asserts nothing and swallows errors (valid).
- `test/security.test.ts` — “link changes” never asserts the links differ (valid).
- `test/security.test.ts` — skipped allowlist test leaves SSRF uncovered (valid).
- `src/security/export-link.ts` — `verifyExportLink` accepts any prefix/empty key (valid; repeats
  Security finding 6).
- `src/server.ts` — `/admin/sweep` does not enforce `x-admin` (valid; repeats Security finding 2).
- `src/server.ts` — sweep error leaks the signing key (valid; repeats Security finding 7).
- `src/security/export-link.ts` — `writeExportFile` unsanitized/no test (valid; repeats Security
  finding 4).
- `test/security.test.ts` — test named “32 character key” asserts 12 (valid).

The manual run proves the try-run path works and was used exactly as intended: the operator fixed the
provider/key issue and re-ran the failed reviewer without publishing anything. It also demonstrates
the role-overlap problem: a Testing reviewer re-reported four Security findings, so a two-reviewer
automatic run would have duplicated them in the same review.

## 6. What this live evidence validates

| Claim | Evidence |
| ----- | -------- |
| The end-to-end loop works | Claim → GitHub App → installation → reviewers → enabled repo → webhook → one posted review. |
| One consolidated review, inline comments | 8 inline comments on one `COMMENTED` review, per-reviewer attribution. |
| Failure is visible | The body names `Testing` and the provider 401. |
| Try-a-reviewer works and publishes nothing | Manual run completed with 9 findings, `review_url` null. |
| Readiness is computed from state | Current DB state implies 3/5 with “Enable a repository” next. |
| Providers are not retried | The Testing reviewer failed once with 401; the operator had to update it and run manually. |
| Role overlap causes duplicates | Testing repeated 4 Security findings. |
| Run history loses attribution | Reviewers were deleted; `run_reviewers` retains only UUIDs and outcomes, so the model, name, and prompt behind the only real review cannot be reconstructed. |
| Diff-only context bounds recall | Critical code at `src/server.ts:78` and `src/exporter.ts` was outside the patch and never reviewed. |
| The product can produce useful findings | All 8 auto findings and all 9 manual findings are valid against the code, including serious security issues. |

## 7. What it does not validate

- A fully successful multi-reviewer auto run (one reviewer failed).
- Knowledge packs, path scope, or reference context (none configured).
- The D-033 UI rework or D-034 knowledge-pack screens (the live database has no packs; the run
  records predate those features).
- Multi-user access, roles, or audit at team scale.
- Load, queue behavior, provider rate limits, or cost controls.
- The current dashboard UI (Access blocked the automated browser; the state is reconstructed from
  D1).

## 8. Current readiness calculation

From the live database on 2026-11-15:

| Step | Status | Reason |
| ---- | ------ | ------ |
| Claim the instance | done | `claimed_at` set |
| Install the GitHub App | done | `installation_id` set |
| Enable a repository | pending | 47 repositories, 0 enabled |
| Add a reviewer with a model key | pending | 0 reviewers |
| See the first run | done | one completed auto run (and one manual) |

`completed = 3`, `total = 5`, `nextStep = enable-repo`. The fifth step remains done even though no
reviewer exists now, because it records historical completion, not current capability. That is the
documented D-028 behavior, and it produces a slightly odd sequence: the operator can be told to
enable a repository while no reviewer exists, which will only produce `skipped` runs until a
reviewer is added. The target product should make the checklist state-aware (“enable a repo **and** have a
reviewer”) or show the dependency explicitly.

## 9. Evidence captured

Outside this repository, under `D:\Projects\jury-forge-live-probe\live\`:

- `instance_meta.json`, `github_app.json` (non-secret columns), `reviewers.json`, `repositories.json`
- `runs.json`, `completed_runs.json`, `completed_run_reviewers.json`
- `runs_by_status.json`, `repos_counts.json`, `reviewers_count.json`, `run_reviewers_count.json`
- `activity_recent.json`, `activity_early.json`, `webhook_count.json`, `settings.json`
- `pr3-files.json`, `pr3-reviews.json`, `pr3-comments.json`

The PR code is checked out at `D:\Projects\jury-forge-guinea-pig-ref` at `152fef6`.

**Privacy:** no provider keys, session tokens, session hashes, or encrypted secrets were read or
recorded. The only key-like value in the findings is the guinea pig's planted
`sk_test_PLANTED_not_a_real_key_0000`, which is not a real credential. The live instance's
`github_app` was read only as non-secret identity columns.

## 10. What to do with this

1. Treat the 8+9 verified findings as the **first quality baseline**, not a benchmark: one PR, one
   model mix, one reviewer pair. Expand to a labelled set before claiming precision/recall.
2. Add **full-file/reference context** for security-sensitive files; diff-only review cannot see
   `server.ts:78` or `exporter.ts`.
3. Add **provider retry/backoff** and a clear configuration error so a 401 does not silently remove
   a reviewer from the auto review.
4. Add **cross-reviewer dedup and role boundaries** so Testing does not re-report Security findings.
5. Snapshot reviewer identity/model/prompt in `run_reviewers` (F-025); the live instance cannot
   explain its only review after the reviewers were deleted.
6. Make readiness dependency-aware (a repo without a reviewer is not a useful next step).
7. Use this timeline as the acceptance scenario for the new product: install → two reviewers →
   enable a repo → auto review → failure → fix → try run → inspect → configure a real jury.

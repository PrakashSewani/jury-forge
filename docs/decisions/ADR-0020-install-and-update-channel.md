# ADR-0020: Install and update channel

- Status: accepted (Phase 1a, 2026-11-16): minisign-signed bundle, cosign-signed multi-arch images, SBOM + provenance, bash CLI wrapper; no pipe-to-shell (`technical-approach.md` §3.13, §18)
- Date: 2026-11-15
- Owners: operations + security
- Supersedes: —
- Revisit trigger: the first 10 installs, a package-manager request (apt/brew), or a signed-update
  mechanism that makes the script path unnecessary.

## Context

The install path is the product's first security decision: an operator who will trust Jury Forge
with private code judges it by how they obtain the bits. The current operations draft used
`curl … | sh`, which is fast, common, and unverifiable: the script can change between reads, runs
with the operator's privileges, and nothing ties it to a release digest. It also contradicts the
deployment contract (digest-pinned images, SBOM, provenance) and the "secure by default" principle.

We need one documented default and a supported update path that a security lead can approve.

## Options

1. **Git clone a pinned tag + Compose.** Reviewable, reproducible if the tag is signed, no
   pipe-to-shell. Downside: manual download, no version metadata beyond git.
2. **Release bundle + checksums, verified before extraction.** `jury-forge-vX.Y.Z.tar.gz` plus
   `.sha256` and a detached **minisign** signature; the operator verifies, then runs
   `jury-forge init`. No script execution from the network.
3. **Signed install script fetched and verified first.** `curl -O` the script, verify its signature,
   then execute it. Convenient, still a script, still a signing-key distribution problem.
4. **OS packages (apt/rpm/brew).** Best update ergonomics; high maintenance; packaging per distro.
5. **Container registry only, no bundle.** `docker compose` file shipped as an OCI artifact; no
   config generator. Weak for first-run secrets generation.

## Decision

Option 2 is the default: **release bundle + checksums + detached signature**, verified before
extraction. `jury-forge init` generates `.env` and secrets locally. Compose files and the CLI ship
inside the bundle, so a release is one signed artefact.

Option 1 (clone a signed tag) is the documented fallback for people who prefer git. Option 3 is
allowed only as an explicit, opt-in convenience that downloads, verifies (signature over the exact
bytes), then executes — never `curl | sh` in the docs. Options 4 and 5 are deferred.

Updates follow the same rule: `jury-forge upgrade` verifies the target release signature and image
digests before pulling.

## Consequences

**Easier:** reviewable install, reproducible releases, one artefact to sign, an auditable update
path, no TOFU script.

**Harder:** an extra verification step in the docs; signing-key distribution and rotation; users who
want one-liners need the explicit opt-in path.

**Constraints:** no release without a signature and checksums; the install docs never pipe a remote
script to a shell; the CLI refuses to upgrade to an unsigned release unless
`--allow-unsigned` is passed and that fact is audited/warned.

## Security and operations

- Signing keys are release-infrastructure secrets, rotated on a schedule; the public key is
  published in the repository and on the docs site.
- Checksums cover every file in the bundle; the signature covers the checksum file.
- Images are referenced by digest, not tag, in the shipped compose file.
- SBOM and provenance attestations ship with the release (Phase 4).
- An operator behind an air gap can verify offline with the published public key.
- Nothing about install requires a central service (AGENTS.md non-negotiable 5); the release host is
  a distribution channel, not a control plane.

## Evidence

- `docs/architecture/deployment.md` §4 (hardening), §8 (lifecycle).
- `docs/architecture/operations.md` §2 (install), §4 (upgrades).
- `docs/analysis/flaws.md` F-039/F-041 (deployment/secret handling), PoC release scripts.
- Supply-chain expectations in `docs/product/personas.md` (P2 security lead).

## Follow-ups

- **Signature tool: minisign** (decided default, owner 2026-11-15) for simple offline verification;
  publish the exact verification command and the public key.
- Add a release CI job that fails when a signature or checksum is missing.
- Provide `jury-forge verify --release <dir>` so the check is not a copy-pasted shell pipeline.
- Release hosting is **GitHub Releases** (`PrakashSewani/jury-forge`); no convenience endpoint or
  project domain is required. An operator's own domain (e.g. `jury.example.com`) is their instance
  origin, not a distribution channel.

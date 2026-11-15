# Install readiness: documentation dry run (2026-11-15)

- Status: **PRE-TEST. Installability remains unproven.** No runnable build exists, so no install
  timing was taken and no pass is claimed.
- Method: a documentation-only dry run of [`first-run-setup.md`](../product/specs/first-run-setup.md),
  [`deployment.md`](../architecture/deployment.md), and [`operations.md`](../architecture/operations.md),
  checked against the repository's contents.
- Owner question: can an operator reach a first review in ≤ 15 minutes on a clean Ubuntu 24.04 host
  using only the docs?

## Summary

1. **Question:** can a target operator reach a first review in ≤ 15 min on clean Ubuntu 24.04 using
   only the docs?
2. **Answer:** unproven. The docs cannot be followed end to end today. Three blockers stop the path
   before any test could run.
3. **Evidence:** the repository has no compose file, Caddyfile, `jury-forge` CLI, Dockerfile, release
   tag, signature, or public key (checked by file search). Every install command in
   `operations.md` depends on at least one of these.
4. **Blocker 1 (ordering):** the owner claim needs GitHub OAuth credentials, but the App that
   provides them is created later, in Stage 3. Only a manual-entry fallback breaks the cycle, and
   the docs do not say how to create that App by hand.
5. **Blocker 2 (TLS ordering):** origin validation needs Caddy's `ask` endpoint to authorize the
   candidate host, but `ask` only authorizes the already-configured origin, which does not yet exist.
6. **Blocker 3 (no artefacts):** no runnable release exists, so `jury-forge verify`, `init`, and
   `doctor` cannot be executed or tested.
7. **Likely defect:** the loopback setup listener is bound to `127.0.0.1` inside the container and
   published on the host, which Docker usually cannot reach. Verify with a build.
8. **Missing steps and prerequisites:** Docker installation, minisign, the migration step, `.env`
   and secrets file names, a default provider, and creating the test repository and PR.
9. **Clock:** "≤ 15 min" has no defined start and stop, and it contradicts `success.md`.
10. **Caveat:** this is a reading of the docs, not a test. It does not measure time, and it cannot
    say whether a real operator would succeed.

## 1. Environment

- Host: none provisioned. No clean Ubuntu 24.04 host was used.
- Repository state: branch `docs/poc-analysis-product-foundations`; no tags; no product code.
- Checks run: file search for compose files, Caddyfile, `*.minisig`, `*.pub`, Dockerfile, a CLI
  binary, and fixtures (none found outside `spikes/`); reading the cited lines.

## 2. Blockers (the path cannot be completed as written)

| # | Finding | Evidence | Needed fix |
| - | ------- | -------- | ---------- |
| B1 | **Circular dependency between Stage 2 and Stage 3.** Stage 2 claims the owner through GitHub OAuth. The OAuth credentials come from the App that Stage 3 creates through the manifest flow. The fallback (manual App entry) needs an App the operator already created, with no steps given. | [first-run-setup.md:145–153](../product/specs/first-run-setup.md) (Stage 2), [:163–165](../product/specs/first-run-setup.md) (Stage 3 manifest), [:153](../product/specs/first-run-setup.md) (manual entry) | Specify the order: create the App (manifest) before claim, with the App's OAuth client as the claim path; or write the manual App creation steps with the exact permissions and URLs. |
| B2 | **TLS validation needs an authorization that does not exist yet.** Stage 1.5 says Caddy issues on demand after `ask` authorizes the host. `ask` returns 200 only for the single configured origin. Until an origin is saved, nothing is configured, and `:443` has no certificate. The validation cannot pass at the point it is run. | [first-run-setup.md:132](../product/specs/first-run-setup.md) (TLS check), [:142](../product/specs/first-run-setup.md) (`:443` has no certificate), [deployment.md:312](../architecture/deployment.md) (`ask` returns 200 only for the configured origin), [deployment.md:71](../architecture/deployment.md) | Define a candidate-origin state that `ask` can authorize during validation and that is revoked on failure, or validate TLS from outside with a probe. |
| B3 | **No runnable artefact.** No compose file (the compose sketch says "illustrative, not the final file", [deployment.md:170](../architecture/deployment.md)), no `Caddyfile` (the Caddyfile is referenced but not shipped), no `jury-forge` CLI, no Dockerfile, no release, no minisign public key. Every install command depends on these. | Repository search; [operations.md:37–51](../architecture/operations.md) (`verify`, `init`, `docker compose up -d`, `doctor`); [ADR-0020](../decisions/ADR-0020-install-and-update-channel.md) follow-ups (`verify`, public key not yet published) | Expected at this phase. Not a doc defect, but it means the install test cannot run before a build exists. |

## 3. Likely defects (verify with a build)

| # | Finding | Evidence | Note |
| - | ------- | -------- | ---- |
| D1 | **Loopback bootstrap listener is unlikely to be reachable from the host.** The app sets `SETUP_BIND: 127.0.0.1:8080` inside the container, and Compose publishes `127.0.0.1:8080:8080`. Docker forwards published ports to the container's network address, not its loopback, so a listener bound to `127.0.0.1` inside the container is typically not reached. The app also `expose`s port 3000 and proxies to `app:3000`, while setup is on 8080. | [deployment.md:195](../architecture/deployment.md), [:204–205](../architecture/deployment.md), [Caddyfile `reverse_proxy app:3000`](../architecture/deployment.md) | Likely defect; the fix is probably binding `0.0.0.0` inside the container with host-only publishing. The security property (not public) must hold either way. Confirm with a build. |

## 4. Ambiguities and missing prerequisites

| # | Step | What is missing or ambiguous | Evidence |
| - | ---- | ---------------------------- | -------- |
| A1 | Host prerequisites | The docs assume Docker 24+ and Compose v2 are installed. They give no install steps for Ubuntu 24.04 and defer the check to `doctor`, which needs Postgres and the app to be up. | [operations.md:12](../architecture/operations.md), [first-run-setup.md:376](../product/specs/first-run-setup.md) (SU-06) |
| A2 | Verify the release | `minisign` is not installed or named as a prerequisite. The public key location is "the repository and the docs site", but no key is in the repository and no docs site exists. The release URLs use the `vX.Y.Z` placeholder, and no tag exists. | [ADR-0020:25](../decisions/ADR-0020-install-and-update-channel.md), [:60](../decisions/ADR-0020-install-and-update-channel.md), [operations.md:31–37](../architecture/operations.md) |
| A3 | `.env` and secrets | `init` writes `secrets/*` files, but no file names are listed. The compose sketch needs `database_url`, `encryption_key`, `session_secret`, and `db_password`. It is unclear whether `init` generates a `database_url` that embeds the generated DB password, or whether the operator writes it. `DATABASE_PASSWORD_FILE` (operations) and `POSTGRES_PASSWORD_FILE` (compose) are not reconciled. | [deployment.md:457](../architecture/deployment.md), [:196–231](../architecture/deployment.md), [operations.md §3 table](../architecture/operations.md) |
| A4 | Migrations | The install block starts the stack with `docker compose up -d` and never runs migrations. The deployment doc says migrations are a one-shot step. An operator following `operations.md` would start the app against an unmigrated schema, or not know it must run `migrate`. | [operations.md:48](../architecture/operations.md) vs [deployment.md:469](../architecture/deployment.md), [:482](../architecture/deployment.md) |
| A5 | `init --domain` | The optional flag freezes the origin via `PUBLIC_URL`, which later requires an env change and restart. The docs do not say so, and an operator would not expect a frozen origin from a flag described as a convenience. | [operations.md:44](../architecture/operations.md), [first-run-setup.md Stage 1.5 step 4](../product/specs/first-run-setup.md) |
| A6 | Bootstrap token | The token is printed once to the log, and `jury-forge setup token` re-prints it, but that command does not exist yet. Whether the log line is acceptable is still open (SU-05). The grep command assumes the log line contains `setup token`, which the spec states but no test has confirmed. | [first-run-setup.md:102–107](../product/specs/first-run-setup.md), [:375](../product/specs/first-run-setup.md) (SU-05), [operations.md:50](../architecture/operations.md) |
| A7 | Reaching setup | The docs offer three ways in (SSH tunnel, `curl` on the host, `jury-forge setup domain`) but give the tunnel command nowhere. A laptop operator on Windows or macOS has no example. | [operations.md:52–53](../architecture/operations.md), [deployment.md:53](../architecture/deployment.md) |
| A8 | Test repository and PR | Stage 6 needs a repo the App can see, a PR the operator opens, and the `jury:pr-review` label. The "sample PR" path is "created by the operator" with no steps. The "dry run" path depends on a "bundled fixture diff", and no fixture exists in the repository. | [first-run-setup.md:215–219](../product/specs/first-run-setup.md) |
| A9 | Default provider | The docs say "add a provider key" but do not name a default provider, the base URL to enter, or a model that is in the first-run catalog. The provider spec lists supported kinds, but a first-time operator is not told which one to use. | [first-run-setup.md Stage 4](../product/specs/first-run-setup.md), [provider-model-discovery.md:25–30](../product/specs/provider-model-discovery.md) |
| A10 | Webhook reachability | The operator is not told how to check from outside that `https://<origin>/api/webhooks/github` is reachable (router, cloud firewall, or VPS security group). The only check is the app's self-test, which needs GitHub to deliver. | [first-run-setup.md:150–160](../product/specs/first-run-setup.md) (Stage 3 self-test), [deployment.md §2](../architecture/deployment.md) |
| A11 | DNS | DNS propagation and the A/AAAA record are required before the origin step, and the time is not counted in the target. The docs do not say how to check propagation or what to do while waiting. | [first-run-setup.md:121–126](../product/specs/first-run-setup.md) |
| A12 | Org blockers | Stage 0 surfaces org blockers (IP allowlist, SAML SSO, OAuth restrictions). For an org install these can add hours of admin work outside the operator's control; the 15-minute target assumes none apply. | [first-run-setup.md:86–90](../product/specs/first-run-setup.md), [deployment.md §2](../architecture/deployment.md) |
| A13 | Host sizing | The first-run target does not state a minimum host. The sizing table gives "small team" as 4 vCPU and 8 GB, and the setup spec says "a VPS". | [deployment.md §9](../architecture/deployment.md) |

## 5. Contradictions between documents

| # | Conflict | Evidence |
| - | -------- | -------- |
| C1 | **Time-to-review definition.** The setup spec's 15-minute target starts from a verified bundle plus `jury-forge init`, on a host "with Docker and a domain". The success metrics start from `git clone`. Neither includes DNS propagation, Docker install, GitHub App creation, key procurement, or the test PR. | [first-run-setup.md:284](../product/specs/first-run-setup.md), [success.md:91](../product/success.md) |
| C2 | **Migration step.** The operations install block omits migrations; the deployment doc requires them. | A4 above |
| C3 | **Origin set in setup vs at install.** `operations.md` offers `init --domain` at install time, while ADR-0021 and the setup spec say the domain is entered in setup. Both can be true, but the docs do not reconcile the two. | A5 above |

## 6. What would make the test runnable

1. A tagged, signed release bundle with a compose file, Caddyfile, CLI, and images (ADR-0020).
2. The published minisign public key, with the exact verification command.
3. Resolution of B1 (order of App creation and claim) and B2 (candidate-origin authorization).
4. A check or fix for D1, confirmed on a host.
5. A clean Ubuntu 24.04 host with Docker, plus a test domain and a test GitHub org.

Only then can Workstream B's protocol run on five clean hosts with timings and a failure log.

## 7. Verdict

- **Installability: unproven.** This is a pre-test.
- **First-review timing:** not measured. No value is given.
- **Recommended before any timing claim:** fix B1 and B2 in the specs, and add the missing steps in
  §4 to the install doc. These are documentation changes and need no code.

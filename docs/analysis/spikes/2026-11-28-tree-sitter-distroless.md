# Spike: web-tree-sitter in the distroless image on amd64 and arm64 (S-B, WP 1-12)

- Date: 2026-11-28
- Status: done (time-boxed, throwaway code, not part of the product)
- Libraries: `web-tree-sitter` 0.27.2 (the pinned version in `technical-approach.md` §13) and the
  upstream grammar packages, all MIT, resolved live: `tree-sitter-typescript` 0.23.2 (TypeScript and
  TSX), `tree-sitter-javascript` 0.25.0, `tree-sitter-python` 0.25.0, `tree-sitter-go` 0.25.0,
  `tree-sitter-java` 0.23.5, `tree-sitter-c-sharp` 0.24.0, `tree-sitter-rust` 0.24.0,
  `tree-sitter-ruby` 0.23.1, `tree-sitter-php` 0.24.2
- Image: the WP 1-12 runtime base, `gcr.io/distroless/nodejs24-debian13:nonroot` (pinned by
  multi-arch digest), Node v24.22.3
- Runtime: Docker Engine 29.9.3 on Windows 11. amd64 ran natively; arm64 ran under QEMU emulation.
- Code: a benchmark script and a throwaway image in the session scratch folder, outside the
  repository. Synthetic source only.

## Question

Technical-approach §3.8 and TQ-1: does `web-tree-sitter` (WASM) run in the distroless Node 24 image
on amd64 and arm64, or does the image have to fall back to `node:24-slim`? Also: how large are the
eight grammar languages, and how long does a parse take against the 2 s per-file timeout and the
1 MB file cap?

## Method

- **Image:** a throwaway image, `FROM` the same distroless base as the product image. It contains
  only `web-tree-sitter`, the ten grammar `.wasm` files, and the script. It runs as `nonroot` with
  `--read-only`.
- **Workload:** for each grammar, the script loads the `.wasm` and builds a query for the language's
  function, method, and class nodes. It then parses generated source of about 20 KB (typical) and
  1 MB (the file cap) five times each, and records the median.
- **Checks:** that no tree has an error node, and that the capture counts agree across architectures.

## Results

**It runs on both architectures.** With a read-only root filesystem as `nonroot`, all ten grammars
loaded (ABI 14 and 15, both within `web-tree-sitter` 0.27's range), no parse had an error, and the
capture counts were identical on amd64 and arm64.

| Grammar | `.wasm` KB | ABI | 20 KB parse, amd64 (ms) | 1 MB parse, amd64 (ms) | 1 MB parse, arm64 under QEMU (ms) |
| ------- | ---------: | --: | ----------------------: | ---------------------: | --------------------------------: |
| TypeScript | 1,381 | 14 | 4.8 | 188 | 2,860 |
| TSX | 1,412 | 14 | 4.1 | 178 | 2,793 |
| JavaScript | 402 | 15 | 4.3 | 177 | 2,670 |
| Python | 447 | 15 | 3.9 | 180 | 2,844 |
| Go | 212 | 15 | 3.5 | 174 | 2,409 |
| Java | 405 | 14 | 3.4 | 157 | 2,204 |
| C# | 7,082 | 15 | 4.8 | 219 | 2,958 |
| Rust | 1,077 | 14 | 3.7 | 153 | 2,257 |
| Ruby | 2,057 | 14 | 6.7 | 311 | 4,788 |
| PHP | 1,033 | 15 | 4.0 | 169 | 2,473 |

**Startup and load:** `Parser.init()` took 9 ms on amd64 and 205 ms on arm64 under QEMU. Loading a
grammar took 2–15 ms on amd64 and 22–156 ms under QEMU.

**Size:**

| What | Bytes |
| ---- | ----: |
| The ten grammar `.wasm` files | 15,880,116 |
| The `web-tree-sitter` package (including a 0.8 MB debug build and source maps) | 4,685,681 |
| Root filesystem growth of the throwaway image over its base (`docker export`) | 20,596,736 |
| **The full grammar npm packages, for comparison** | about 227 MB (C sources, native bindings) |

**Memory:** after one process had parsed a 1 MB file in each of the ten languages (trees freed),
its resident memory was 371 MB on amd64. QEMU reported no usable figure.

## Findings

1. **Distroless works.** TQ-1 stays as decided: the image uses the distroless Node 24 base, not
   `node:24-slim`, and ADR-0026 needs no amendment.
2. **Ship the `.wasm` files, not the grammar packages.** The npm packages are about 227 MB,
   enough on their own to break the 250 MB image gate. The `.wasm` files and `web-tree-sitter` add
   about 20.6 MB. With the WP 1-12 image at 207.6 MB (amd64), that is about 228 MB.
3. **Native amd64 parsing is comfortably inside the limits:** a typical file takes a few
   milliseconds, and a 1 MB file 153–311 ms against the 2 s timeout.
4. **Emulated arm64 is about 15 times slower,** so a 1 MB file would time out there (2.2–4.8 s).
   That is QEMU, not arm64; native arm64 timing is not measured yet.
5. **C# is the largest grammar** (7.1 MB, 45% of the grammar bytes); Ruby is the slowest to parse.
6. **Parsing holds memory:** WASM linear memory grows with the largest file parsed and is not
   returned. A pool of parser workers needs a bound and recycling on the 4 GB floor.

## Recommendations (not decided)

- **R1.** When the `parsing` package arrives (T0+, v1), copy only the ten `.wasm` files and
  `web-tree-sitter` (without `debug/` and source maps) into the image, and record each grammar's
  licence and version, as §3.8 requires.
- **R2.** Measure parse time natively on the CI arm64 runner in that WP; keep the 2 s timeout and
  its ±20-line fallback, which already covers a slow parse.
- **R3.** Bound the parser worker pool (for example 2 workers on the 4 GB floor) and recycle a worker
  after a large file, so WASM memory does not ratchet up.
- **R4.** Restore image headroom before T0+ lands. The WP 1-12 image carries about 31 MB of
  `typescript` (with its native binary) as a resolved optional peer of `cosmiconfig`, which
  graphile-worker uses. Removing it brings the image to about 177 MB before the grammars.

## Not covered

- Native arm64 timing (only QEMU); arm64 memory.
- Other grammar builds, such as `@vscode/tree-sitter-wasm`, whose C# file is 5.1 MB.
- The worker-thread pool and the per-file timeout themselves (they belong to the `parsing` WP).
- Real repository files: the inputs were generated.

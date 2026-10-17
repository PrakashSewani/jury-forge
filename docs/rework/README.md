# Layout measurement harness

`scripts/measure-layout.mjs` drives the dashboard in a headless Chromium browser over the Chrome
DevTools Protocol and records real layout numbers. It exists so the rework slices can be measured
rather than eyeballed. Slice B (the shell and screen rewrite) changes layout; every number after
it is a delta against this baseline.

## What it measures

Eight dashboard routes (`/`, `/reviewers`, `/reviewers/new`, `/repositories`, `/runs`,
`/runs/<id>`, `/settings`, `/activity` — the `/setup` wizard is excluded) at seven widths
(**320, 360, 390, 414, 768, 1024, 1440** px, height 900) in two themes (**light** and **dark**),
for 112 cells. Per cell it records:

- **Horizontal overflow** — `documentElement.scrollWidth > clientWidth`, plus every offending
  element (`right > clientWidth + 1` or `left < -1`) with its rounded rect.
- **Tap targets** (mobile widths only) — every visible, enabled `a[href]`, `button`, `input`,
  `select`, `textarea`, `[role=button]`, `[role=switch]` and `[role=tab]` whose smaller side is
  under 44 px, excluding inline links (see the WCAG 2.5.5 exemption below). The number excluded
  is recorded per cell as `tapTargetsInlineExempt`.
- **Contrast** — every visible element with direct text; the foreground colour and the first
  opaque ancestor background are rasterised through a canvas to sRGB and run through the WCAG
  contrast formula.
- **Focus indicator** — the first three interactive elements are reached with a real **Tab**
  keypress and their outline and box-shadow are read while they are `:focus-visible`.
- **Mobile nav** — at 390 px, whether a nav toggle exists and whether clicking it reveals a nav.

## Acceptance thresholds

A check fails when:

- the page scrolls horizontally (`scrollWidth > clientWidth`);
- a mobile tap target is smaller than **44 px** on its shorter side, unless it is an inline link
  (see below);
- text contrast is below **4.5:1**, or below **3:1** for large text (font-size ≥ 24 px, or
  ≥ 18.66 px when the font weight is ≥ 700);
- the first three interactive elements are not `:focus-visible` or have no visible focus
  indicator (`outlineStyle !== none` with `outlineWidth ≥ 1px`, or a non-none `box-shadow`);
- at 390 px, the nav toggle is absent or clicking it does not reveal a nav.

## Methodological fixes (2026-10-17, slice B run 2)

Two checks were measuring the wrong bar. Both were changed before the baseline was re-captured,
so the before/after deltas use one rule:

1. **Focus is measured by keyboard, not `.focus()`.** A scripted `element.focus()` does not match
   `:focus-visible`, so the old check could not tell "no focus styling" apart from "correctly
   `:focus-visible` styling" — it only passed a `:focus` outline, which is the wrong UX bar. The
   harness now moves focus with a real **Tab** keypress (`Input.dispatchKeyEvent` with
   `windowsVirtualKeyCode: 9`) and passes only when the element matches `:focus-visible` **and**
   shows an outline or box-shadow. It falls back to `.focus()` only if Tab never reaches an
   interactive element, and records which path it used as `focusMethod`. Under the old check the
   baseline reported 112 failing cells for focus; under the corrected check the unmodified slice A
   tree already passes (the browser's own `:focus-visible` ring was always there) — which is the
   evidence that the old check, not the app, was wrong.
2. **Inline links are exempt from the 44 px tap-target rule.** WCAG 2.5.5 exempts a target that
   sits _in a sentence or block of text_: a link inside running prose cannot be 44 px tall without
   destroying the paragraph. `a[href]` whose computed `display` is `inline` is now counted and
   skipped, reported per cell as `tapTargetsInlineExempt`; block-level links (nav rows, list rows,
   "All runs →") stay in scope.

## Running it

```sh
npm run dev:seed                # local D1 seed + the jf_session cookie
node scripts/measure-layout.mjs --label baseline \
  --out docs/rework/baseline.json \
  --sheet docs/rework/baseline.md \
  --screenshots docs/rework/screens-baseline
```

`npm run dev:seed` is a hard prerequisite: without it every cell would silently measure the
sign-in screen. The harness verifies `GET /api/runs` with the seeded `jf_session` cookie and
exits non-zero with `not authenticated — run: npm run dev:seed` if it is missing.

It needs a Chromium-based browser. It takes `--browser <path>` or `$CHROME_PATH`, otherwise it
uses the first of Chrome, Chromium or Brave in `/Applications`, then `chromium`,
`google-chrome` or `chromium-browser` on `PATH`. It starts and owns the Vite dev server (on a
free port, bound to `127.0.0.1`), or measures an already-running instance with
`--base-url <url>`.

Other options: `--assert` exits non-zero when any cell fails a check (baseline mode only
records); `--port` picks the dev-server port; `--out`, `--sheet` and `--screenshots` set the
output paths. The script uses only Node builtins — no dependency is added.

## Which baseline is which

- `baseline.json` / `baseline.md` / `screens-baseline/` — **re-captured 2026-10-17** with the
  amended harness, on `dev`'s app source at `77541fb` (the branch's base, before any slice B
  styling change). This is the before snapshot the later runs are a delta against: 112 cells, all
  failing, with overflow 64, tapTargets 64 (740 violations), contrast 112 (224 elements, 2.48:1
  and 2.58:1), focus 0 (the corrected check — the app's own `:focus-visible` ring), mobileNav 16.
  Slice B was rebased onto `77541fb` after slice A merged, so the baseline was measured there
  rather than on A's unreviewed head; the first capture and the re-capture agree cell for cell.
- `shell.json` / `shell.md` / `screens-shell/` — the after-the-shell run (work items 1–3), still
  before the eight screens are rewritten: 88 failing cells, overflow 4, tapTargets 64 (176
  violations), contrast 56 (dark cells only — the light theme passes), focus 0, mobileNav 0.

The only remaining overflow is the `/reviewers` page toolbar at 320–360 px; the remaining
contrast failures are the eight screens' raw palette utilities on the dark palette. Both are the
next run's work. The `screens-*/` PNGs are regenerable and gitignored.

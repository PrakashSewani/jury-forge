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
  under 44 px.
- **Contrast** — every visible element with direct text; the foreground colour and the first
  opaque ancestor background are rasterised through a canvas to sRGB and run through the WCAG
  contrast formula.
- **Focus indicator** — the first three interactive elements are focused and their outline and
  box-shadow are read.
- **Mobile nav** — at 390 px, whether a nav toggle exists and whether clicking it reveals a nav.

## Acceptance thresholds

A check fails when:

- the page scrolls horizontally (`scrollWidth > clientWidth`);
- a mobile tap target is smaller than **44 px** on its shorter side;
- text contrast is below **4.5:1**, or below **3:1** for large text (font-size ≥ 24 px, or
  ≥ 18.66 px when the font weight is ≥ 700);
- the first three interactive elements have no visible focus indicator (`outlineStyle !== none`
  with `outlineWidth ≥ 1px`, or a non-none `box-shadow`);
- at 390 px, the nav toggle is absent or clicking it does not reveal a nav.

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

## Baseline

`baseline.json`, `baseline.md` and `screens-baseline/` were captured **before any slice B
styling change**, on the unmodified slice A tree, so later runs are a delta against them. The
baseline is expected to fail: there is no mobile nav at all (`navToggle: absent`), every mobile
width overflows horizontally, tap targets are under 44 px, and the `text-neutral-400` footer and
log-out text are about 2.5:1.

The dark theme currently renders identically to light: slice A prepared the `[data-theme=dark]`
tokens but nothing sets `data-theme` yet, and wiring the toggle is slice B.

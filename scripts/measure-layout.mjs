#!/usr/bin/env node
// Layout measurement harness for the jury-forge dashboard (rework slice B).
//
// A dependency-free Chrome DevTools Protocol driver. It launches a Chromium-based browser
// headless, drives the dashboard over CDP, and records real layout numbers (horizontal
// overflow, tap-target size, WCAG contrast, focus indicators, the mobile nav) for every route,
// width and theme. It writes a JSON result, an optional markdown sheet and PNG screenshots.
//
// This script depends on `npm run dev:seed` (scripts/seed-dev.mjs): the seeded local D1 holds
// the run detail screen's data and the `jf_session` cookie the dashboard requires. Without it
// every cell would silently measure the sign-in screen, so the script checks the session up
// front and exits non-zero if it is missing.
//
// It must not be run against a deployed instance. Local only.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

const HEIGHT = 900;
const WIDTHS = [320, 360, 390, 414, 768, 1024, 1440];
const THEMES = ['light', 'dark'];
const DEV_SESSION_ID = 'dev-seed-session-token';

const CHECK_NAMES = ['overflow', 'tapTargets', 'contrast', 'focus', 'mobileNav'];

const MAC_BROWSERS = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
];
const PATH_BROWSERS = ['chromium', 'google-chrome', 'chromium-browser'];

const sleep = (ms) => new Promise((resolvePromise) => setTimeout(resolvePromise, ms));

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function usage() {
  return [
    'Usage: node scripts/measure-layout.mjs [options]',
    '',
    'Options:',
    '  --browser <path>      Chromium-based browser binary (defaults to $CHROME_PATH, then a',
    '                        macOS Chrome/Chromium/Brave, then chromium/google-chrome on PATH)',
    '  --base-url <url>      Measure an already-running server instead of spawning one',
    '  --port <n>            Preferred dev-server port (default 5173, falls back to a free port)',
    '  --out <path>          JSON result (default docs/rework/layout.json)',
    '  --sheet <path>        Markdown summary sheet (optional)',
    '  --screenshots <dir>   Screenshot directory (default docs/rework/screens)',
    '  --label <name>        Label recorded in the JSON/sheet (default run)',
    '  --assert              Exit non-zero if any cell fails any check',
    '  --help                Show this message',
  ].join('\n');
}

function parseArgs(argv) {
  const options = {
    browser: process.env.CHROME_PATH ?? null,
    baseUrl: null,
    port: null,
    out: 'docs/rework/layout.json',
    sheet: null,
    screenshots: 'docs/rework/screens',
    label: 'run',
    assert: false,
  };
  const valued = new Set([
    '--browser',
    '--base-url',
    '--port',
    '--out',
    '--sheet',
    '--screenshots',
    '--label',
  ]);
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--assert') {
      options.assert = true;
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      console.log(usage());
      process.exit(0);
    }
    if (!valued.has(arg)) {
      throw new Error(`Unknown argument: ${arg}\n\n${usage()}`);
    }
    const value = argv[index + 1];
    if (value === undefined) {
      throw new Error(`Missing value for ${arg}\n\n${usage()}`);
    }
    index += 1;
    if (arg === '--browser') options.browser = value;
    if (arg === '--base-url') options.baseUrl = value;
    if (arg === '--port') options.port = Number(value);
    if (arg === '--out') options.out = value;
    if (arg === '--sheet') options.sheet = value;
    if (arg === '--screenshots') options.screenshots = value;
    if (arg === '--label') options.label = value;
  }
  if (options.port !== null && !Number.isInteger(options.port)) {
    throw new Error(`--port must be an integer, got ${options.port}`);
  }
  return options;
}

// ---------------------------------------------------------------------------
// Ports and browser discovery
// ---------------------------------------------------------------------------

function freePort() {
  return new Promise((resolvePromise, rejectPromise) => {
    const probe = createServer();
    probe.unref();
    probe.once('error', rejectPromise);
    probe.once('listening', () => {
      const address = probe.address();
      const port = typeof address === 'object' && address !== null ? address.port : 0;
      probe.close(() => resolvePromise(port));
    });
    probe.listen(0, '127.0.0.1');
  });
}

function portIsFree(port) {
  return new Promise((resolvePromise) => {
    const probe = createServer();
    probe.unref();
    probe.once('error', () => resolvePromise(false));
    probe.once('listening', () => probe.close(() => resolvePromise(true)));
    probe.listen(port, '127.0.0.1');
  });
}

async function pickPort(preferred) {
  if (await portIsFree(preferred)) return preferred;
  return freePort();
}

function findOnPath(name) {
  const pathValue = process.env.PATH;
  if (!pathValue) return null;
  for (const directory of pathValue.split(':')) {
    if (directory === '') continue;
    const candidate = join(directory, name);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

function findBrowser(explicit) {
  if (explicit) {
    if (existsSync(explicit)) return explicit;
    const onPath = findOnPath(explicit);
    if (onPath) return onPath;
    return null;
  }
  for (const candidate of MAC_BROWSERS) {
    if (existsSync(candidate)) return candidate;
  }
  for (const name of PATH_BROWSERS) {
    const candidate = findOnPath(name);
    if (candidate) return candidate;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Process helpers
// ---------------------------------------------------------------------------

function attachServerLogs(child, serverLog) {
  for (const stream of [child.stdout, child.stderr]) {
    if (!stream) continue;
    stream.setEncoding('utf8');
    stream.on('data', (chunk) => {
      for (const line of String(chunk).split('\n')) {
        if (line.trim() === '') continue;
        serverLog.push(line);
        if (serverLog.length > 40) serverLog.shift();
      }
    });
  }
}

function groupIsAlive(pid) {
  try {
    process.kill(-pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function killGroup(child, label) {
  if (!child) return;
  if (!groupIsAlive(child.pid)) {
    console.log(`${label}: already gone`);
    return;
  }
  try {
    process.kill(-child.pid, 'SIGTERM');
  } catch {
    // The group may have exited between the check and the signal.
  }
  for (let attempt = 0; attempt < 30 && groupIsAlive(child.pid); attempt += 1) {
    await sleep(100);
  }
  if (groupIsAlive(child.pid)) {
    try {
      process.kill(-child.pid, 'SIGKILL');
    } catch {
      // Same race as above.
    }
    for (let attempt = 0; attempt < 20 && groupIsAlive(child.pid); attempt += 1) {
      await sleep(100);
    }
  }
  console.log(`${label}: ${groupIsAlive(child.pid) ? 'STILL RUNNING' : 'gone'}`);
}

async function killChild(child, label) {
  if (!child) return;
  if (child.exitCode !== null) {
    console.log(`${label}: already exited`);
    return;
  }
  child.kill('SIGTERM');
  for (let attempt = 0; attempt < 20 && child.exitCode === null; attempt += 1) {
    await sleep(100);
  }
  if (child.exitCode === null) {
    child.kill('SIGKILL');
    await sleep(150);
  }
  console.log(`${label}: ${child.exitCode === null ? 'STILL RUNNING' : 'gone'}`);
}

// ---------------------------------------------------------------------------
// Browser + CDP
// ---------------------------------------------------------------------------

function launchBrowser(browserPath, debugPort, userDataDir) {
  const args = [
    '--headless=new',
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${userDataDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-gpu',
    '--disable-extensions',
    '--disable-background-networking',
    '--disable-sync',
    '--disable-component-update',
    '--metrics-recording-only',
    '--mute-audio',
    'about:blank',
  ];
  return spawn(browserPath, args, { stdio: 'ignore' });
}

async function waitForDevTools(debugPort, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${debugPort}/json/version`);
      if (response.ok) return await response.json();
    } catch (error) {
      lastError = error;
    }
    await sleep(250);
  }
  const detail = lastError instanceof Error ? ` (${lastError.message})` : '';
  throw new Error(
    `DevTools did not answer on 127.0.0.1:${debugPort} within ${timeoutMs}ms${detail}`,
  );
}

async function pageWebSocketUrl(debugPort) {
  const response = await fetch(`http://127.0.0.1:${debugPort}/json/list`);
  const targets = await response.json();
  const page = targets.find((target) => target.type === 'page' && target.webSocketDebuggerUrl);
  if (!page) throw new Error('No page target available from DevTools /json/list.');
  return page.webSocketDebuggerUrl;
}

async function openCdp(url) {
  const socket = new WebSocket(url);
  await new Promise((resolvePromise, rejectPromise) => {
    socket.addEventListener('open', () => resolvePromise(), { once: true });
    socket.addEventListener(
      'error',
      () => rejectPromise(new Error('CDP websocket failed to open.')),
      {
        once: true,
      },
    );
  });

  let nextId = 1;
  const pending = new Map();
  const listeners = new Map();

  socket.addEventListener('message', (event) => {
    let message;
    try {
      message = JSON.parse(event.data);
    } catch {
      return;
    }
    if (message.id === undefined) {
      const queue = listeners.get(message.method);
      if (queue && queue.length > 0) queue.shift()(message.params);
      return;
    }
    const entry = pending.get(message.id);
    if (!entry) return;
    pending.delete(message.id);
    if (message.error) {
      entry.reject(new Error(`${entry.method}: ${message.error.message}`));
    } else {
      entry.resolve(message.result);
    }
  });

  socket.addEventListener('close', () => {
    for (const entry of pending.values()) {
      entry.reject(new Error('CDP connection closed before a reply arrived.'));
    }
    pending.clear();
  });

  function send(method, params = {}) {
    const id = nextId;
    nextId += 1;
    return new Promise((resolvePromise, rejectPromise) => {
      pending.set(id, { resolve: resolvePromise, reject: rejectPromise, method });
      socket.send(JSON.stringify({ id, method, params }));
    });
  }

  function waitForEvent(method, timeoutMs = 10000) {
    return new Promise((resolvePromise, rejectPromise) => {
      const queue = listeners.get(method) ?? [];
      listeners.set(method, queue);
      let timer = null;
      const handler = (params) => {
        if (timer !== null) clearTimeout(timer);
        const index = queue.indexOf(handler);
        if (index !== -1) queue.splice(index, 1);
        resolvePromise(params);
      };
      queue.push(handler);
      timer = setTimeout(() => {
        const index = queue.indexOf(handler);
        if (index !== -1) queue.splice(index, 1);
        rejectPromise(new Error(`Timed out waiting for CDP event ${method}.`));
      }, timeoutMs);
    });
  }

  return { socket, send, waitForEvent };
}

async function setTheme(send, theme, previousScriptId) {
  await send('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-color-scheme', value: theme }],
  });
  if (previousScriptId) {
    await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: previousScriptId }).catch(
      () => undefined,
    );
  }
  const result = await send('Page.addScriptToEvaluateOnNewDocument', {
    source: `try { localStorage.setItem('jf:theme', ${JSON.stringify(theme)}); } catch (error) {}`,
  });
  return result.identifier;
}

async function waitForDashboard(send, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const response = await send('Runtime.evaluate', {
      expression: `(() => {
        const main = document.querySelector('main');
        return {
          ready: document.readyState === 'complete',
          hasMain: main !== null,
          loading: main === null || main.textContent.includes('Loading'),
        };
      })()`,
      returnByValue: true,
    });
    const state = response.result.value;
    if (state.ready && state.hasMain && !state.loading) return;
    await sleep(100);
  }
  throw new Error('Dashboard shell did not settle (main present, no "Loading") within 5s.');
}

async function navigate(send, waitForEvent, url) {
  const loaded = waitForEvent('Page.loadEventFired');
  const response = await send('Page.navigate', { url });
  if (response.errorText) throw new Error(`Navigation to ${url} failed: ${response.errorText}`);
  await loaded;
  await waitForDashboard(send);
  await sleep(200);
}

async function captureScreenshot(send, filePath) {
  const response = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(filePath, Buffer.from(response.data, 'base64'));
}

// ---------------------------------------------------------------------------
// The in-page measurement pass. Stringified and evaluated over CDP, so it must be
// self-contained: no imports, no outer references.
// ---------------------------------------------------------------------------

async function collectMetrics(width) {
  // The browser globals are read through `globalThis` so this function stays valid when
  // stringified and injected over CDP, and so ESLint does not treat it as Node code.
  const document = globalThis.document;
  const getComputedStyle = globalThis.getComputedStyle;
  const root = document.documentElement;
  const scrollWidth = root.scrollWidth;
  const clientWidth = root.clientWidth;

  const round = (value) => Math.round(value);
  const rectOf = (element) => {
    const rect = element.getBoundingClientRect();
    return {
      x: round(rect.left),
      y: round(rect.top),
      width: round(rect.width),
      height: round(rect.height),
      left: round(rect.left),
      right: round(rect.right),
      top: round(rect.top),
      bottom: round(rect.bottom),
    };
  };
  const describe = (element) => {
    const tag = element.tagName.toLowerCase();
    const id = element.id ? `#${element.id}` : '';
    let classes = '';
    if (typeof element.className === 'string' && element.className.trim() !== '') {
      classes = `.${element.className.trim().split(/\s+/).slice(0, 3).join('.')}`;
    }
    return `${tag}${id}${classes}`;
  };
  const shortLabel = (element) => {
    const aria = (element.getAttribute('aria-label') || '').trim();
    const text = (element.textContent || '').replace(/\s+/g, ' ').trim();
    return (aria || text).slice(0, 40);
  };
  const isVisible = (element) => {
    const style = getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };

  // 1. Horizontal overflow.
  const overflow = [];
  if (scrollWidth > clientWidth) {
    for (const element of document.querySelectorAll('body *')) {
      const rect = element.getBoundingClientRect();
      if (rect.right > clientWidth + 1 || rect.left < -1) {
        overflow.push({ element: describe(element), rect: rectOf(element) });
      }
    }
  }

  // 2. Tap targets, mobile only. Inline links inside running prose are exempt per WCAG
  // 2.5.5 (a link in a sentence cannot be 44px tall without destroying the paragraph), so
  // they are counted and skipped rather than reported; block-level links stay in scope.
  const tapTargets = [];
  let tapTargetsInlineExempt = 0;
  if (width < 768) {
    const selector =
      'a[href], button, input, select, textarea, [role="button"], [role="switch"], [role="tab"]';
    const seen = new Set();
    for (const element of document.querySelectorAll(selector)) {
      if (element.disabled) continue;
      if (!isVisible(element)) continue;
      if (
        element.tagName.toLowerCase() === 'a' &&
        element.hasAttribute('href') &&
        getComputedStyle(element).display === 'inline'
      ) {
        tapTargetsInlineExempt += 1;
        continue;
      }
      const rect = element.getBoundingClientRect();
      const minSide = Math.min(rect.width, rect.height);
      if (minSide >= 44) continue;
      const rounded = rectOf(element);
      const key = `${element.tagName.toLowerCase()}|${rounded.x}|${rounded.y}|${rounded.width}|${rounded.height}`;
      if (seen.has(key)) continue;
      seen.add(key);
      tapTargets.push({
        tag: element.tagName.toLowerCase(),
        element: describe(element),
        label: shortLabel(element),
        rect: rounded,
        minSide: Math.round(minSide * 100) / 100,
      });
    }
    tapTargets.sort((a, b) => a.minSide - b.minSide);
  }

  // 3. Contrast. Every colour is rasterised through a 1x1 canvas and read back as sRGB
  // bytes: the computed style may be rgb(), oklch() or color(), and on this browser the
  // fillStyle getter preserves oklch()/color() verbatim, so a pixel read is the reliable
  // normalisation.
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  const rgbaOf = (value) => {
    context.clearRect(0, 0, 1, 1);
    context.fillStyle = '#000000';
    context.fillStyle = value;
    context.fillRect(0, 0, 1, 1);
    const data = context.getImageData(0, 0, 1, 1).data;
    return [data[0], data[1], data[2], data[3] / 255];
  };
  const hexOf = (rgb) =>
    `#${rgb.map((channel) => Math.round(channel).toString(16).padStart(2, '0')).join('')}`;
  const luminance = (rgb) => {
    const channel = (value) => {
      const v = value / 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * channel(rgb[0]) + 0.7152 * channel(rgb[1]) + 0.0722 * channel(rgb[2]);
  };
  const contrast = (foreground, background) => {
    const a = luminance(foreground);
    const b = luminance(background);
    const high = Math.max(a, b);
    const low = Math.min(a, b);
    return (high + 0.05) / (low + 0.05);
  };
  const effectiveBackground = (element) => {
    let node = element;
    while (node && node !== root) {
      const raw = getComputedStyle(node).backgroundColor;
      if (raw && raw !== 'transparent') {
        const rgba = rgbaOf(raw);
        if (rgba[3] > 0) return rgba.slice(0, 3);
      }
      node = node.parentElement;
    }
    return [255, 255, 255];
  };
  const contrastFailures = [];
  for (const element of document.querySelectorAll('body *')) {
    let direct = '';
    for (const child of element.childNodes) {
      if (child.nodeType === 3) direct += child.textContent || '';
    }
    direct = direct.replace(/\s+/g, ' ').trim();
    if (direct === '') continue;
    if (!isVisible(element)) continue;
    const style = getComputedStyle(element);
    const foreground = rgbaOf(style.color).slice(0, 3);
    const background = effectiveBackground(element);
    const ratio = Math.round(contrast(foreground, background) * 100) / 100;
    const fontSize = Number.parseFloat(style.fontSize);
    const fontWeight = Number.parseInt(style.fontWeight, 10) || 400;
    const large = fontSize >= 24 || (fontSize >= 18.66 && fontWeight >= 700);
    const required = large ? 3 : 4.5;
    if (ratio < required) {
      contrastFailures.push({
        element: describe(element),
        text: direct.slice(0, 60),
        foreground: hexOf(foreground),
        background: hexOf(background),
        ratio,
        fontSize: Math.round(fontSize * 100) / 100,
        fontWeight,
        large,
        required,
      });
    }
  }
  contrastFailures.sort((a, b) => a.ratio - b.ratio);

  return JSON.stringify({
    width,
    scrollWidth,
    clientWidth,
    overflow,
    tapTargets,
    tapTargetsInlineExempt,
    contrastFailures,
  });
}

// ---------------------------------------------------------------------------
// Mobile nav pass, measured at 390 only. Run after the focus pass so opening the
// slide-over cannot change which elements were sampled for focus.
// ---------------------------------------------------------------------------

async function collectNavToggle(send, width) {
  const response = await send('Runtime.evaluate', {
    expression: `(async () => {
      const describe = (element) => {
        const tag = element.tagName.toLowerCase();
        const id = element.id ? '#' + element.id : '';
        let classes = '';
        if (typeof element.className === 'string' && element.className.trim() !== '') {
          classes = '.' + element.className.trim().split(/\\s+/).slice(0, 3).join('.');
        }
        return tag + id + classes;
      };
      const shortLabel = (element) => {
        const aria = (element.getAttribute('aria-label') || '').trim();
        const text = (element.textContent || '').replace(/\\s+/g, ' ').trim();
        return (aria || text).slice(0, 40);
      };
      let navToggle = 'not-applicable';
      if (${width} === 390) {
        let toggle = null;
        for (const element of document.querySelectorAll(
          'button, [role="button"], [aria-expanded], [aria-controls]',
        )) {
          const name = (element.getAttribute('aria-label') || element.textContent || '').trim();
          if (
            /menu|nav/i.test(name) ||
            element.hasAttribute('aria-expanded') ||
            element.hasAttribute('aria-controls')
          ) {
            toggle = element;
            break;
          }
        }
        if (!toggle) {
          navToggle = 'absent';
        } else {
          toggle.click();
          await new Promise((resolvePromise) => setTimeout(resolvePromise, 300));
          const nav = document.querySelector('nav');
          const navRect = nav ? nav.getBoundingClientRect() : null;
          const opened =
            nav !== null &&
            getComputedStyle(nav).display !== 'none' &&
            navRect !== null &&
            navRect.width > 0 &&
            navRect.height > 0;
          navToggle = { opened, label: shortLabel(toggle), element: describe(toggle) };
        }
      }
      return JSON.stringify(navToggle);
    })()`,
    returnByValue: true,
    awaitPromise: true,
  });
  return JSON.parse(response.result.value);
}

// ---------------------------------------------------------------------------
// Focus indicator pass. `element.focus()` called from script does not match
// `:focus-visible`, so it cannot tell "no focus styling" apart from "correctly
// focus-visible styling"; it only passes a `:focus` outline, the wrong UX bar.
// This pass drives a real Tab keypress over CDP and reads the styling while the
// element is focus-visible. It keeps the first-three-interactive-elements scope
// and falls back to `.focus()` only when Tab never reaches an interactive
// element, recording which path it used as `focusMethod`.
// ---------------------------------------------------------------------------

const FOCUS_TAG = 'data-jf-focus';
const FOCUS_SELECTOR =
  'a[href], button, input, select, textarea, [role="button"], [role="switch"], [role="tab"], [tabindex]';

// Shared in-page helpers, injected inside the stringified expressions below. They must be
// defined in each expression because every Runtime.evaluate is its own scope.
const FOCUS_HELPERS = `
  const isVisible = (element) => {
    const style = getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };
  const describe = (element) => {
    const tag = element.tagName.toLowerCase();
    const id = element.id ? '#' + element.id : '';
    let classes = '';
    if (typeof element.className === 'string' && element.className.trim() !== '') {
      classes = '.' + element.className.trim().split(/\\s+/).slice(0, 3).join('.');
    }
    return tag + id + classes;
  };
  const shortLabel = (element) => {
    const aria = (element.getAttribute('aria-label') || '').trim();
    const text = (element.textContent || '').replace(/\\s+/g, ' ').trim();
    return (aria || text).slice(0, 40);
  };
  const clearFocusTags = () => {
    for (const element of document.querySelectorAll('[data-jf-focus]')) {
      element.removeAttribute('data-jf-focus');
    }
  };
  const blurActive = () => {
    if (document.activeElement && typeof document.activeElement.blur === 'function') {
      document.activeElement.blur();
    }
    if (typeof document.body.focus === 'function') document.body.focus();
  };
`;

async function collectFocusChecks(send) {
  const setup = await send('Runtime.evaluate', {
    expression: `(() => {${FOCUS_HELPERS}
      clearFocusTags();
      const targets = [];
      const seen = new Set();
      for (const element of document.querySelectorAll(${JSON.stringify(FOCUS_SELECTOR)})) {
        if (element.disabled) continue;
        if (!isVisible(element)) continue;
        if (seen.has(element)) continue;
        seen.add(element);
        const index = targets.length;
        element.setAttribute('data-jf-focus', String(index));
        targets.push({ index, element: describe(element), label: shortLabel(element) });
        if (targets.length >= 3) break;
      }
      blurActive();
      return JSON.stringify(targets);
    })()`,
    returnByValue: true,
  });
  const targets = JSON.parse(setup.result.value);
  const checks = [];
  const recorded = new Set();

  const readActive = async () => {
    const response = await send('Runtime.evaluate', {
      expression: `(() => {
        const element = document.activeElement;
        if (!element || element === document.body) return null;
        const style = getComputedStyle(element);
        return JSON.stringify({
          index: element.hasAttribute('${FOCUS_TAG}')
            ? Number(element.getAttribute('${FOCUS_TAG}'))
            : null,
          focusVisible:
            typeof element.matches === 'function' ? element.matches(':focus-visible') : false,
          outlineStyle: style.outlineStyle,
          outlineWidth: style.outlineWidth,
          boxShadow: style.boxShadow,
          borderColor: style.borderColor,
        });
      })()`,
      returnByValue: true,
    });
    return response.result.value === null ? null : JSON.parse(response.result.value);
  };

  const MAX_TABS = 40;
  let tabs = 0;
  while (tabs < MAX_TABS && recorded.size < targets.length) {
    await send('Input.dispatchKeyEvent', {
      type: 'rawKeyDown',
      windowsVirtualKeyCode: 9,
      key: 'Tab',
      code: 'Tab',
    });
    await send('Input.dispatchKeyEvent', {
      type: 'keyUp',
      windowsVirtualKeyCode: 9,
      key: 'Tab',
      code: 'Tab',
    });
    tabs += 1;
    const active = await readActive();
    if (active === null || active.index === null) continue;
    if (recorded.has(active.index)) continue;
    const target = targets[active.index];
    if (!target) continue;
    recorded.add(active.index);
    const passes =
      active.focusVisible &&
      ((active.outlineStyle !== 'none' && Number.parseFloat(active.outlineWidth) >= 1) ||
        active.boxShadow !== 'none');
    checks.push({
      element: target.element,
      label: target.label,
      focusVisible: active.focusVisible,
      outlineStyle: active.outlineStyle,
      outlineWidth: active.outlineWidth,
      boxShadow: active.boxShadow,
      borderColor: active.borderColor,
      passes,
    });
  }

  let method = 'Tab';
  if (recorded.size === 0) {
    // Tab never reached an interactive element; fall back to a scripted focus so the JSON
    // still records the styling, and say so through focusMethod.
    method = 'focus()';
    const response = await send('Runtime.evaluate', {
      expression: `(() => {${FOCUS_HELPERS}
        const out = [];
        const seen = new Set();
        for (const element of document.querySelectorAll(${JSON.stringify(FOCUS_SELECTOR)})) {
          if (element.disabled) continue;
          if (!isVisible(element)) continue;
          if (seen.has(element)) continue;
          seen.add(element);
          element.focus();
          const style = getComputedStyle(element);
          out.push({
            element: describe(element),
            label: shortLabel(element),
            focusVisible:
              typeof element.matches === 'function' ? element.matches(':focus-visible') : false,
            outlineStyle: style.outlineStyle,
            outlineWidth: style.outlineWidth,
            boxShadow: style.boxShadow,
            borderColor: style.borderColor,
            passes:
              (style.outlineStyle !== 'none' && Number.parseFloat(style.outlineWidth) >= 1) ||
              style.boxShadow !== 'none',
          });
          if (out.length >= 3) break;
        }
        blurActive();
        return JSON.stringify(out);
      })()`,
      returnByValue: true,
    });
    checks.push(...JSON.parse(response.result.value));
  }

  await send('Runtime.evaluate', {
    expression: `(() => {${FOCUS_HELPERS}
      clearFocusTags();
      blurActive();
    })()`,
    returnByValue: true,
  });

  return { checks, method };
}

// ---------------------------------------------------------------------------
// Sweep
// ---------------------------------------------------------------------------

function buildRoutes(runId) {
  return [
    { slug: 'home', path: '/' },
    { slug: 'reviewers', path: '/reviewers' },
    { slug: 'reviewers-new', path: '/reviewers/new' },
    { slug: 'repositories', path: '/repositories' },
    { slug: 'runs', path: '/runs' },
    { slug: 'run-detail', path: `/runs/${encodeURIComponent(runId)}` },
    { slug: 'settings', path: '/settings' },
    { slug: 'activity', path: '/activity' },
  ];
}

function failingChecksFor(metrics, width) {
  const failing = [];
  if (metrics.scrollWidth > metrics.clientWidth) failing.push('overflow');
  if (width < 768 && metrics.tapTargets.length > 0) failing.push('tapTargets');
  if (metrics.contrastFailures.length > 0) failing.push('contrast');
  if (metrics.focusChecks.some((check) => !check.passes)) failing.push('focus');
  if (width === 390 && (metrics.navToggle === 'absent' || metrics.navToggle.opened !== true)) {
    failing.push('mobileNav');
  }
  return failing;
}

async function measureCell(context, route, width, theme) {
  const { send, waitForEvent, baseUrl, screenshotsDir } = context;
  await send('Emulation.setDeviceMetricsOverride', {
    width,
    height: HEIGHT,
    deviceScaleFactor: 1,
    mobile: width < 768,
  });
  await navigate(send, waitForEvent, `${baseUrl}${route.path}`);

  let screenshot = null;
  if (width === 390 || width === 1440) {
    screenshot = `${route.slug}-${width}-${theme}.png`;
    await captureScreenshot(send, join(screenshotsDir, screenshot));
  }

  const response = await send('Runtime.evaluate', {
    expression: `(${collectMetrics.toString()})(${width})`,
    returnByValue: true,
    awaitPromise: true,
  });
  if (response.exceptionDetails) {
    throw new Error(
      `In-page measurement failed for ${route.path} @ ${width} (${theme}): ${response.exceptionDetails.text}`,
    );
  }
  const metrics = JSON.parse(response.result.value);
  const focus = await collectFocusChecks(send);
  metrics.focusChecks = focus.checks;
  metrics.focusMethod = focus.method;
  metrics.navToggle = await collectNavToggle(send, width);
  const failingChecks = failingChecksFor(metrics, width);
  return {
    route: route.slug,
    path: route.path,
    width,
    height: HEIGHT,
    theme,
    mobile: width < 768,
    screenshot,
    scrollWidth: metrics.scrollWidth,
    clientWidth: metrics.clientWidth,
    overflow: metrics.overflow,
    tapTargets: metrics.tapTargets,
    tapTargetsInlineExempt: metrics.tapTargetsInlineExempt,
    contrastFailures: metrics.contrastFailures,
    focusChecks: metrics.focusChecks,
    focusMethod: metrics.focusMethod,
    navToggle: metrics.navToggle,
    failingChecks,
    failingCount: failingChecks.length,
  };
}

function summarize(cells) {
  const failingCellsByCheck = Object.fromEntries(CHECK_NAMES.map((name) => [name, 0]));
  let failingCells = 0;
  for (const cell of cells) {
    if (cell.failingCount > 0) failingCells += 1;
    for (const check of cell.failingChecks) failingCellsByCheck[check] += 1;
  }
  return { cells: cells.length, failingCells, failingCellsByCheck };
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

function renderSummaryTable(result) {
  const lines = [];
  lines.push(`| Route | ${result.widths.join(' | ')} |`);
  lines.push(`| --- | ${result.widths.map(() => '---:').join(' | ')} |`);
  for (const route of result.routes) {
    const cells = result.widths.map((width) => {
      const light = result.cells.find(
        (cell) => cell.route === route.slug && cell.width === width && cell.theme === 'light',
      );
      const dark = result.cells.find(
        (cell) => cell.route === route.slug && cell.width === width && cell.theme === 'dark',
      );
      return `${light ? light.failingCount : '-'}<br>${dark ? dark.failingCount : '-'}`;
    });
    lines.push(`| \`${route.path}\` | ${cells.join(' | ')} |`);
  }
  return lines.join('\n');
}

function contrastPairs(cells) {
  const map = new Map();
  for (const cell of cells) {
    for (const failure of cell.contrastFailures) {
      const key = `${failure.foreground}|${failure.background}|${failure.required}`;
      const entry = map.get(key) ?? {
        foreground: failure.foreground,
        background: failure.background,
        required: failure.required,
        count: 0,
        worst: failure.ratio,
        example: failure.text,
      };
      entry.count += 1;
      if (failure.ratio < entry.worst) {
        entry.worst = failure.ratio;
        entry.example = failure.text;
      }
      map.set(key, entry);
    }
  }
  return [...map.values()].sort((a, b) => a.worst - b.worst);
}

function buildSheet(result) {
  const lines = [];
  lines.push(`# Layout baseline: ${result.label}`);
  lines.push('');
  lines.push(`- Generated: ${result.generatedAt}`);
  lines.push(`- Branch: \`${result.git.branch}\` @ \`${result.git.sha}\``);
  lines.push(`- Browser: \`${result.browser.path}\``);
  lines.push(`- Browser string: ${result.browser.product}`);
  lines.push(`- Base URL: ${result.baseUrl}`);
  lines.push(`- Dev server spawned by the harness: ${result.spawnedDevServer ? 'yes' : 'no'}`);
  lines.push(`- Widths: ${result.widths.join(', ')} px; height ${result.height}px`);
  lines.push(`- Themes: ${result.themes.join(', ')}`);
  lines.push(`- Routes: ${result.routes.map((route) => `\`${route.path}\``).join(', ')}`);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(
    'Each cell is the number of failing checks in that cell: **light on the first line, dark on the second**.',
  );
  lines.push('');
  lines.push(renderSummaryTable(result));
  lines.push('');
  lines.push('## Totals');
  lines.push('');
  lines.push(`- Cells measured: ${result.totals.cells}`);
  lines.push(`- Cells with at least one failing check: ${result.totals.failingCells}`);
  for (const check of CHECK_NAMES) {
    lines.push(`- ${check}: ${result.totals.failingCellsByCheck[check]} failing cells`);
  }

  lines.push('');
  lines.push('## Horizontal overflow');
  lines.push('');
  const overflowCells = result.cells.filter((cell) => cell.failingChecks.includes('overflow'));
  if (overflowCells.length === 0) {
    lines.push('None.');
  } else {
    const groups = new Map();
    for (const cell of overflowCells) {
      const key = cell.overflow.map((item) => item.element).join('\n');
      const group = groups.get(key) ?? { sample: cell, cells: [] };
      group.cells.push(cell);
      groups.set(key, group);
    }
    for (const group of groups.values()) {
      const widths = [...new Set(group.cells.map((cell) => cell.width))].join(', ');
      lines.push(
        `- ${group.cells.length} cell(s) at ${widths}px (scrollWidth ${group.sample.scrollWidth}, clientWidth ${group.sample.clientWidth}):`,
      );
      for (const item of group.sample.overflow.slice(0, 12)) {
        lines.push(
          `  - \`${item.element}\` left ${item.rect.left}, right ${item.rect.right}, width ${item.rect.width}`,
        );
      }
      if (group.sample.overflow.length > 12) {
        lines.push(`  - … ${group.sample.overflow.length - 12} more`);
      }
    }
  }

  lines.push('');
  lines.push('## Tap targets (< 44px, mobile widths)');
  lines.push('');
  const targets = [];
  for (const cell of result.cells) {
    for (const target of cell.tapTargets) targets.push({ cell, target });
  }
  targets.sort((a, b) => a.target.minSide - b.target.minSide);
  const inlineExempt = result.cells.reduce(
    (total, cell) => total + (cell.tapTargetsInlineExempt ?? 0),
    0,
  );
  lines.push(`Total violations: ${targets.length}`);
  lines.push(`Inline links exempt under WCAG 2.5.5: ${inlineExempt}`);
  if (targets.length === 0) {
    lines.push('None.');
  } else {
    for (const { cell, target } of targets.slice(0, 40)) {
      lines.push(
        `- ${target.minSide}px — \`${target.element}\` "${target.label}" (${cell.path} @ ${cell.width} ${cell.theme})`,
      );
    }
    if (targets.length > 40) lines.push(`- … ${targets.length - 40} more`);
  }

  lines.push('');
  lines.push('## Contrast');
  lines.push('');
  const pairs = contrastPairs(result.cells);
  let contrastCount = 0;
  for (const cell of result.cells) contrastCount += cell.contrastFailures.length;
  lines.push(`Total violating text elements: ${contrastCount}`);
  if (pairs.length === 0) {
    lines.push('None.');
  } else {
    for (const pair of pairs.slice(0, 40)) {
      lines.push(
        `- ${pair.worst.toFixed(2)}:1 (needs ${pair.required}:1) ${pair.foreground} on ${pair.background} — ${pair.count} occurrence(s), e.g. "${pair.example}"`,
      );
    }
    if (pairs.length > 40) lines.push(`- … ${pairs.length - 40} more`);
  }

  lines.push('');
  lines.push('## Focus indicators (first three interactive elements)');
  lines.push('');
  let focusTotal = 0;
  const focusFailures = [];
  for (const cell of result.cells) {
    for (const check of cell.focusChecks) {
      focusTotal += 1;
      if (!check.passes) focusFailures.push({ cell, check });
    }
  }
  lines.push(`Checks run: ${focusTotal}; failures: ${focusFailures.length}`);
  const methods = [...new Set(result.cells.map((cell) => cell.focusMethod).filter(Boolean))];
  lines.push(`Focus method: ${methods.join(', ') || 'unknown'}`);
  if (focusFailures.length === 0) {
    lines.push('None.');
  } else {
    const grouped = new Map();
    for (const { cell, check } of focusFailures) {
      const key = `${check.element}|${check.label}|${check.outlineStyle}|${check.outlineWidth}|${check.boxShadow}`;
      const entry = grouped.get(key) ?? { check, count: 0, example: cell };
      entry.count += 1;
      grouped.set(key, entry);
    }
    for (const entry of grouped.values()) {
      lines.push(
        `- \`${entry.check.element}\` "${entry.check.label}" — ${entry.count} cell(s), e.g. ${entry.example.path} @ ${entry.example.width} ${entry.example.theme}; outline ${entry.check.outlineStyle} ${entry.check.outlineWidth}, boxShadow ${entry.check.boxShadow}`,
      );
    }
  }

  lines.push('');
  lines.push('## Mobile nav (390px)');
  lines.push('');
  const navCells = result.cells.filter((cell) => cell.width === 390);
  for (const cell of navCells) {
    const status =
      typeof cell.navToggle === 'string'
        ? cell.navToggle
        : cell.navToggle.opened
          ? 'opened'
          : 'closed';
    const label = typeof cell.navToggle === 'string' ? '' : cell.navToggle.label;
    lines.push(`- \`${cell.path}\` (${cell.theme}): ${status}${label ? ` — "${label}"` : ''}`);
  }

  lines.push('');
  return `${lines.join('\n')}\n`;
}

// ---------------------------------------------------------------------------
// Provenance + server
// ---------------------------------------------------------------------------

function readGit(repoRoot) {
  const run = (args) => {
    const result = spawnSync('git', args, { cwd: repoRoot, encoding: 'utf8' });
    return result.status === 0 ? result.stdout.trim() : null;
  };
  return {
    branch: run(['rev-parse', '--abbrev-ref', 'HEAD']),
    sha: run(['rev-parse', '--short', 'HEAD']),
  };
}

async function waitForHealth(baseUrl, serverLog, timeoutMs = 60000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.status === 200) return;
    } catch {
      // Server not up yet.
    }
    await sleep(1000);
  }
  const tail = serverLog.length > 0 ? `\n--- dev server output ---\n${serverLog.join('\n')}` : '';
  throw new Error(`Dev server /api/health did not answer 200 within 60s.${tail}`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const repoRoot = resolve(import.meta.dirname, '..');
  const startedAt = Date.now();

  const browserPath = findBrowser(options.browser);
  if (!browserPath) {
    console.error('No Chromium-based browser found.');
    console.error(
      'Pass --browser <path> or set $CHROME_PATH. Looked for Chrome, Chromium and Brave under /Applications, then chromium/google-chrome/chromium-browser on PATH.',
    );
    return 1;
  }

  const outPath = resolve(options.out);
  const sheetPath = options.sheet === null ? null : resolve(options.sheet);
  const screenshotsDir = resolve(options.screenshots);
  const session = process.env.JF_SESSION ?? DEV_SESSION_ID;

  const userDataDir = mkdtempSync(join(tmpdir(), 'jf-measure-'));
  const debugPort = await freePort();
  const serverLog = [];

  let browser = null;
  let server = null;
  let cdp = null;
  let spawnedDevServer = false;
  let baseUrl = options.baseUrl;

  try {
    console.log(`Browser: ${browserPath}`);
    browser = launchBrowser(browserPath, debugPort, userDataDir);
    const version = await waitForDevTools(debugPort);
    console.log(`Browser version: ${version.Browser}`);
    cdp = await openCdp(await pageWebSocketUrl(debugPort));
    const { send, waitForEvent } = cdp;

    await send('Page.enable');
    await send('Runtime.enable');
    await send('Network.enable');

    if (baseUrl === null) {
      const port = options.port ?? (await pickPort(5173));
      baseUrl = `http://127.0.0.1:${port}`;
      console.log(`Starting dev server: npx vite dev --port ${port} --strictPort --host 127.0.0.1`);
      server = spawn(
        'npx',
        ['vite', 'dev', '--port', String(port), '--strictPort', '--host', '127.0.0.1'],
        {
          cwd: join(repoRoot, 'product'),
          detached: true,
          stdio: ['ignore', 'pipe', 'pipe'],
        },
      );
      attachServerLogs(server, serverLog);
      spawnedDevServer = true;
      await waitForHealth(baseUrl, serverLog);
    } else {
      console.log(`Using existing base URL: ${baseUrl}`);
      await waitForHealth(baseUrl, serverLog, 10000);
    }

    const runsResponse = await fetch(`${baseUrl}/api/runs`, {
      headers: { cookie: `jf_session=${session}` },
    });
    if (runsResponse.status === 401) {
      console.error('not authenticated — run: npm run dev:seed');
      return 1;
    }
    if (!runsResponse.ok) {
      throw new Error(`GET /api/runs returned HTTP ${runsResponse.status}.`);
    }
    const runsPage = await runsResponse.json();
    const runId = runsPage.runs?.[0]?.id;
    if (typeof runId !== 'string' || runId === '') {
      console.error('No seeded run found — run: npm run dev:seed');
      return 1;
    }
    console.log(`Run detail id: ${runId}`);

    await send('Network.setCookie', {
      name: 'jf_session',
      value: session,
      url: baseUrl,
      path: '/',
      httpOnly: true,
      secure: false,
      sameSite: 'Lax',
    });

    const routes = buildRoutes(runId);
    const git = readGit(repoRoot);
    mkdirSync(dirname(outPath), { recursive: true });
    mkdirSync(screenshotsDir, { recursive: true });
    if (sheetPath !== null) mkdirSync(dirname(sheetPath), { recursive: true });

    const cells = [];
    let themeScriptId = null;
    for (const theme of THEMES) {
      themeScriptId = await setTheme(send, theme, themeScriptId);
      for (const route of routes) {
        for (const width of WIDTHS) {
          const cell = await measureCell(
            { send, waitForEvent, baseUrl, screenshotsDir },
            route,
            width,
            theme,
          );
          cells.push(cell);
          console.log(
            `${route.path} ${width} ${theme} ${cell.failingCount === 0 ? 'ok' : `${cell.failingCount} failing`}`,
          );
        }
      }
    }

    const totals = summarize(cells);
    const result = {
      label: options.label,
      generatedAt: new Date().toISOString(),
      durationSeconds: Math.round((Date.now() - startedAt) / 100) / 10,
      git,
      browser: { path: browserPath, product: version.Browser },
      baseUrl,
      spawnedDevServer,
      runId,
      routes,
      widths: WIDTHS,
      height: HEIGHT,
      themes: THEMES,
      cells,
      totals,
    };

    writeFileSync(outPath, `${JSON.stringify(result, null, 2)}\n`);
    const sheet = buildSheet(result);
    if (sheetPath !== null) {
      writeFileSync(sheetPath, sheet);
    }

    console.log('');
    console.log(renderSummaryTable(result));
    console.log('');
    console.log(
      `Totals: ${totals.cells} cells, ${totals.failingCells} failing cells; ${CHECK_NAMES.map(
        (name) => `${name} ${totals.failingCellsByCheck[name]}`,
      ).join(', ')}`,
    );
    console.log(`Duration: ${result.durationSeconds}s`);
    console.log(`JSON: ${outPath}`);
    if (sheetPath !== null) console.log(`Sheet: ${sheetPath}`);
    console.log(`Screenshots: ${screenshotsDir}`);

    if (options.assert && totals.failingCells > 0) {
      console.error(`--assert: ${totals.failingCells} cell(s) failed at least one check.`);
      return 1;
    }
    return 0;
  } finally {
    if (cdp) cdp.socket.close();
    await killChild(browser, 'browser');
    if (spawnedDevServer) await killGroup(server, 'dev server');
    rmSync(userDataDir, { recursive: true, force: true });
  }
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });

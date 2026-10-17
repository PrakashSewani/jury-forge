import { beforeEach, describe, expect, it } from 'vitest';
import {
  applyTheme,
  readStoredTheme,
  resolveTheme,
  systemPrefersDark,
  THEME_STORAGE_KEY,
} from '../src/lib/theme';
import { memoryStorage } from './memory-storage';

function fakeWindow(matches: boolean | undefined): Window {
  if (matches === undefined) {
    return {} as unknown as Window;
  }
  return {
    matchMedia: () => ({ matches }),
  } as unknown as Window;
}

function fakeDocument(matches: boolean): Document {
  return {
    defaultView: fakeWindow(matches),
    documentElement: { dataset: {} },
  } as unknown as Document;
}

let store: Storage;

beforeEach(() => {
  // Never `window.localStorage`: on Node ≥26 that global exists but is disabled, and vitest's
  // happy-dom environment then never installs happy-dom's own Storage (see memory-storage.ts).
  store = memoryStorage();
  delete document.documentElement.dataset.theme;
});

describe('readStoredTheme', () => {
  it('returns null when nothing is stored', () => {
    expect(readStoredTheme(store)).toBeNull();
  });

  it('returns a valid stored preference', () => {
    store.setItem(THEME_STORAGE_KEY, 'dark');
    expect(readStoredTheme(store)).toBe('dark');
  });

  it('returns null for a garbage value', () => {
    store.setItem(THEME_STORAGE_KEY, 'sepia');
    expect(readStoredTheme(store)).toBeNull();
  });
});

describe('resolveTheme', () => {
  it('keeps an explicit light preference', () => {
    expect(resolveTheme('light', true)).toBe('light');
  });

  it('keeps an explicit dark preference', () => {
    expect(resolveTheme('dark', false)).toBe('dark');
  });

  it('resolves system to dark when the system prefers dark', () => {
    expect(resolveTheme('system', true)).toBe('dark');
  });

  it('resolves system to light when the system does not prefer dark', () => {
    expect(resolveTheme('system', false)).toBe('light');
  });
});

describe('systemPrefersDark', () => {
  it('returns true when the media query matches', () => {
    expect(systemPrefersDark(fakeWindow(true))).toBe(true);
  });

  it('returns false when the media query does not match', () => {
    expect(systemPrefersDark(fakeWindow(false))).toBe(false);
  });

  it('returns false when matchMedia is missing', () => {
    expect(systemPrefersDark(fakeWindow(undefined))).toBe(false);
  });
});

describe('applyTheme', () => {
  it('sets data-theme and persists an explicit preference', () => {
    applyTheme('dark', document, store);
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(store.getItem(THEME_STORAGE_KEY)).toBe('dark');
  });

  it('sets data-theme to light for the light preference', () => {
    applyTheme('light', document, store);
    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('removes the stored key for the system preference', () => {
    store.setItem(THEME_STORAGE_KEY, 'dark');
    applyTheme('system', document, store);
    expect(store.getItem(THEME_STORAGE_KEY)).toBeNull();
  });

  it('resolves the system preference into a concrete theme through the document view', () => {
    const dark = fakeDocument(true);
    applyTheme('system', dark, store);
    expect(dark.documentElement.dataset.theme).toBe('dark');

    const light = fakeDocument(false);
    applyTheme('system', light, store);
    expect(light.documentElement.dataset.theme).toBe('light');
  });
});

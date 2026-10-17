import { beforeEach, describe, expect, it } from 'vitest';
import {
  applyTheme,
  readStoredTheme,
  resolveTheme,
  systemPrefersDark,
  THEME_STORAGE_KEY,
} from '../src/lib/theme';

function fakeWindow(matches: boolean | undefined): Window {
  if (matches === undefined) {
    return {} as unknown as Window;
  }
  return {
    matchMedia: () => ({ matches }),
  } as unknown as Window;
}

beforeEach(() => {
  window.localStorage.clear();
  delete document.documentElement.dataset.theme;
});

describe('readStoredTheme', () => {
  it('returns null when nothing is stored', () => {
    expect(readStoredTheme(window.localStorage)).toBeNull();
  });

  it('returns a valid stored preference', () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    expect(readStoredTheme(window.localStorage)).toBe('dark');
  });

  it('returns null for a garbage value', () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'sepia');
    expect(readStoredTheme(window.localStorage)).toBeNull();
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
    applyTheme('dark', document, window.localStorage);
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
  });

  it('sets data-theme to light for the light preference', () => {
    applyTheme('light', document, window.localStorage);
    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('removes the stored key for the system preference', () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    applyTheme('system', document, window.localStorage);
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
    expect(resolveTheme(document.documentElement.dataset.theme as 'light' | 'dark', false)).toBe(
      document.documentElement.dataset.theme,
    );
  });
});

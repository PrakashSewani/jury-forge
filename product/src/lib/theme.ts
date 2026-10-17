export const THEME_STORAGE_KEY = 'jf:theme';

export type ThemePreference = 'light' | 'dark' | 'system';

const THEME_PREFERENCES: readonly string[] = ['light', 'dark', 'system'];

function isThemePreference(value: string): value is ThemePreference {
  return THEME_PREFERENCES.includes(value);
}

export function readStoredTheme(storage: Storage = window.localStorage): ThemePreference | null {
  const value = storage.getItem(THEME_STORAGE_KEY);
  return value !== null && isThemePreference(value) ? value : null;
}

export function resolveTheme(
  preference: ThemePreference,
  systemPrefersDarkValue: boolean,
): 'light' | 'dark' {
  if (preference === 'system') {
    return systemPrefersDarkValue ? 'dark' : 'light';
  }
  return preference;
}

export function systemPrefersDark(win: Window = window): boolean {
  if (typeof win.matchMedia !== 'function') {
    return false;
  }
  return win.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function applyTheme(
  preference: ThemePreference,
  doc: Document = document,
  storage: Storage = window.localStorage,
): void {
  if (preference === 'system') {
    storage.removeItem(THEME_STORAGE_KEY);
  } else {
    storage.setItem(THEME_STORAGE_KEY, preference);
  }

  const view = doc.defaultView;
  const prefersDark = view === null ? false : systemPrefersDark(view);
  doc.documentElement.dataset.theme = resolveTheme(preference, prefersDark);
}

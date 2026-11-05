export type Accent = 'en-GB' | 'en-US';
export type Theme = 'system' | 'light' | 'dark';

function read<T extends string>(key: string, fallback: T, allowed: readonly T[]): T {
  try {
    const v = localStorage.getItem(key) as T | null;
    return v && allowed.includes(v) ? v : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage unavailable */
  }
}

export const getAccent = () => read<Accent>('eg.accent', 'en-GB', ['en-GB', 'en-US']);
export const setAccent = (a: Accent) => write('eg.accent', a);
export const getTheme = () => read<Theme>('eg.theme', 'system', ['system', 'light', 'dark']);
export const setTheme = (t: Theme) => write('eg.theme', t);

export function applyTheme(t: Theme) {
  if (t === 'system') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = t;
}

import { useEffect, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { applyTheme, getAccent, getTheme, setAccent, setTheme, type Theme } from '../lib/prefs';
import styles from './Layout.module.css';

const THEME_ICON: Record<Theme, string> = { system: '🖥️', light: '☀️', dark: '🌙' };
const NEXT_THEME: Record<Theme, Theme> = { system: 'light', light: 'dark', dark: 'system' };

export function Layout() {
  const [theme, setThemeState] = useState<Theme>(getTheme);
  const [accent, setAccentState] = useState(getAccent);

  useEffect(() => applyTheme(theme), [theme]);

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <div className={`container ${styles.bar}`}>
          <NavLink to="/" className={styles.brand}>
            🏋️ <span>English Gym</span>
          </NavLink>
          <nav className={styles.nav}>
            <NavLink to="/" end>
              Колоды
            </NavLink>
            <NavLink to="/stats">Статистика</NavLink>
            <NavLink to="/import-export">Импорт</NavLink>
          </nav>
          <div className="spacer" />
          <button
            className="btn ghost icon"
            title={`Акцент озвучки: ${accent === 'en-GB' ? 'британский' : 'американский'}`}
            onClick={() => {
              const a = accent === 'en-GB' ? 'en-US' : 'en-GB';
              setAccent(a);
              setAccentState(a);
            }}
          >
            {accent === 'en-GB' ? '🇬🇧' : '🇺🇸'}
          </button>
          <button
            className="btn ghost icon"
            title={`Тема: ${theme}`}
            onClick={() => {
              const t = NEXT_THEME[theme];
              setTheme(t);
              setThemeState(t);
            }}
          >
            {THEME_ICON[theme]}
          </button>
        </div>
      </header>
      <main className="container">
        <Outlet />
      </main>
    </div>
  );
}

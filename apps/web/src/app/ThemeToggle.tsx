"use client";

import { useEffect, useState } from "react";

type Theme = "light" | "dark";

const STORAGE_KEY = "property-search-theme";

function readStoredTheme(): Theme | null {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return value === "dark" || value === "light" ? value : null;
  } catch {
    return null;
  }
}

function writeStoredTheme(theme: Theme) {
  try {
    window.localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Best-effort persistence.
  }
}

function SunIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M12 2v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M12 20v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M4.93 4.93l1.41 1.41" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M17.66 17.66l1.41 1.41" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M2 12h2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M20 12h2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M4.93 19.07l1.41-1.41" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M17.66 6.34l1.41-1.41" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M21 12.6A8.5 8.5 0 0 1 11.4 3a6.7 6.7 0 1 0 9.6 9.6Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function ThemeToggle({ className }: { className?: string }) {
  const [theme, setTheme] = useState<Theme>("light");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const stored = readStoredTheme();
    const resolved = stored ?? "light";
    setTheme(resolved);

    document.documentElement.dataset.theme = resolved;
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;

    document.documentElement.dataset.theme = theme;
    writeStoredTheme(theme);
  }, [theme, hydrated]);

  const nextTheme: Theme = theme === "light" ? "dark" : "light";

  return (
    <button
      type="button"
      className={className}
      onClick={() => setTheme(nextTheme)}
      aria-pressed={theme === "dark"}
      aria-label={`Switch to ${nextTheme} mode`}
    >
      {theme === "dark" ? <MoonIcon /> : <SunIcon />}
    </button>
  );
}

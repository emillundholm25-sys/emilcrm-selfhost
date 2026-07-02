"use client";

import { create } from "zustand";

// Light / dark / system theme. The `.dark` class on <html> is the single source
// of truth for styling (see globals.css); this store drives the toggle UI and
// keeps the class in sync. A blocking script in layout.tsx applies the saved
// theme before first paint, so there's no flash.

export type Theme = "light" | "dark" | "system";

const KEY = "emilcrm-theme";

function systemPrefersDark(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;
}

/** Resolve the theme to a boolean and toggle the `.dark` class on <html>. */
function applyTheme(theme: Theme): void {
  if (typeof document === "undefined") return;
  const dark = theme === "dark" || (theme === "system" && systemPrefersDark());
  document.documentElement.classList.toggle("dark", dark);
}

interface ThemeState {
  theme: Theme;
  setTheme: (t: Theme) => void;
}

export const useTheme = create<ThemeState>((set) => ({
  // Default matches the server render (no class); initTheme() upgrades it on mount.
  theme: "system",
  setTheme: (theme) => {
    try {
      localStorage.setItem(KEY, theme);
    } catch {}
    applyTheme(theme);
    set({ theme });
  },
}));

let mediaBound = false;

/** Resolve the saved theme on the client (after mount) and watch system changes. */
export function initTheme(): void {
  let theme: Theme = "system";
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === "light" || saved === "dark" || saved === "system") theme = saved;
  } catch {}
  applyTheme(theme);
  if (theme !== useTheme.getState().theme) useTheme.setState({ theme });

  if (!mediaBound && typeof window !== "undefined") {
    mediaBound = true;
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
      if (useTheme.getState().theme === "system") applyTheme("system");
    });
  }
}

import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from "react";

type ThemeMode = "dark" | "light";
const STORAGE_KEY = "santosha-theme";

interface ThemeContextValue {
  mode: ThemeMode;
  toggle: () => void;
  setMode: (m: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(() => {
    if (typeof window === "undefined") return "dark";
    return (localStorage.getItem(STORAGE_KEY) as ThemeMode) || "dark";
  });

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("theme-light", mode === "light");
    localStorage.setItem(STORAGE_KEY, mode);
  }, [mode]);

  const setMode = useCallback((m: ThemeMode) => setModeState(m), []);
  const toggle = useCallback(() => setModeState((m) => (m === "dark" ? "light" : "dark")), []);

  return (
    <ThemeContext.Provider value={{ mode, toggle, setMode }}>{children}</ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}

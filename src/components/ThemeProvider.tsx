import { createContext, useContext, useEffect, useLayoutEffect, useState, useSyncExternalStore } from "react"

type Theme = "dark" | "light" | "system"
type ResolvedTheme = Exclude<Theme, "system">

function readPreference(key: string, fallback: Theme): Theme {
  try {
    const saved = localStorage.getItem(key)
    if (saved === "dark" || saved === "light" || saved === "system") return saved
  } catch { /* Storage may be unavailable in private browsing. */ }
  return fallback
}

const preference = window.matchMedia("(prefers-color-scheme: dark)")
function subscribe(listener: () => void) {
  preference.addEventListener("change", listener)
  return () => preference.removeEventListener("change", listener)
}

const ThemeContext = createContext<{
  theme: Theme
  resolvedTheme: ResolvedTheme
  setTheme: (theme: Theme) => void
} | null>(null)

export function ThemeProvider({ children, defaultTheme = "dark", storageKey = "vite-ui-theme" }: {
  children: React.ReactNode
  defaultTheme?: Theme
  storageKey?: string
}) {
  const [theme, setPreference] = useState(() => readPreference(storageKey, defaultTheme))
  const prefersDark = useSyncExternalStore(subscribe, () => preference.matches)
  const resolvedTheme = theme === "system" ? (prefersDark ? "dark" : "light") : theme

  useLayoutEffect(() => {
    const root = document.documentElement
    root.classList.toggle("dark", resolvedTheme === "dark")
    root.classList.toggle("light", resolvedTheme === "light")
    document.querySelector('meta[name="theme-color"]')?.setAttribute(
      "content", getComputedStyle(root).getPropertyValue("--background").trim()
    )
  }, [resolvedTheme])

  useEffect(() => {
    function sync(event: StorageEvent) {
      if (event.key === storageKey || event.key === null) setPreference(readPreference(storageKey, defaultTheme))
    }
    window.addEventListener("storage", sync)
    return () => window.removeEventListener("storage", sync)
  }, [defaultTheme, storageKey])

  function setTheme(next: Theme) {
    setPreference(next)
    try { localStorage.setItem(storageKey, next) } catch { /* Apply the choice for this session. */ }
  }

  return <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme }}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) throw new Error("useTheme must be used within a ThemeProvider")
  return context
}

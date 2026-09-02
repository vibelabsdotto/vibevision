"use client";

import { useEffect, useState } from "react";

const THEME_INIT = `(function(){try{var t=localStorage.getItem("vv-theme");if(!t){t=window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";}if(t==="dark"){document.documentElement.classList.add("dark");}}catch(e){}})();`;

export function ThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />;
}

function apply(theme: "light" | "dark") {
  document.documentElement.classList.toggle("dark", theme === "dark");
  try {
    localStorage.setItem("vv-theme", theme);
  } catch {
    // ignore storage failures (private mode)
  }
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setTheme(document.documentElement.classList.contains("dark") ? "dark" : "light");
  }, []);

  return (
    <button
      aria-label="Toggle color theme"
      className="flex h-8 w-8 items-center justify-center rounded-[12px] border border-border text-ink-2 transition hover:border-teal hover:text-teal"
      onClick={() => {
        const next = theme === "dark" ? "light" : "dark";
        setTheme(next);
        apply(next);
      }}
      suppressHydrationWarning
      type="button"
    >
      <span aria-hidden className="text-sm">
        {mounted ? (theme === "dark" ? "☀" : "☾") : "☾"}
      </span>
    </button>
  );
}
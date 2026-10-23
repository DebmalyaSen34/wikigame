"use client";

import { setThemePref, useResolvedTheme, useThemePref, type ThemePref } from "@/lib/theme";

const NEXT: Record<ThemePref, ThemePref> = { system: "light", light: "dark", dark: "system" };
const LABEL: Record<ThemePref, string> = { system: "System", light: "Light", dark: "Dark" };

// One button that cycles System → Light → Dark.
export function ThemeToggle({ className = "" }: { className?: string }) {
  const pref = useThemePref();
  useResolvedTheme(); // keeps other tabs in sync
  const next = NEXT[pref];
  return (
    <button
      type="button"
      onClick={() => setThemePref(next)}
      className={`btn-secondary h-9 w-9 shrink-0 px-0 ${className}`}
      title={`Theme: ${LABEL[pref]} (switch to ${LABEL[next]})`}
      aria-label={`Theme: ${LABEL[pref]}. Switch to ${LABEL[next]}`}
    >
      <Icon pref={pref} />
    </button>
  );
}

function Icon({ pref }: { pref: ThemePref }) {
  const common = {
    width: 18,
    height: 18,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  if (pref === "light") {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
      </svg>
    );
  }
  if (pref === "dark") {
    return (
      <svg {...common}>
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <rect x="2" y="4" width="20" height="13" rx="2" />
      <path d="M8 21h8M12 17v4" />
    </svg>
  );
}

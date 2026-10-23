"use client";

import { useEffect, useSyncExternalStore } from "react";
import { DAY_CLASS, NIGHT_CLASS, THEME_KEY } from "./themeScript";

// Light / Dark / System, remembered per browser. The resolved theme lives on
// <html> as data-theme="light|dark", plus Wikipedia's own day/night class so
// the night-mode rules some article styles ship with switch on too.

export type ThemePref = "system" | "light" | "dark";
const KEY = THEME_KEY;
const EVENT = "wikigame-theme";
const NIGHT = NIGHT_CLASS;
const DAY = DAY_CLASS;

function readPref(): ThemePref {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

function apply(pref: ThemePref) {
  const dark = pref === "dark" || (pref === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  const root = document.documentElement;
  root.dataset.theme = dark ? "dark" : "light";
  root.classList.toggle(NIGHT, dark);
  root.classList.toggle(DAY, !dark);
  window.dispatchEvent(new Event(EVENT));
}

export function setThemePref(pref: ThemePref) {
  try {
    localStorage.setItem(KEY, pref);
  } catch {}
  apply(pref);
}

function subscribe(onChange: () => void) {
  const media = matchMedia("(prefers-color-scheme: dark)");
  const onSystem = () => {
    if (readPref() === "system") apply("system"); // follows the OS while on System
  };
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onChange);
  media.addEventListener("change", onSystem);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onChange);
    media.removeEventListener("change", onSystem);
  };
}

export function useThemePref(): ThemePref {
  return useSyncExternalStore(subscribe, readPref, () => "system");
}

// The theme actually showing: "light" or "dark".
export function useResolvedTheme(): "light" | "dark" {
  const theme = useSyncExternalStore(
    subscribe,
    () => (document.documentElement.dataset.theme === "dark" ? "dark" : "light"),
    () => "light" as const,
  );
  // Another tab changed the setting: apply it here too.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => e.key === KEY && apply(readPref());
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);
  return theme;
}

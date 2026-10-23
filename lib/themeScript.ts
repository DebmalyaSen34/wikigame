// Shared by the <head> script (server-rendered) and lib/theme.ts (client).
export const THEME_KEY = "wikigame:theme";
export const NIGHT_CLASS = "skin-theme-clientpref-night";
export const DAY_CLASS = "skin-theme-clientpref-day";

// Inlined into <head> so the saved theme is applied before the first paint (no flash).
export const themeInitScript = `(function(){try{var p=localStorage.getItem(${JSON.stringify(THEME_KEY)})||"system";var d=p==="dark"||(p!=="light"&&matchMedia("(prefers-color-scheme: dark)").matches);var r=document.documentElement;r.dataset.theme=d?"dark":"light";r.classList.add(d?${JSON.stringify(NIGHT_CLASS)}:${JSON.stringify(DAY_CLASS)})}catch(e){}})()`;

// Readability safety net for article HTML, in both themes.
//
// Wikipedia templates hardcode colours: light boxes that stay white in our
// dark theme, and dark boxes (party colours, navy sidebars) that our links and
// text disappear into in either theme. The stylesheet handles the common
// cases; this checks what actually rendered and fixes the rest:
//
// - Dark theme only: blocks still on a near-white background get
//   `wg-light-bg`, and near-black text gets `wg-dark-text`. Boxes Wikipedia
//   deliberately keeps light in night mode (`.notheme`, e.g. map labels) are
//   left alone.
// - Both themes: any link or table text below 4.5:1 against what's behind it
//   gets `wg-ink-light` or `wg-ink-dark`, whichever reads better there.

const BLOCKS = "table,thead,tbody,tfoot,tr,th,td,caption,div,center,dl,dt,dd,ul,ol,li,p,blockquote";
const TEXT = "a[data-wiki],th,td,caption";
const MIN_CONTRAST = 4.5;
const MARKS = ["wg-light-bg", "wg-dark-text", "wg-ink-light", "wg-ink-dark"];

// The colours behind the wg-ink-* classes (see globals.css).
const INK_LIGHT = 0.88; // luminance of #f3f2ee
const INK_DARK = 0.012; // luminance of #1c1b19

type Rgba = [number, number, number, number];

function parseRgb(c: string): Rgba | null {
  const m = c.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+))?/);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3]), m[4] === undefined ? 1 : Number(m[4])] : null;
}

// Relative luminance, 0 (black) to 1 (white).
function luminance([r, g, b]: Rgba) {
  const lin = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

const contrast = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

export function clearContrastFix(root: HTMLElement) {
  root.querySelectorAll(MARKS.map((m) => `.${m}`).join(",")).forEach((el) => el.classList.remove(...MARKS));
}

export function applyContrastFix(root: HTMLElement, theme: "light" | "dark") {
  clearContrastFix(root);

  if (theme === "dark") {
    // Read everything first, then write, so styles are computed once.
    const marks: [Element, boolean, boolean][] = [];
    root.querySelectorAll(BLOCKS).forEach((el) => {
      if (el.closest(".notheme")) return;
      const cs = getComputedStyle(el);
      const bg = parseRgb(cs.backgroundColor);
      const fg = parseRgb(cs.color);
      const lightBg = !!bg && bg[3] > 0.5 && luminance(bg) > 0.6;
      const darkText = !!fg && luminance(fg) < 0.12;
      if (lightBg || darkText) marks.push([el, lightBg, darkText]);
    });
    for (const [el, lightBg, darkText] of marks) {
      if (lightBg) el.classList.add("wg-light-bg");
      if (darkText) el.classList.add("wg-dark-text");
    }
  }

  // Effective background luminance: the nearest ancestor with a solid background.
  const pageBg = luminance(parseRgb(getComputedStyle(document.body).backgroundColor) ?? [255, 255, 255, 1]);
  const bgCache = new Map<Element, number>();
  const bgLum = (el: Element | null): number => {
    if (!el) return pageBg;
    const hit = bgCache.get(el);
    if (hit !== undefined) return hit;
    const bg = parseRgb(getComputedStyle(el).backgroundColor);
    const lum = bg && bg[3] > 0.5 ? luminance(bg) : el === root ? pageBg : bgLum(el.parentElement);
    bgCache.set(el, lum);
    return lum;
  };

  const fixes: [Element, string][] = [];
  root.querySelectorAll(TEXT).forEach((el) => {
    if (!el.textContent?.trim()) return;
    const fg = parseRgb(getComputedStyle(el).color);
    if (!fg) return;
    const bg = bgLum(el);
    if (contrast(luminance(fg), bg) >= MIN_CONTRAST) return;
    fixes.push([el, contrast(INK_LIGHT, bg) >= contrast(INK_DARK, bg) ? "wg-ink-light" : "wg-ink-dark"]);
  });
  for (const [el, cls] of fixes) el.classList.add(cls);
}

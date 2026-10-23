// The public address friends should open. Set NEXT_PUBLIC_SITE_URL if the
// site moves (for example to a custom domain).
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://wikigame-indol.vercel.app").replace(/\/$/, "");

// Link to share for a room. On any *.vercel.app address (production or a
// preview deployment, which friends usually can't open) it's the public site;
// anywhere else, such as localhost or a LAN address while testing, it's the
// current origin, because that's where the room actually lives.
export function roomShareUrl(roomId: string, origin: string): string {
  let host = "";
  try {
    host = new URL(origin).hostname;
  } catch {}
  const base = !host || host.endsWith(".vercel.app") ? SITE_URL : origin;
  return `${base}/r/${roomId}`;
}

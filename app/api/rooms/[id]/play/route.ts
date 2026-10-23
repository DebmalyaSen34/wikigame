import { DIFFICULTIES } from "@/lib/game";
import { incomingLinks } from "@/lib/distance";
import { store } from "@/lib/store";
import { getArticle, normalizeTitle } from "@/lib/wiki";
import { withErrors } from "@/lib/api";

// POST /api/rooms/:id/play { token, action, to? }
//   action "state"  -> current page (used on load / resume)
//   action "click"  -> follow a link on the current page (+1 click)
//   action "back"   -> return to the previous page (+1 click, free on Easy, refused on Hard)
//   action "giveup" -> stop playing
//
// The server owns the game state: a click is only accepted if the target is
// actually linked from the player's current page, so URL hacking can't skip ahead,
// and the room's difficulty rules are enforced here rather than just hidden in the UI.
export const POST = withErrors(async function POST(req: Request, ctx: RouteContext<"/api/rooms/[id]/play">) {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const room = await store.getRoom(id.toUpperCase());
  if (!room) return Response.json({ error: "Room not found" }, { status: 404 });
  const player = body.token ? await store.getPlayer(room.id, String(body.token)) : null;
  if (!player) return Response.json({ error: "You haven't joined this room" }, { status: 403 });

  const action = String(body.action ?? "state");
  const rules = DIFFICULTIES[room.difficulty ?? "normal"];
  if (action !== "state" && player.status !== "playing") {
    return Response.json({ error: "Your game is already over" }, { status: 409 });
  }

  try {
    if (action === "click") {
      const current = await getArticle(player.path.at(-1)!);
      const to = normalizeTitle(String(body.to ?? ""));
      if (!current.links.includes(to)) {
        return Response.json({ error: "That link isn't on your current page" }, { status: 400 });
      }
      const next = await getArticle(to);
      player.path.push(next.title);
      player.stack.push(next.title);
      player.clicks++;
      if (next.title === room.end) {
        player.status = "finished";
        player.finishedAt = Date.now();
      }
      await store.savePlayer(room.id, player);
    } else if (action === "back") {
      if (!rules.backAllowed) {
        return Response.json({ error: `There's no going back in ${rules.label} mode` }, { status: 403 });
      }
      if (player.stack.length < 2) return Response.json({ error: "Nowhere to go back to" }, { status: 400 });
      player.stack.pop();
      player.path.push(player.stack.at(-1)!);
      player.backAt = [...(player.backAt ?? []), player.path.length - 1];
      if (rules.backCosts) player.clicks++;
      await store.savePlayer(room.id, player);
    } else if (action === "giveup") {
      player.status = "gaveup";
      player.finishedAt = Date.now();
      await store.savePlayer(room.id, player);
    }

    const article = await getArticle(player.path.at(-1)!);
    return Response.json({
      me: { ...player, token: undefined },
      article: { title: article.title, displayTitle: article.displayTitle, html: article.html },
      hints: rules.hints && player.status === "playing" ? await hintsFor(article.links, room.end) : [],
    });
  } catch {
    return Response.json({ error: "Couldn't load that page from Wikipedia, try again" }, { status: 502 });
  }
});

// Easy mode: links on this page that go to the target, or to a page that links to it.
async function hintsFor(links: string[], end: string): Promise<string[]> {
  try {
    const incoming = await incomingLinks(end);
    return links.filter((l) => l === end || incoming.titles.has(l));
  } catch {
    return []; // hints are a nicety; never fail a click over them
  }
}

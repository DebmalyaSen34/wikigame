import { store } from "@/lib/store";
import { getArticle, normalizeTitle } from "@/lib/wiki";

// POST /api/rooms/:id/play { token, action, to? }
//   action "state"  -> current page (used on load / resume)
//   action "click"  -> follow a link on the current page (+1 click)
//   action "back"   -> return to the previous page (+1 click, like the classic rules)
//   action "giveup" -> stop playing
//
// The server owns the game state: a click is only accepted if the target is
// actually linked from the player's current page, so URL hacking can't skip ahead.
export async function POST(req: Request, ctx: RouteContext<"/api/rooms/[id]/play">) {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const room = await store.getRoom(id.toUpperCase());
  if (!room) return Response.json({ error: "Room not found" }, { status: 404 });
  const player = body.token ? await store.getPlayer(room.id, String(body.token)) : null;
  if (!player) return Response.json({ error: "You haven't joined this room" }, { status: 403 });

  const action = String(body.action ?? "state");
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
      if (player.stack.length < 2) return Response.json({ error: "Nowhere to go back to" }, { status: 400 });
      player.stack.pop();
      player.path.push(player.stack.at(-1)!);
      player.clicks++;
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
    });
  } catch {
    return Response.json({ error: "Couldn't load that page from Wikipedia, try again" }, { status: 502 });
  }
}

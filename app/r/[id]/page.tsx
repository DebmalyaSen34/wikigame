import { Suspense } from "react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { DIFFICULTIES } from "@/lib/game";
import { store } from "@/lib/store";
import { Lobby } from "./Lobby";

// What chat apps show when someone pastes a room link.
export async function generateMetadata({ params }: PageProps<"/r/[id]">): Promise<Metadata> {
  const { id } = await params;
  const room = await store.getRoom(id.toUpperCase()).catch(() => null);
  if (!room) return { title: "WikiRace", robots: { index: false } };

  const title = `${room.start} → ${room.end} · WikiRace`;
  const description = `${room.createdBy} challenged you: get from ${room.start} to ${room.end} using only Wikipedia links. ${
    DIFFICULTIES[room.difficulty ?? "normal"].label
  } mode, fewest clicks wins.`;
  const image = room.endInfo.thumbnail ?? room.startInfo.thumbnail;
  return {
    title,
    description,
    robots: { index: false },
    openGraph: { title, description, url: `/r/${room.id}`, images: image ? [image] : undefined },
    twitter: { card: image ? "summary_large_image" : "summary", title, description },
  };
}

// The metadata above reads the room at request time; this marks that as intended
// while the rest of the page shell still prerenders.
async function Connection() {
  await connection();
  return null;
}

export default function RoomPage() {
  return (
    <>
      <Suspense>
        <Lobby />
      </Suspense>
      <Suspense>
        <Connection />
      </Suspense>
    </>
  );
}

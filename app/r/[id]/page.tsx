import { Suspense } from "react";
import { Lobby } from "./Lobby";

export default function RoomPage() {
  return (
    <Suspense>
      <Lobby />
    </Suspense>
  );
}

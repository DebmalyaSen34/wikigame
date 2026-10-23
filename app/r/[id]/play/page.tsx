import { Suspense } from "react";
import { Play } from "./Play";

export default function PlayPage() {
  return (
    <Suspense>
      <Play />
    </Suspense>
  );
}

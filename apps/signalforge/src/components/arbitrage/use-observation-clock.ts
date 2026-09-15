"use client";
import { useEffect, useState } from "react";
import type { TaskOpportunity } from "@/domain/intelligence";

/** Local expiry checks only. Never polls sources or calls a model. */
export function useObservationClock(
  initialTime: number,
  tasks: TaskOpportunity[],
) {
  const [now, setNow] = useState(initialTime);
  const boundaries = tasks
    .flatMap((task) => [task.deadline, task.demandState?.scoringEndsAt])
    .filter(Boolean)
    .join("|");
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const update = () => {
      clearTimeout(timer);
      const time = Date.now();
      setNow(time);
      const next = Math.min(
        ...boundaries
          .split("|")
          .map((value) => Date.parse(value))
          .filter((value) => Number.isFinite(value) && value > time),
      );
      if (Number.isFinite(next))
        timer = setTimeout(update, Math.min(next - time + 1, 2147483647));
    };
    timer = setTimeout(update, 0);
    window.addEventListener("focus", update);
    document.addEventListener("visibilitychange", update);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("focus", update);
      document.removeEventListener("visibilitychange", update);
    };
  }, [boundaries]);
  return now;
}

import { useSyncExternalStore } from "react";

export const reduceMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// True on the stacked phone layout, where the guru is framed close.
const narrow = window.matchMedia("(max-width: 820px)");
export const useNarrow = () =>
  useSyncExternalStore(
    (notify) => {
      narrow.addEventListener("change", notify);
      return () => narrow.removeEventListener("change", notify);
    },
    () => narrow.matches,
  );

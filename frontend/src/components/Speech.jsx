import { useEffect, useState } from "react";

import { reduceMotion } from "../lib/viewport";

// The guru's speech bubble. Types each line out a few letters at a time; key it
// by the text so every new line starts from its first letter. Decorative: what
// he says is always also on the page.
export default function Speech({ text }) {
  const [count, setCount] = useState(() => (reduceMotion() ? text.length : 0));
  useEffect(() => {
    if (count >= text.length) return undefined;
    const timer = setTimeout(() => setCount((value) => value + 2), 18);
    return () => clearTimeout(timer);
  }, [count, text.length]);
  return (
    <p className="gc-speech" aria-hidden="true">
      {text.slice(0, count)}
      <span className="gc-speech-rest">{text.slice(count)}</span>
    </p>
  );
}

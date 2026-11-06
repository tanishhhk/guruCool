import { useEffect, useRef } from "react";

const LENGTH = 6;

// Six boxes for an emailed code. Typing moves forward, backspace moves back,
// and pasting a whole code fills every box at once.
export default function CodeInput({ value, onChange, onComplete, disabled = false, label = "6-digit code" }) {
  const boxes = useRef([]);
  const digits = Array.from({ length: LENGTH }, (_, index) => value[index] ?? "");

  useEffect(() => {
    boxes.current[0]?.focus();
  }, []);

  const set = (next) => {
    const clean = next.replace(/\D/g, "").slice(0, LENGTH);
    onChange(clean);
    if (clean.length === LENGTH) onComplete?.(clean);
    return clean;
  };

  return (
    <div className="code-input" role="group" aria-label={label}>
      {digits.map((digit, index) => (
        <input
          key={index}
          ref={(element) => {
            boxes.current[index] = element;
          }}
          className="code-box"
          inputMode="numeric"
          autoComplete={index === 0 ? "one-time-code" : "off"}
          aria-label={`Digit ${index + 1} of ${LENGTH}`}
          maxLength={LENGTH}
          value={digit}
          disabled={disabled}
          onChange={(event) => {
            const typed = event.target.value.replace(/\D/g, "");
            if (!typed) return;
            if (typed.length > 1) {
              // A paste, or the phone filling the code in from a message.
              const filled = set(value.slice(0, index) + typed);
              boxes.current[Math.min(filled.length, LENGTH - 1)]?.focus();
              return;
            }
            set(value.slice(0, index) + typed + value.slice(index + 1));
            boxes.current[index + 1]?.focus();
          }}
          onKeyDown={(event) => {
            if (event.key === "Backspace") {
              event.preventDefault();
              if (digit) set(value.slice(0, index) + value.slice(index + 1));
              else if (index > 0) {
                set(value.slice(0, index - 1) + value.slice(index));
                boxes.current[index - 1]?.focus();
              }
            } else if (event.key === "ArrowLeft" && index > 0) boxes.current[index - 1]?.focus();
            else if (event.key === "ArrowRight" && index < LENGTH - 1) boxes.current[index + 1]?.focus();
          }}
          onFocus={(event) => event.target.select()}
        />
      ))}
    </div>
  );
}

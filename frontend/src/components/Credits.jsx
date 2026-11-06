import { Lock } from "lucide-react";

import { creditsLeft, resetIn } from "../lib/credits";

const KINDS = [
  ["question", "Questions"],
  ["story", "Video credits"],
  ["upload", "Uploads"],
];

// Three thin bars on the shelf: what is left of today's allowance.
export function CreditsMeter({ usage, onPlans }) {
  if (!usage) return null;
  return (
    <div className="credits" aria-label="Today's credits">
      <div className="credits-head">
        <span>{usage.plan?.label ?? "Free"} plan, today</span>
        <button type="button" className="credits-plans" onClick={onPlans}>See plans</button>
      </div>
      <ul className="credits-list">
        {KINDS.map(([kind, label]) => {
          const left = creditsLeft(usage, kind);
          const share = usage.limits[kind] ? left / usage.limits[kind] : 0;
          return (
            <li key={kind} className={left === 0 ? "is-empty" : ""}>
              <span className="credits-label">
                <span>{label}</span>
                <span>{left} of {usage.limits[kind]}</span>
              </span>
              <span className="credits-track" aria-hidden="true">
                <span style={{ transform: `scaleX(${share})` }} />
              </span>
            </li>
          );
        })}
      </ul>
      <p className="credits-reset">Refills in {resetIn(usage.resets_in_seconds)}</p>
    </div>
  );
}

const MESSAGES = {
  question: (limit) => `You have asked today's ${limit} questions.`,
  story: (limit) => `You have used today's ${limit} video credits.`,
  upload: (limit) => `You have uploaded today's ${limit} documents.`,
};

// Shown in place of a control whose credits have run out.
export function OutOfCredits({ kind, usage, onPlans, note }) {
  return (
    <div className="out-of-credits" role="status">
      <Lock size={18} strokeWidth={1.75} aria-hidden="true" />
      <p>
        {MESSAGES[kind](usage.limits[kind])} More in {resetIn(usage.resets_in_seconds)}.
        {note ? ` ${note}` : ""}
      </p>
      {onPlans && (
        <button type="button" className="button button-quiet" onClick={onPlans}>
          See plans
        </button>
      )}
    </div>
  );
}

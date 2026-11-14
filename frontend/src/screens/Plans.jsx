import { useEffect, useState } from "react";
import { Check } from "lucide-react";

import { api } from "../api";
import { LENGTHS } from "../lib/voices";

const LENGTH_NAMES = Object.fromEntries(LENGTHS.map(([id, title]) => [id, title]));

// The plans side by side. Nothing is sold yet: Plus and Pro say what they will unlock.
export default function Plans({ usage }) {
  const [plans, setPlans] = useState(null);
  const [error, setError] = useState("");
  const current = usage?.plan?.id ?? "free";

  useEffect(() => {
    api("/plans").then(setPlans).catch((failure) => setError(failure.message));
  }, []);

  return (
    <div className="settings plans">
      <h1>Plans</h1>
      <p className="profile-note">
        guruCool is free while it grows. Each day you get a fresh set of credits. Plans with more questions, more and longer videos and a bigger shelf are on the way.
      </p>
      {error && <p className="field-error" role="alert">{error}</p>}
      {plans && (
        <ul className="plan-grid">
          {plans.map((plan) => {
            const mine = plan.id === current;
            return (
              <li key={plan.id} className={`plan${mine ? " is-mine" : ""}`}>
                <h2>{plan.label}</h2>
                <p className="plan-price">{mine ? "Your plan" : plan.price_note}</p>
                <ul className="plan-features">
                  <li><Check size={16} strokeWidth={2} aria-hidden="true" /> {plan.daily.question} questions a day</li>
                  <li><Check size={16} strokeWidth={2} aria-hidden="true" /> {plan.daily.story} video credits a day</li>
                  <li><Check size={16} strokeWidth={2} aria-hidden="true" /> {plan.daily.upload} uploads a day</li>
                  <li><Check size={16} strokeWidth={2} aria-hidden="true" /> {plan.max_documents} documents on your shelf</li>
                  <li>
                    <Check size={16} strokeWidth={2} aria-hidden="true" /> Videos: {plan.story_depths.map((id) => LENGTH_NAMES[id]).join(", ")}
                  </li>
                </ul>
                <button type="button" className={`button ${mine ? "button-quiet" : "button-primary"}`} disabled>
                  {mine ? "Current plan" : "Coming soon"}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <p className="profile-note">A Short video costs 1 credit, Detailed 2 and Deep dive 3. Credits refill every day at midnight UTC.</p>
    </div>
  );
}

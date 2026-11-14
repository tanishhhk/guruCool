import { useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BookOpenText,
  BriefcaseBusiness,
  ChartLine,
  ClipboardList,
  Compass,
  Cpu,
  GraduationCap,
  Microscope,
  NotebookPen,
  Presentation,
  Scale,
} from "lucide-react";

import { api } from "../api";
import Guru from "../components/Guru";
import { Logo } from "../components/Logo";
import Speech from "../components/Speech";
import UploadBox from "../components/UploadBox";
import { EXPLORE, FOCUS, PROFESSIONS, focusPhrase, professionOf } from "../lenses";
import { firstName } from "../lib/people";
import { useNarrow } from "../lib/viewport";

const ICONS = {
  student: GraduationCap,
  professor: BookOpenText,
  employee: BriefcaseBusiness,
  exam: NotebookPen,
  research: Microscope,
  teaching: Presentation,
  legal: Scale,
  finance: ChartLine,
  engineering: Cpu,
  general: ClipboardList,
  explore: Compass,
};

// What the guru says when a choice is pointed at or focused. Decorative: the card says it too.
const ASIDES = {
  student: "A student. Exams or a thesis, bring me the chapters.",
  professor: "A professor. Let us get the next lecture ready.",
  employee: "A professional. Contracts, reports, manuals: I read them all.",
  exam: "Exam prep. I will point out what is likely to be asked.",
  research: "Research. Methods, evidence and limits, every page cited.",
  teaching: "Teaching. The core ideas in order, with examples for class.",
  legal: "Legal work. Obligations, deadlines and risks come first.",
  finance: "Finance. The numbers, the trend and the risks.",
  engineering: "Engineering. Requirements, steps and settings.",
  general: "Plain summaries you can act on. A wise choice.",
  explore: "Just looking around? Welcome. Videos stay with the other choices.",
};

const STEPS = 4;

function Choice({ id, label, line, selected, quiet, onSelect, onHint }) {
  const Icon = ICONS[id];
  return (
    <button
      type="button"
      className={`choice${selected ? " is-selected" : ""}${quiet ? " choice-quiet" : ""}`}
      aria-pressed={selected}
      onClick={onSelect}
      onPointerEnter={() => onHint(id)}
      onPointerLeave={() => onHint(null)}
      onFocus={() => onHint(id)}
      onBlur={() => onHint(null)}
    >
      {Icon && (
        <span className="choice-icon" aria-hidden="true">
          <Icon size={22} strokeWidth={1.75} />
        </span>
      )}
      <span className="choice-text">
        <span className="choice-label">
          <span className={selected ? "hl" : ""}>{label}</span>
        </span>
        <span className="choice-line">{line}</span>
      </span>
    </button>
  );
}

// Four short steps: your name, who you are, what you need, your first document.
export default function Onboarding({ user, onDone, onSkip }) {
  const [step, setStep] = useState(() => (user.profession ? 3 : user.display_name ? 1 : 0));
  const [name, setName] = useState(user.display_name || "");
  const [profession, setProfession] = useState(user.profession);
  const [focus, setFocus] = useState(user.focus);
  const [hint, setHint] = useState(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const close = useNarrow();
  const chosen = professionOf(profession);
  const first = name.trim().split(/\s+/)[0] || firstName(user) || "";

  const go = (next) => {
    setHint(null);
    setError("");
    setStep(next);
  };

  const saveName = async (event) => {
    event.preventDefault();
    const value = name.trim();
    if (!value) {
      setError("Enter the name you would like us to use.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await api("/account", { method: "PATCH", body: { display_name: value } });
      onDone({ ...user, display_name: value }, null, false);
      go(1);
    } catch (failure) {
      setError(failure.message);
    } finally {
      setSaving(false);
    }
  };

  const saveFocus = async (value) => {
    setFocus(value);
    setSaving(true);
    setError("");
    try {
      const saved = await api("/auth/me/profile", { method: "PUT", body: { profession, focus: value } });
      onDone(saved, null, false);
      go(3);
    } catch (failure) {
      setError(failure.message);
    } finally {
      setSaving(false);
    }
  };

  let speech;
  if (hint) speech = ASIDES[hint];
  else if (step === 0) speech = name.trim() ? `${name.trim().split(/\s+/)[0]}. A fine name for a seeker.` : "Namaste. Before we begin, what should I call you?";
  else if (step === 1) speech = first ? `Tell me about yourself, ${first}.` : "Tell me about yourself.";
  else if (step === 2) speech = "And what will you use me for most?";
  else speech = first ? `Now bring me a document, ${first}. Any text PDF will do.` : "Now bring me a document. Any text PDF will do.";

  const purposes = chosen ? chosen.focuses.filter((id) => id !== EXPLORE) : [];

  return (
    <main className="onb">
      <section className="gc-stage">
        <Speech key={speech} text={speech} />
        <Guru mood={saving ? "bliss" : error ? "oops" : "watch"} close={close} />
      </section>

      <section className="onb-paper">
        <header className="onb-top">
          <Logo size={30} />
          <div className="onb-progress" role="img" aria-label={`Step ${step + 1} of ${STEPS}`}>
            {Array.from({ length: STEPS }, (_, index) => (
              <span key={index} className={index <= step ? "is-done" : ""} />
            ))}
            <span className="folio">{step + 1} of {STEPS}</span>
          </div>
        </header>

        <div className="onb-step" key={step} aria-live="polite">
          {step === 0 && (
            <form className="onb-name" onSubmit={saveName} noValidate>
              <h1>What should we call you?</h1>
              <p className="onboarding-lede">Your name for greetings on your desk. You can change it in your profile.</p>
              <div className="field">
              <label htmlFor="onb-name">Your name</label>
              <input
                id="onb-name"
                className="input"
                value={name}
                onChange={(event) => {
                  setName(event.target.value);
                  setError("");
                }}
                maxLength={60}
                autoComplete="given-name"
                autoFocus
                aria-invalid={Boolean(error)}
                aria-describedby={error ? "onb-name-error" : undefined}
              />
              {error && <p className="field-error" id="onb-name-error" role="alert">{error}</p>}
              </div>
              <button type="submit" className="button button-primary onb-next" disabled={saving}>
                Continue <ArrowRight size={18} strokeWidth={2} aria-hidden="true" />
              </button>
            </form>
          )}

          {step === 1 && (
            <>
              <button type="button" className="onboarding-back" onClick={() => go(0)}>
                <ArrowLeft size={16} strokeWidth={1.75} aria-hidden="true" />
                {first || "Your name"}
              </button>
              <h1>{first ? `Who are you, ${first}?` : "Who are you?"}</h1>
              <p className="onboarding-lede">guruCool suggests questions and tells answers in the way that suits you.</p>
              <div className="choices">
                {PROFESSIONS.map((item) => (
                  <Choice
                    key={item.id}
                    id={item.id}
                    label={item.label}
                    line={item.line}
                    selected={profession === item.id}
                    onHint={setHint}
                    onSelect={() => {
                      setProfession(item.id);
                      setFocus(null);
                      go(2);
                    }}
                  />
                ))}
              </div>
            </>
          )}

          {step === 2 && chosen && (
            <>
              <button type="button" className="onboarding-back" onClick={() => go(1)}>
                <ArrowLeft size={16} strokeWidth={1.75} aria-hidden="true" />
                {chosen.label}
              </button>
              <h1>What will you use it for most?</h1>
              <p className="onboarding-lede">You can change this any time in your profile.</p>
              <div className={`choices${purposes.length > 2 ? " choices-grid" : ""}`}>
                {purposes.map((id) => (
                  <Choice
                    key={id}
                    id={id}
                    label={FOCUS[id].label}
                    line={FOCUS[id].line}
                    selected={focus === id}
                    onHint={setHint}
                    onSelect={() => !saving && saveFocus(id)}
                  />
                ))}
              </div>
              <div className="onb-or">
                <Choice
                  id={EXPLORE}
                  label={FOCUS[EXPLORE].label}
                  line="A free hand to look around. Smaller daily limits, and no videos."
                  selected={focus === EXPLORE}
                  quiet
                  onHint={setHint}
                  onSelect={() => !saving && saveFocus(EXPLORE)}
                />
              </div>
              {error && <p className="field-error" role="alert">{error}</p>}
            </>
          )}

          {step === 3 && (
            <>
              <h1>Bring your first document.</h1>
              <p className="onboarding-lede">
                {(() => {
                  const phrase = focus && focus !== EXPLORE ? focusPhrase(focus) : "work";
                  return `Any text PDF: ${/^[aeiou]/i.test(phrase) ? "an" : "a"} ${phrase} document, a chapter, a contract, a manual. Or start with our sample to see how it works.`;
                })()}
              </p>
              <UploadBox offerSample onReady={(document) => onDone(null, document, true)} />
              <button type="button" className="button button-quiet onboarding-skip" onClick={onSkip}>
                Skip for now, take me to my desk
                <ArrowRight size={18} strokeWidth={1.75} aria-hidden="true" />
              </button>
            </>
          )}
        </div>
      </section>
    </main>
  );
}

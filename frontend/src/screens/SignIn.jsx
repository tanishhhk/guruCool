import { useEffect, useState, useSyncExternalStore } from "react";
import { AlertCircle, Check, Eye, EyeOff, Smartphone } from "lucide-react";

import { api, session } from "../api";
import { ResetStep, VerifyStep } from "../components/AccountSteps";
import Guru from "../components/Guru";
import { Logo } from "../components/Logo";
import PhoneSignIn from "../components/PhoneSignIn";
import { googleIdToken } from "../lib/firebase";
import { friendlyAuthError } from "../lib/firebaseErrors";

// Google's "G", drawn from its four brand colours, as their sign-in guidelines ask.
function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

const MIN_PASSWORD = 12;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const reduceMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// True on the stacked phone layout, where the guru is framed close.
const narrow = window.matchMedia("(max-width: 820px)");
const useNarrow = () =>
  useSyncExternalStore(
    (notify) => {
      narrow.addEventListener("change", notify);
      return () => narrow.removeEventListener("change", notify);
    },
    () => narrow.matches,
  );

// What the guru says. Decorative: every fact here is also in the form's own text.
function line({ stage, creating, focus, email, password, show, busy, troubled, failure }) {
  if (stage === "verify") return "A code is flying to your inbox. Six digits, then you are in.";
  if (stage === "reset") return "Forgotten secrets happen to the wisest. Let us make a new one.";
  if (stage === "phone") return "A phone works too. I will wait for the code.";
  if (busy) return creating ? "Writing your name in my book." : "Opening your library.";
  if (failure) return "Hmm. That did not open the door. Try again?";
  if (troubled) return "Hmm. Read the note under the field and try again.";
  if (focus === "password") {
    if (show) return "Fine. One small peek.";
    if (!creating) return "I am not looking. Promise.";
    const left = MIN_PASSWORD - password.length;
    if (left === 1) return "One more character to fill my halo.";
    if (left > 0) return `${left} more characters to fill my halo.`;
    return mixed(password) ? "Halo full. A strong secret." : "Halo full. A number or symbol would make it stronger.";
  }
  if (focus === "email") {
    if (!email) return "Your email, please. I never forget one.";
    if (/\.(edu|ac\.[a-z]+)$/i.test(email.trim())) return "A student, I sense. Exams soon?";
    return "Go on. I am listening.";
  }
  return creating
    ? "A new seeker. Bring me any PDF and I will answer from its pages."
    : "Welcome back, seeker. Your library missed you.";
}

// Letters plus a number or symbol: a quick sign of a stronger password.
const mixed = (value) => /[a-z]/i.test(value) && /[^a-z]/i.test(value);

// Types the guru's line out a few letters at a time. Keyed by the text, so
// each new line starts from its first letter.
function Speech({ text }) {
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

export default function SignIn({ onSignedIn }) {
  const [mode, setMode] = useState("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [focus, setFocus] = useState(null);
  const [errors, setErrors] = useState({});
  const [failure, setFailure] = useState("");
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState("form"); // form, verify, reset or phone
  const [providers, setProviders] = useState(null);
  const close = useNarrow();
  const creating = mode === "create";
  const troubled = Boolean(failure || errors.email || errors.password);

  const validate = () => {
    const next = {};
    if (!EMAIL.test(email.trim())) next.email = "Enter an email address like name@example.com";
    if (!password) next.password = "Enter your password";
    else if (creating && password.length < MIN_PASSWORD) next.password = `Use at least ${MIN_PASSWORD} characters`;
    else if (new TextEncoder().encode(password).length > 72)
      next.password = "That password is too long. Try a shorter sentence.";
    setErrors(next);
    return !Object.keys(next).length;
  };

  const submit = async (event) => {
    event.preventDefault();
    if (busy || !validate()) return;
    setBusy(true);
    setFailure("");
    const credentials = { email: email.trim(), password };
    try {
      if (creating) {
        const created = await api("/auth/register", { method: "POST", body: credentials });
        if (created.verification_required) {
          setBusy(false);
          setStage("verify");
          return;
        }
      }
      const { access_token: token } = await api("/auth/login", { method: "POST", body: credentials });
      signIn(token);
    } catch (error) {
      setBusy(false);
      // 403: the email is not verified yet, and the API has sent a fresh code.
      if (error.status === 403) setStage("verify");
      else setFailure(error.message);
    }
  };

  const signIn = (token) => {
    session.save(token);
    onSignedIn();
  };

  useEffect(() => {
    api("/auth/providers").then(setProviders).catch(() => {});
  }, []);

  // A Firebase ID token (from Google or a phone) becomes a guruCool sign-in.
  const withFirebase = async (idToken) => {
    const { access_token: token } = await api("/auth/firebase", { method: "POST", body: { id_token: idToken } });
    signIn(token);
  };

  const google = async () => {
    setFailure("");
    setBusy(true);
    try {
      await withFirebase(await googleIdToken(providers.firebase));
    } catch (error) {
      setFailure(friendlyAuthError(error) ?? "");
      setBusy(false);
    }
  };

  const backToForm = () => {
    setStage("form");
    setFailure("");
  };

  const switchTo = (next) => {
    setMode(next);
    setErrors({});
    setFailure("");
  };

  const edit = (setter, field) => (event) => {
    setter(event.target.value);
    if (errors[field] || failure) {
      setErrors((current) => ({ ...current, [field]: undefined }));
      setFailure("");
    }
  };

  let mood = "watch";
  if (busy) mood = "bliss";
  else if (troubled) mood = "oops";
  else if (focus === "password") mood = show ? "peek" : "shy";

  // While the email is typed, his eyes follow the text along the field.
  const look = focus === "email" ? { x: 0.35 + Math.min(1, email.length / 28) * 0.65, y: 0.45 } : null;
  const speech = line({ stage, creating, focus, email, password, show, busy, troubled, failure });
  const lit = creating ? Math.min(4, Math.floor(password.length / (MIN_PASSWORD / 4))) : 4;
  const passwordNote = errors.password
    ? null
    : creating
      ? password.length >= MIN_PASSWORD
        ? mixed(password)
          ? "Long enough, with a good mix."
          : "Long enough. Adding a number or symbol makes it stronger."
        : `At least ${MIN_PASSWORD} characters. A short sentence works well.`
      : null;

  return (
    <main className="gc-signin">
      <section className="gc-stage">
        <Speech key={speech} text={speech} />
        <Guru mood={mood} look={look} lit={lit} close={close} />
      </section>

      <section className="gc-panel">
        <Logo size={30} className="gc-logo" />
        <div className="gc-panel-inner">
          {stage === "verify" && <VerifyStep email={email.trim()} onToken={signIn} onBack={backToForm} />}
          {stage === "reset" && <ResetStep initialEmail={email.trim()} onToken={signIn} onBack={backToForm} />}
          {stage === "phone" && <PhoneSignIn firebase={providers.firebase} onIdToken={withFirebase} onBack={backToForm} />}
          {stage === "form" && (
            <>
              <h1 className="gc-title">{creating ? "Create your account" : "Welcome back"}</h1>
              <p className="gc-lede">Ask any PDF a question and see the page each answer comes from.</p>
  
              <div className="gc-switch" role="group" aria-label="Account">
                {[
                  ["signin", "Sign in"],
                  ["create", "Create account"],
                ].map(([id, label]) => (
                  <button key={id} type="button" aria-pressed={mode === id} onClick={() => switchTo(id)}>
                    {label}
                  </button>
                ))}
              </div>
  
              {(providers?.google || providers?.phone) && (
              <div className="gc-alt">
                {providers.google && (
                  <button type="button" className="gc-alt-button" onClick={google} disabled={busy}>
                    <GoogleMark /> Continue with Google
                  </button>
                )}
                {providers.phone && (
                  <button type="button" className="gc-alt-button" onClick={() => { setFailure(""); setStage("phone"); }} disabled={busy}>
                    <Smartphone size={18} strokeWidth={1.75} aria-hidden="true" /> Use my phone number
                  </button>
                )}
                <p className="gc-or"><span>or with email</span></p>
              </div>
            )}

            <form className="gc-form" onSubmit={submit} noValidate>
                <div className="gc-field">
                  <label htmlFor="email">Email</label>
                  <div className="gc-input-wrap">
                    <input
                      id="email"
                      className="gc-input"
                      type="email"
                      autoComplete="email"
                      autoCapitalize="none"
                      spellCheck="false"
                      value={email}
                      onChange={edit(setEmail, "email")}
                      onFocus={() => setFocus("email")}
                      onBlur={() => setFocus(null)}
                      aria-invalid={Boolean(errors.email)}
                      aria-describedby={errors.email ? "email-error" : undefined}
                    />
                    {/* The guru's seal: the address looks right. */}
                    <span className={`gc-seal${EMAIL.test(email.trim()) ? " is-on" : ""}`} aria-hidden="true">
                      <Check size={16} strokeWidth={3} />
                    </span>
                  </div>
                  {errors.email && (
                    <p className="gc-error" id="email-error">
                      <AlertCircle size={16} strokeWidth={2} aria-hidden="true" />
                      {errors.email}
                    </p>
                  )}
                </div>
  
                <div className="gc-field">
                  <label htmlFor="password">Password</label>
                  <div className="gc-input-wrap">
                    <input
                      id="password"
                      className="gc-input"
                      type={show ? "text" : "password"}
                      autoComplete={creating ? "new-password" : "current-password"}
                      value={password}
                      onChange={edit(setPassword, "password")}
                      onFocus={() => setFocus("password")}
                      onBlur={() => setFocus(null)}
                      aria-invalid={Boolean(errors.password)}
                      aria-describedby="password-note"
                    />
                    {creating && (
                      // Prayer beads that fill with the halo, one per three characters.
                      <span className="gc-beads" aria-hidden="true">
                        {[0, 1, 2, 3].map((bead) => (
                          <span key={bead} className={bead < lit ? "is-lit" : ""} />
                        ))}
                      </span>
                    )}
                    <button
                      type="button"
                      className="gc-reveal"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => setShow((value) => !value)}
                      aria-label={show ? "Hide password" : "Show password"}
                      aria-pressed={show}
                    >
                      {show ? <EyeOff size={20} strokeWidth={2} /> : <Eye size={20} strokeWidth={2} />}
                    </button>
                  </div>
                  <p id="password-note" className={errors.password ? "gc-error" : "gc-note"}>
                    {errors.password && <AlertCircle size={16} strokeWidth={2} aria-hidden="true" />}
                    {errors.password || passwordNote}
                  </p>
                  {!creating && (
                    <button type="button" className="gc-link gc-forgot" onClick={() => setStage("reset")}>
                      Forgot your password?
                    </button>
                  )}
                </div>
  
                <button type="submit" className="gc-submit" disabled={busy}>
                  {busy && <span className="spinner" aria-hidden="true" />}
                  {busy ? (creating ? "Creating your account" : "Signing in") : creating ? "Create account" : "Sign in"}
                </button>
  
                {failure && (
                  <p className="gc-error gc-failure" role="alert">
                    <AlertCircle size={16} strokeWidth={2} aria-hidden="true" />
                    {failure}
                  </p>
                )}
              </form>
            </>
          )}
        </div>
      </section>
    </main>
  );
}

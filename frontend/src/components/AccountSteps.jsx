import { useEffect, useState } from "react";
import { AlertCircle, ArrowLeft } from "lucide-react";

import { api } from "../api";
import CodeInput from "./CodeInput";

const RESEND_SECONDS = 60;

function useCountdown(seconds) {
  const [left, setLeft] = useState(seconds);
  useEffect(() => {
    if (left <= 0) return undefined;
    const timer = setTimeout(() => setLeft(left - 1), 1000);
    return () => clearTimeout(timer);
  }, [left]);
  return [left, () => setLeft(seconds)];
}

function Failure({ message }) {
  if (!message) return null;
  return (
    <p className="gc-error gc-failure" role="alert">
      <AlertCircle size={16} strokeWidth={2} aria-hidden="true" />
      {message}
    </p>
  );
}

function Resend({ email, purpose }) {
  const [left, restart] = useCountdown(RESEND_SECONDS);
  const [sent, setSent] = useState(false);
  if (left > 0) {
    return (
      <p className="gc-note">
        {sent ? "A new code is on its way. " : ""}You can ask for another code in {left} seconds.
      </p>
    );
  }
  return (
    <button
      type="button"
      className="gc-link"
      onClick={async () => {
        await api("/auth/resend-code", { method: "POST", body: { email, purpose } }).catch(() => {});
        setSent(true);
        restart();
      }}
    >
      Send me a new code
    </button>
  );
}

// After sign-up, or signing in before verifying: type the code from the email.
export function VerifyStep({ email, onToken, onBack }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");

  const verify = async (value) => {
    setBusy(true);
    setFailure("");
    try {
      const { access_token: token } = await api("/auth/verify-email", { method: "POST", body: { email, code: value } });
      onToken(token);
    } catch (error) {
      setFailure(error.message);
      setCode("");
      setBusy(false);
    }
  };

  return (
    <div className="gc-step">
      <h1 className="gc-title">Check your email</h1>
      <p className="gc-lede">
        We sent a 6-digit code to <strong>{email}</strong>. It works for 15 minutes; check the spam folder if it is not there.
      </p>
      <CodeInput value={code} onChange={setCode} onComplete={verify} disabled={busy} />
      {busy && <p className="gc-note">Checking the code</p>}
      <Failure message={failure} />
      <Resend email={email} purpose="verify" />
      <button type="button" className="gc-link gc-back" onClick={onBack}>
        <ArrowLeft size={16} strokeWidth={2} aria-hidden="true" /> Use a different email
      </button>
    </div>
  );
}

// Forgot the password: ask for a code, then choose a new password with it.
export function ResetStep({ initialEmail, onToken, onBack }) {
  const [email, setEmail] = useState(initialEmail);
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");

  const ask = async (event) => {
    event.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setFailure("Enter an email address like name@example.com");
      return;
    }
    setBusy(true);
    setFailure("");
    try {
      await api("/auth/forgot-password", { method: "POST", body: { email: email.trim() } });
      setSent(true);
    } catch (error) {
      setFailure(error.message);
    } finally {
      setBusy(false);
    }
  };

  const reset = async (event) => {
    event.preventDefault();
    if (code.length !== 6) return setFailure("Enter the 6-digit code from the email.");
    if (password.length < 12) return setFailure("Use at least 12 characters for the new password.");
    setBusy(true);
    setFailure("");
    try {
      const { access_token: token } = await api("/auth/reset-password", {
        method: "POST",
        body: { email: email.trim(), code, new_password: password },
      });
      onToken(token);
    } catch (error) {
      setFailure(error.message);
      setBusy(false);
    }
    return undefined;
  };

  return (
    <div className="gc-step">
      <h1 className="gc-title">{sent ? "Choose a new password" : "Forgot your password?"}</h1>
      {!sent ? (
        <form className="gc-form" onSubmit={ask} noValidate>
          <p className="gc-lede">Enter your email and we will send you a 6-digit code.</p>
          <div className="gc-field">
            <label htmlFor="reset-email">Email</label>
            <input
              id="reset-email"
              className="gc-input"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>
          <button type="submit" className="gc-submit" disabled={busy}>
            {busy ? "Sending" : "Send me a code"}
          </button>
          <Failure message={failure} />
        </form>
      ) : (
        <form className="gc-form" onSubmit={reset} noValidate>
          <p className="gc-lede">
            If <strong>{email.trim()}</strong> has an account, a code is on its way. Type it here with your new password.
          </p>
          <CodeInput value={code} onChange={setCode} disabled={busy} />
          <div className="gc-field">
            <label htmlFor="new-password">New password</label>
            <input
              id="new-password"
              className="gc-input"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              aria-describedby="new-password-note"
            />
            <p id="new-password-note" className="gc-note">At least 12 characters. A short sentence works well.</p>
          </div>
          <button type="submit" className="gc-submit" disabled={busy}>
            {busy ? "Saving" : "Save and sign in"}
          </button>
          <Failure message={failure} />
          <Resend email={email.trim()} purpose="reset" />
        </form>
      )}
      <button type="button" className="gc-link gc-back" onClick={onBack}>
        <ArrowLeft size={16} strokeWidth={2} aria-hidden="true" /> Back to sign in
      </button>
    </div>
  );
}

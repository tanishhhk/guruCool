import { useState } from "react";
import { AlertCircle, ArrowLeft } from "lucide-react";

import CodeInput from "./CodeInput";
import { startPhoneSignIn } from "../lib/firebase";
import { friendlyAuthError, toE164 } from "../lib/firebaseErrors";

const COUNTRIES = [
  ["+91", "India +91"],
  ["+1", "United States, Canada +1"],
  ["+44", "United Kingdom +44"],
  ["+971", "United Arab Emirates +971"],
  ["+65", "Singapore +65"],
  ["+61", "Australia +61"],
  ["+49", "Germany +49"],
];

// Phone number, a text message with a code, then the Firebase token goes to onIdToken.
export default function PhoneSignIn({ firebase, onIdToken, onBack, title = "Sign in with your phone" }) {
  const [country, setCountry] = useState("+91");
  const [number, setNumber] = useState("");
  const [pending, setPending] = useState(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");

  const send = async (event) => {
    event.preventDefault();
    const phone = toE164(country, number);
    if (!phone) return setFailure("Enter your phone number without the country code.");
    setBusy(true);
    setFailure("");
    try {
      setPending({ phone, ...(await startPhoneSignIn(firebase, phone, "phone-captcha")) });
    } catch (error) {
      setFailure(friendlyAuthError(error) ?? "");
    } finally {
      setBusy(false);
    }
    return undefined;
  };

  const confirm = async (value) => {
    setBusy(true);
    setFailure("");
    try {
      await onIdToken(await pending.confirm(value));
    } catch (error) {
      setFailure(friendlyAuthError(error) ?? "");
      setCode("");
      setBusy(false);
    }
  };

  return (
    <div className="gc-step">
      <h1 className="gc-title">{pending ? "Enter the code" : title}</h1>
      {!pending ? (
        <form className="gc-form" onSubmit={send} noValidate>
          <p className="gc-lede">We will text you a 6-digit code. Standard message rates may apply.</p>
          <div className="phone-row">
            <div className="gc-field">
              <label htmlFor="phone-country">Country</label>
              <select id="phone-country" className="gc-input" value={country} onChange={(event) => setCountry(event.target.value)}>
                {COUNTRIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </div>
            <div className="gc-field">
              <label htmlFor="phone-number">Phone number</label>
              <input
                id="phone-number"
                className="gc-input"
                type="tel"
                inputMode="tel"
                autoComplete="tel-national"
                value={number}
                onChange={(event) => setNumber(event.target.value)}
              />
            </div>
          </div>
          <button type="submit" className="gc-submit" disabled={busy}>{busy ? "Sending" : "Text me a code"}</button>
        </form>
      ) : (
        <>
          <p className="gc-lede">We texted a code to <strong>{pending.phone}</strong>.</p>
          <CodeInput value={code} onChange={setCode} onComplete={confirm} disabled={busy} />
          {busy && <p className="gc-note">Checking the code</p>}
        </>
      )}
      {failure && (
        <p className="gc-error gc-failure" role="alert">
          <AlertCircle size={16} strokeWidth={2} aria-hidden="true" />
          {failure}
        </p>
      )}
      <div id="phone-captcha" />
      <button type="button" className="gc-link gc-back" onClick={pending ? () => setPending(null) : onBack}>
        <ArrowLeft size={16} strokeWidth={2} aria-hidden="true" /> {pending ? "Use a different number" : "Back"}
      </button>
    </div>
  );
}

import { useEffect, useState } from "react";
import { BadgeCheck, LogOut, ShieldAlert } from "lucide-react";

import { api, session } from "../api";
import { FOCUS, PROFESSIONS, professionOf } from "../lenses";
import { displayName, initialOf } from "../lib/people";

function Saved({ state }) {
  if (!state) return null;
  if (state === "saved") return <p className="settings-saved" role="status">Saved.</p>;
  if (state === "saving") return null;
  return <p className="field-error" role="alert">{state}</p>;
}

function Details({ account, onUser }) {
  const [name, setName] = useState(account.display_name || "");
  const [state, setState] = useState("");
  const save = async (event) => {
    event.preventDefault();
    setState("saving");
    try {
      const saved = await api("/account", { method: "PATCH", body: { display_name: name } });
      onUser(saved);
      setState("saved");
    } catch (error) {
      setState(error.message);
    }
  };
  return (
    <section className="profile-section" aria-labelledby="details-heading">
      <div className="profile-id">
        <span className="avatar avatar-large" aria-hidden="true">{initialOf(account)}</span>
        <div>
          <h2 id="details-heading">{displayName(account)}</h2>
          {account.email && (
            <p className="profile-email">
              {account.email}
              {account.email_verified ? (
                <span className="badge-verified">
                  <BadgeCheck size={16} strokeWidth={2} aria-hidden="true" /> Verified
                </span>
              ) : (
                <span className="badge-unverified">Not verified</span>
              )}
            </p>
          )}
          <p className="profile-since">Member since {new Date(`${account.created_at}Z`).toLocaleDateString(undefined, { month: "long", year: "numeric" })}</p>
        </div>
      </div>
      <form className="settings-form" onSubmit={save}>
        <div className="field">
          <label htmlFor="display-name">What should we call you?</label>
          <input id="display-name" className="input" maxLength={60} value={name} onChange={(event) => { setName(event.target.value); setState(""); }} />
          <p className="field-hint">Shown on your shelf and in greetings.</p>
        </div>
        <div className="settings-actions">
          <button type="submit" className="button button-primary" disabled={state === "saving" || !name.trim()}>Save name</button>
          <Saved state={state} />
        </div>
      </form>
    </section>
  );
}

function Security({ account }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [state, setState] = useState("");
  const [everywhere, setEverywhere] = useState("");

  const change = async (event) => {
    event.preventDefault();
    if (next.length < 12) return setState("Use at least 12 characters for the new password.");
    setState("saving");
    try {
      const { access_token: token } = await api("/account/password", {
        method: "POST",
        body: { current_password: account.has_password ? current : undefined, new_password: next },
      });
      session.save(token);
      setCurrent("");
      setNext("");
      setState("saved");
    } catch (error) {
      setState(error.message);
    }
    return undefined;
  };

  const signOutEverywhere = async () => {
    setEverywhere("saving");
    try {
      const { access_token: token } = await api("/account/sign-out-everywhere", { method: "POST" });
      session.save(token);
      setEverywhere("saved");
    } catch (error) {
      setEverywhere(error.message);
    }
  };

  return (
    <section className="profile-section" aria-labelledby="security-heading">
      <h2 id="security-heading">Sign-in and security</h2>
      <p className="profile-note">You sign in with: {account.sign_in_methods.map((method) => ({ password: "email and password", google: "Google", phone: "phone number" })[method]).join(", ") || "a linked account"}.</p>
      <form className="settings-form" onSubmit={change}>
        {account.has_password && (
          <div className="field">
            <label htmlFor="current-password">Current password</label>
            <input id="current-password" className="input" type="password" autoComplete="current-password" value={current} onChange={(event) => { setCurrent(event.target.value); setState(""); }} />
          </div>
        )}
        <div className="field">
          <label htmlFor="next-password">{account.has_password ? "New password" : "Set a password"}</label>
          <input id="next-password" className="input" type="password" autoComplete="new-password" value={next} onChange={(event) => { setNext(event.target.value); setState(""); }} />
          <p className="field-hint">At least 12 characters. Changing it signs you out on other devices.</p>
        </div>
        <div className="settings-actions">
          <button type="submit" className="button button-quiet" disabled={state === "saving" || !next}>
            {account.has_password ? "Change password" : "Set password"}
          </button>
          <Saved state={state} />
        </div>
      </form>
      <div className="profile-row">
        <div>
          <h3>Sign out of all devices</h3>
          <p className="profile-note">Use this if you signed in on a shared or lost device. You stay signed in here.</p>
        </div>
        <button type="button" className="button button-quiet" onClick={signOutEverywhere} disabled={everywhere === "saving"}>
          <LogOut size={18} strokeWidth={1.75} aria-hidden="true" /> Sign out everywhere
        </button>
      </div>
      {everywhere === "saved" ? <p className="settings-saved" role="status">Every other device is signed out.</p> : <Saved state={everywhere === "saving" ? "" : everywhere} />}
    </section>
  );
}

function Reading({ user, onUser }) {
  const [profession, setProfession] = useState(user.profession || "student");
  const [focus, setFocus] = useState(user.focus || professionOf(user.profession || "student").focuses[0]);
  const [state, setState] = useState("");
  const options = professionOf(profession).focuses;

  const save = async (event) => {
    event.preventDefault();
    setState("saving");
    try {
      onUser(await api("/auth/me/profile", { method: "PUT", body: { profession, focus } }));
      setState("saved");
    } catch (error) {
      setState(error.message);
    }
  };

  return (
    <section className="profile-section" aria-labelledby="reading-heading">
      <h2 id="reading-heading">How guruKool reads for you</h2>
      <p className="profile-note">This shapes suggested questions and what answers and videos emphasise. The facts never change.</p>
      <form className="settings-form" onSubmit={save}>
        <div className="field">
          <label htmlFor="profession">I am a</label>
          <select id="profession" className="input" value={profession} onChange={(event) => { setProfession(event.target.value); setFocus(professionOf(event.target.value).focuses[0]); setState(""); }}>
            {PROFESSIONS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="focus">Mostly for</label>
          <select id="focus" className="input" value={focus} onChange={(event) => { setFocus(event.target.value); setState(""); }}>
            {options.map((id) => <option key={id} value={id}>{FOCUS[id].label}</option>)}
          </select>
          <p className="field-hint">{FOCUS[focus].line}</p>
        </div>
        <div className="settings-actions">
          <button type="submit" className="button button-quiet" disabled={state === "saving"}>Save</button>
          <Saved state={state} />
        </div>
      </form>
    </section>
  );
}

function DangerZone({ account, onSignOut }) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [password, setPassword] = useState("");
  const [state, setState] = useState("");

  const remove = async (event) => {
    event.preventDefault();
    setState("saving");
    try {
      await api("/account/delete", { method: "POST", body: { confirm: typed, password: account.has_password ? password : undefined } });
      session.clear();
      onSignOut();
    } catch (error) {
      setState(error.message);
    }
  };

  return (
    <section className="profile-section profile-danger" aria-labelledby="danger-heading">
      <h2 id="danger-heading">
        <ShieldAlert size={20} strokeWidth={1.75} aria-hidden="true" /> Delete your account
      </h2>
      <p className="profile-note">This deletes your account with every document, chat and video on your shelf. It cannot be undone.</p>
      {!open ? (
        <button type="button" className="button button-danger" onClick={() => setOpen(true)}>Delete my account</button>
      ) : (
        <form className="settings-form" onSubmit={remove}>
          <div className="field">
            <label htmlFor="confirm-delete">Type DELETE to confirm</label>
            <input id="confirm-delete" className="input" autoComplete="off" value={typed} onChange={(event) => setTyped(event.target.value)} />
          </div>
          {account.has_password && (
            <div className="field">
              <label htmlFor="delete-password">Your password</label>
              <input id="delete-password" className="input" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} />
            </div>
          )}
          <div className="settings-actions">
            <button type="submit" className="button button-danger" disabled={typed !== "DELETE" || state === "saving"}>Delete everything for good</button>
            <button type="button" className="button button-quiet" onClick={() => setOpen(false)}>Keep my account</button>
          </div>
          <Saved state={state === "saving" ? "" : state} />
        </form>
      )}
    </section>
  );
}

export default function Profile({ user, usage, onUser, onSignOut }) {
  const [account, setAccount] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api("/account").then(setAccount).catch((failure) => setError(failure.message));
  }, []);

  const updated = (next) => {
    setAccount((current) => ({ ...current, ...next }));
    onUser({ ...user, ...next });
  };

  return (
    <div className="settings profile">
      <h1>Your profile</h1>
      {error && <p className="field-error" role="alert">{error}</p>}
      {!account && !error && <div className="chat-skeleton" aria-label="Loading your profile"><span /><span /><span /></div>}
      {account && (
        <>
          <Details account={account} onUser={updated} />
          {usage && (
            <section className="profile-section" aria-labelledby="today-heading">
              <h2 id="today-heading">Today</h2>
              <p className="profile-note">
                {usage.used.question} of {usage.limits.question} questions, {usage.used.story} of {usage.limits.story} videos and {usage.used.upload} of {usage.limits.upload} uploads used. Your shelf holds {usage.documents} of {usage.max_documents} documents.
              </p>
            </section>
          )}
          <Security account={account} />
          <Reading user={user} onUser={onUser} />
          <DangerZone account={account} onSignOut={onSignOut} />
        </>
      )}
    </div>
  );
}

import { useMemo, useState } from "react";
import { ArrowRight, Clapperboard, MessageSquareText } from "lucide-react";

import { api } from "../api";
import { OutOfCredits } from "../components/Credits";
import Guru from "../components/Guru";
import Speech from "../components/Speech";
import UploadBox from "../components/UploadBox";
import { videosLocked } from "../lenses";
import { greetingFor, tipFor } from "../lib/greetings";
import { firstName } from "../lib/people";

// Asked right on the desk, not in a popup: a name for the greetings.
function NameForm({ user, onUser }) {
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async (event) => {
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
      onUser({ ...user, display_name: value });
    } catch (failure) {
      setError(failure.message);
      setSaving(false);
    }
  };

  return (
    <form className="home-name" onSubmit={save} noValidate>
      <label htmlFor="home-name">What should we call you?</label>
      <div className="home-name-row">
        <input
          id="home-name"
          className="input"
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            setError("");
          }}
          maxLength={60}
          autoComplete="given-name"
          aria-invalid={Boolean(error)}
          aria-describedby={error ? "home-name-error" : undefined}
        />
        <button type="submit" className="button button-primary" disabled={saving}>
          Save
        </button>
      </div>
      {error && <p className="field-error home-name-error" id="home-name-error" role="alert">{error}</p>}
    </form>
  );
}

// The page with no document open: a greeting on the desk, then bring a new one or pick up an old one.
export default function Home({ user, items, usage, onReady, onOpen, onPlans, onUser }) {
  const name = firstName(user);
  const greeting = useMemo(() => greetingFor(user.id, name), [user.id, name]);
  // "Afternoon, Asha. What are we reading?" sets its second sentence smaller, under the first.
  const [hello, follow] = greeting.match(/^(.+?[.?])\s+(.+)$/)?.slice(1) ?? [greeting, null];
  const [seed] = useState(Math.random);
  const locked = videosLocked(usage);
  const tip = tipFor({ videos: !locked, random: () => seed });

  const done = (items ?? []).filter((item) => item.status === "completed");
  const recent = done.slice(0, 3);
  const full = usage && usage.documents >= usage.max_documents;
  const noUploads = usage && usage.used.upload >= usage.limits.upload;

  let lede;
  if (done.length > 0) {
    lede = `${done.length} ${done.length === 1 ? "document" : "documents"} on your shelf. Bring another, or pick up where you left off.`;
  } else if (locked) {
    lede = "Drop in a PDF and ask it anything. Every answer shows the page it comes from.";
  } else {
    lede = "Drop in a PDF. guruCool explains it as a short narrated video, then answers your questions and shows the page each answer comes from.";
  }

  return (
    <div className="home">
      <section className="home-band" aria-labelledby="home-greeting">
        <div className="home-band-inner">
          <div className="home-hello">
            <h1 id="home-greeting">
              {hello}
              {follow && <span className="home-follow"> {follow}</span>}
            </h1>
            <p className="home-lede">{lede}</p>
            {name ? <Speech key={tip} text={tip} /> : <NameForm user={user} onUser={onUser} />}
          </div>
          <div className="home-guru">
            <Guru close />
          </div>
        </div>
      </section>

      <div className="home-body">
        {full ? (
          <p className="notice">Your shelf is full ({usage.max_documents} documents). Delete one from its page to bring a new one.</p>
        ) : noUploads ? (
          <OutOfCredits kind="upload" usage={usage} onPlans={onPlans} note="Your shelf is still open." />
        ) : (
          <UploadBox offerSample={!items || items.length === 0} onReady={onReady} />
        )}

        {recent.length > 0 && (
          <section className="home-recent" aria-labelledby="recent-heading">
            <h2 id="recent-heading">Pick up where you left off</h2>
            <ul>
              {recent.map((item) => (
                <li key={item.id}>
                  <button type="button" className="recent-row" onClick={() => onOpen(item)}>
                    <span className="recent-name">{item.filename.replace(/\.pdf$/i, "")}</span>
                    <span className="recent-line">
                      {item.last_question ? (
                        <>
                          <MessageSquareText size={15} strokeWidth={1.75} aria-hidden="true" />
                          <span>You last asked: {item.last_question}</span>
                        </>
                      ) : item.story_count > 0 ? (
                        <>
                          <Clapperboard size={15} strokeWidth={1.75} aria-hidden="true" />
                          <span>Your video is ready to watch again</span>
                        </>
                      ) : (
                        <span>{locked ? "Not explored yet. Ask it a first question." : "Not explored yet. Start with its video."}</span>
                      )}
                    </span>
                    <ArrowRight className="recent-go" size={18} strokeWidth={1.75} aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}

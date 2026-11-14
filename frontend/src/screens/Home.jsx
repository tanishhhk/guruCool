import { ArrowRight, Clapperboard, MessageSquareText } from "lucide-react";

import { OutOfCredits } from "../components/Credits";
import UploadBox from "../components/UploadBox";
import { firstName } from "../lib/people";

function greeting(now = new Date()) {
  const hour = now.getHours();
  if (hour < 5) return "Up late";
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

// The page with no document open: bring a new one, or pick up an old one.
export default function Home({ user, items, usage, onReady, onOpen, onPlans }) {
  const name = firstName(user);
  const recent = (items ?? []).filter((item) => item.status === "completed").slice(0, 3);
  const full = usage && usage.documents >= usage.max_documents;
  const noUploads = usage && usage.used.upload >= usage.limits.upload;

  return (
    <div className="home">
      <header className="home-head">
        <h1>{name ? `${greeting()}, ${name}.` : `${greeting()}.`}</h1>
        <p className="home-lede">
          Drop in a PDF. guruCool explains it as a short narrated video, then answers your questions and shows the page each answer comes from.
        </p>
      </header>

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
                      <span>Not explored yet. Start with its video.</span>
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
  );
}

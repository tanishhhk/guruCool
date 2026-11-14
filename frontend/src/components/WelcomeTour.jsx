import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Play, X } from "lucide-react";

import { markTourSeen } from "../lib/tour";

// Small pictures made of the app's own pieces, so the tour looks like what it describes.
function Picture({ index }) {
  if (index === 0) {
    return (
      <div className="tour-pic tour-pic-drop" aria-hidden="true">
        <span className="tour-page" />
        <span className="tour-drop" />
      </div>
    );
  }
  if (index === 1) {
    return (
      <div className="tour-pic" aria-hidden="true">
        <div className="tour-screen">
          <Play size={28} strokeWidth={2} />
          <span className="tour-bar" />
        </div>
      </div>
    );
  }
  if (index === 2) {
    return (
      <div className="tour-pic tour-pic-chat" aria-hidden="true">
        <span className="tour-note">What is the notice period?</span>
        <span className="tour-answer">
          One month, in writing. <span className="tour-chip">p. 4</span>
        </span>
      </div>
    );
  }
  return (
    <div className="tour-pic tour-pic-shelf" aria-hidden="true">
      {["#3f6672", "#7b5d4e", "#5d6f4f", "#4e5c7c"].map((tone, i) => (
        <span key={tone} className="tour-book" style={{ background: tone, transitionDelay: `${i * 70}ms` }} />
      ))}
    </div>
  );
}

function slides(usage) {
  const limits = usage?.limits;
  return [
    {
      title: "Bring any PDF",
      text: "A report, a chapter, a contract, your notes. guruCool reads every page, usually in under a minute.",
    },
    {
      title: "Watch it explained",
      text: "The main event. guruCool turns your document into a short narrated video that tells you what matters in plain words. You choose how long it is and how it is told.",
    },
    {
      title: "Ask anything, see the page",
      text: "Ask in your own words. Answers are short and simple, and every point shows the page it came from. Still unclear? Tap Simpler.",
    },
    {
      title: "Everything stays on your shelf",
      text: limits
        ? limits.story > 0
          ? `Your documents, chats and videos wait on the shelf. Each day you get ${limits.question} questions, ${limits.story} videos and ${limits.upload} uploads, refilled at midnight UTC.`
          : `Your documents and chats wait on the shelf. Each day you get ${limits.question} questions and ${limits.upload} uploads, refilled at midnight UTC.`
        : "Your documents, chats and videos wait on the shelf, ready when you come back.",
    },
  ];
}

export default function WelcomeTour({ open, userId, usage, onClose }) {
  const [index, setIndex] = useState(0);
  const panel = useRef(null);
  const all = slides(usage);
  const last = index === all.length - 1;

  const close = () => {
    markTourSeen(userId);
    setIndex(0);
    onClose();
  };

  useEffect(() => {
    if (!open) return undefined;
    markTourSeen(userId); // Shown once, even if the page reloads before it is closed.
    const previous = window.document.activeElement;
    panel.current?.focus();
    return () => previous?.focus?.();
  }, [open, userId]);

  if (!open) return null;

  const onKeyDown = (event) => {
    if (event.key === "Escape") close();
    else if (event.key === "ArrowRight" && !last) setIndex(index + 1);
    else if (event.key === "ArrowLeft" && index > 0) setIndex(index - 1);
    else if (event.key === "Tab") {
      // Keep focus inside the tour while it is open.
      const focusable = panel.current.querySelectorAll("button");
      const first = focusable[0];
      const end = focusable[focusable.length - 1];
      if (event.shiftKey && window.document.activeElement === first) {
        event.preventDefault();
        end.focus();
      } else if (!event.shiftKey && window.document.activeElement === end) {
        event.preventDefault();
        first.focus();
      }
    }
  };

  return (
    <div className="tour-backdrop" onMouseDown={(event) => event.target === event.currentTarget && close()}>
      <div
        className="tour"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-title"
        aria-describedby="tour-text"
        tabIndex={-1}
        ref={panel}
        onKeyDown={onKeyDown}
      >
        <button type="button" className="icon-button tour-close" aria-label="Close the tour" onClick={close}>
          <X size={20} strokeWidth={1.75} aria-hidden="true" />
        </button>
        <Picture key={index} index={index} />
        <div className="tour-body">
          <p className="folio tour-count">{index + 1} of {all.length}</p>
          <h2 id="tour-title">{all[index].title}</h2>
          <p id="tour-text">{all[index].text}</p>
        </div>
        <footer className="tour-foot">
          <span className="tour-dots" aria-hidden="true">
            {all.map((slide, i) => (
              <span key={slide.title} className={i === index ? "is-on" : ""} />
            ))}
          </span>
          <span className="tour-buttons">
            {index > 0 && (
              <button type="button" className="button button-quiet" onClick={() => setIndex(index - 1)}>
                <ArrowLeft size={18} strokeWidth={1.75} aria-hidden="true" /> Back
              </button>
            )}
            {last ? (
              <button type="button" className="button button-primary" onClick={close}>
                Start exploring
              </button>
            ) : (
              <button type="button" className="button button-primary" onClick={() => setIndex(index + 1)}>
                Next <ArrowRight size={18} strokeWidth={2} aria-hidden="true" />
              </button>
            )}
          </span>
        </footer>
      </div>
    </div>
  );
}

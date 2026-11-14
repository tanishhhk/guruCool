import { useEffect, useRef, useState } from "react";
import { ArrowUp, Check, Copy, FileText, Lightbulb, Sparkles, Trash2 } from "lucide-react";

import { api } from "../api";
import AnswerText from "../components/AnswerText";
import { OutOfCredits } from "../components/Credits";
import Excerpt from "../components/Excerpt";
import { DEFAULT_QUESTIONS, FOCUS } from "../lenses";

const THINKING = ["Finding the right pages", "Reading them", "Writing it simply"];

function Thinking() {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setStep((current) => Math.min(current + 1, THINKING.length - 1)), 2200);
    return () => clearInterval(timer);
  }, []);
  return (
    <div className="thinking" role="status">
      <span className="thinking-dots" aria-hidden="true">
        <span />
        <span />
        <span />
      </span>
      {THINKING[step]}
    </div>
  );
}

function plainText(answer) {
  return answer.replace(/\s*\[S\d+\]/g, "").replace(/\*\*/g, "");
}

function Answer({ turn, onFollowUp, busy }) {
  const reply = turn.reply;
  const extractive = reply.answer_status === "extractive";
  const notFound = reply.answer_status === "not_found";
  const cited = extractive ? reply.sources : reply.sources.filter((source) => source.cited);
  const [showPages, setShowPages] = useState(extractive);
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(plainText(reply.answer));
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard access can be refused; nothing to undo.
    }
  };

  return (
    <article className={`reply${notFound ? " is-not-found" : ""}`}>
      {extractive ? (
        <p className="reply-note">No AI answer is available right now, so here are the passages that match your question best.</p>
      ) : (
        <AnswerText text={reply.answer} sources={reply.sources} />
      )}

      {showPages && cited.length > 0 && (
        <div className="excerpts">
          {cited.map((source) => (
            <Excerpt key={source.source_id} source={source} against={extractive ? turn.question : reply.answer} />
          ))}
        </div>
      )}

      <div className="reply-actions">
        {cited.length > 0 && !extractive && (
          <button type="button" className="chip" aria-expanded={showPages} onClick={() => setShowPages(!showPages)}>
            <FileText size={16} strokeWidth={1.75} aria-hidden="true" />
            {showPages ? "Hide the pages" : `Show the pages (${cited.length})`}
          </button>
        )}
        {!extractive && !notFound && (
          <>
            <button type="button" className="chip" disabled={busy} onClick={() => onFollowUp(`Explain this more simply: ${turn.question}`)}>
              <Sparkles size={16} strokeWidth={1.75} aria-hidden="true" /> Simpler
            </button>
            <button type="button" className="chip" disabled={busy} onClick={() => onFollowUp(`Give one example from the document for: ${turn.question}`)}>
              <Lightbulb size={16} strokeWidth={1.75} aria-hidden="true" /> Give an example
            </button>
            <button type="button" className="chip" onClick={copy}>
              {copied ? <Check size={16} strokeWidth={2} aria-hidden="true" /> : <Copy size={16} strokeWidth={1.75} aria-hidden="true" />}
              {copied ? "Copied" : "Copy"}
            </button>
          </>
        )}
      </div>
    </article>
  );
}

export default function ChatPanel({ document, focus, usage, onUsed, onPlans }) {
  const [turns, setTurns] = useState(null);
  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [loadError, setLoadError] = useState("");
  const end = useRef(null);
  const box = useRef(null);
  const suggestions = focus ? FOCUS[focus].questions : DEFAULT_QUESTIONS;
  const left = usage ? Math.max(0, usage.limits.question - usage.used.question) : null;
  const locked = left === 0;

  useEffect(() => {
    let cancelled = false;
    api(`/chat/history/${document.id}`)
      .then((page) => {
        if (cancelled) return;
        setTurns(page.messages.map((message) => ({ id: message.id, question: message.question, reply: message })));
      })
      .catch((failure) => {
        if (cancelled) return;
        setTurns([]);
        setLoadError(failure.message);
      });
    return () => {
      cancelled = true;
    };
  }, [document.id]);

  // scrollIntoView returns a promise in newer browsers; an effect must not return it.
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns?.length, asking]);

  // The box grows with its text, up to about six lines.
  useEffect(() => {
    const field = box.current;
    if (!field) return;
    field.style.height = "auto";
    field.style.height = `${Math.min(field.scrollHeight, 168)}px`;
  }, [question]);

  const ask = async (text) => {
    const asked = text.trim();
    if (!asked || asking || locked) return;
    setQuestion("");
    setAsking(true);
    const key = `pending-${Date.now()}`;
    setTurns((previous) => [...(previous ?? []), { id: key, question: asked }]);
    try {
      const reply = await api("/chat/ask", { method: "POST", body: { question: asked, document_id: document.id } });
      setTurns((previous) => previous.map((turn) => (turn.id === key ? { ...turn, id: reply.message_id, reply } : turn)));
    } catch (failure) {
      setTurns((previous) => previous.map((turn) => (turn.id === key ? { ...turn, error: failure.message } : turn)));
    } finally {
      setAsking(false);
      onUsed();
    }
  };

  const clear = async () => {
    try {
      await api(`/chat/history/${document.id}`, { method: "DELETE" });
      setTurns([]);
      onUsed();
    } finally {
      setClearing(false);
    }
  };

  return (
    <div className="chat">
      {turns === null && (
        <div className="chat-skeleton" aria-label="Loading this chat">
          <span />
          <span />
          <span />
        </div>
      )}
      {loadError && <p className="field-error" role="alert">{loadError}</p>}

      {turns?.length === 0 && (
        <div className="chat-empty">
          <h2>Ask anything about this document.</h2>
          <p>Answers come only from its pages, in plain words, and show you where.</p>
          <ul className="suggestions">
            {suggestions.map((suggestion) => (
              <li key={suggestion}>
                <button type="button" onClick={() => ask(suggestion)} disabled={locked}>
                  {suggestion}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {turns?.length > 0 && (
        <>
          <div className="chat-tools">
            {clearing ? (
              <span className="chat-confirm">
                Clear this chat for good?
                <button type="button" className="chip is-danger" onClick={clear}>Clear it</button>
                <button type="button" className="chip" onClick={() => setClearing(false)}>Keep it</button>
              </span>
            ) : (
              <button type="button" className="chip" onClick={() => setClearing(true)} disabled={asking}>
                <Trash2 size={16} strokeWidth={1.75} aria-hidden="true" /> Clear this chat
              </button>
            )}
          </div>
          <ol className="thread">
            {turns.map((turn) => (
              <li key={turn.id} className="exchange">
                <p className="asked">{turn.question}</p>
                {turn.reply && <Answer turn={turn} onFollowUp={ask} busy={asking || locked} />}
                {turn.error && <p className="field-error" role="alert">{turn.error}</p>}
                {!turn.reply && !turn.error && <Thinking />}
              </li>
            ))}
          </ol>
        </>
      )}
      <div ref={end} className="chat-end" />

      <div className="composer-wrap">
        {locked ? (
          <OutOfCredits kind="question" usage={usage} onPlans={onPlans} note="Your chat stays here." />
        ) : (
          <form
            className="composer"
            onSubmit={(event) => {
              event.preventDefault();
              ask(question);
            }}
          >
            <label htmlFor="question" className="visually-hidden">
              Your question
            </label>
            <textarea
              id="question"
              ref={box}
              rows={1}
              placeholder="Ask about this document"
              maxLength={1000}
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  ask(question);
                }
              }}
            />
            <button type="submit" className="button button-primary composer-send" disabled={asking || !question.trim()} aria-label="Ask">
              <ArrowUp size={20} strokeWidth={2} aria-hidden="true" />
            </button>
          </form>
        )}
        {!locked && left !== null && left <= 5 && <p className="composer-hint">{left} {left === 1 ? "question" : "questions"} left today</p>}
      </div>
    </div>
  );
}

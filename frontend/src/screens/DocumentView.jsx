import { useEffect, useRef, useState } from "react";
import { Clapperboard, MessageSquareText, MoreHorizontal, Trash2 } from "lucide-react";

import { api } from "../api";
import { focusPhrase } from "../lenses";
import ChatPanel from "./ChatPanel";
import StoryPanel from "./StoryPanel";

const TABS = [
  ["explain", "Watch it explained", Clapperboard],
  ["chat", "Ask questions", MessageSquareText],
];

function DeleteMenu({ document, onDeleted }) {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const box = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => {
      if (event.type === "keydown" ? event.key === "Escape" : !box.current?.contains(event.target)) {
        setOpen(false);
        setConfirming(false);
      }
    };
    window.document.addEventListener("mousedown", close);
    window.document.addEventListener("keydown", close);
    return () => {
      window.document.removeEventListener("mousedown", close);
      window.document.removeEventListener("keydown", close);
    };
  }, [open]);

  const remove = async () => {
    setBusy(true);
    setError("");
    try {
      await api(`/documents/${document.id}`, { method: "DELETE" });
      onDeleted(document.id);
    } catch (failure) {
      setError(failure.message);
      setBusy(false);
    }
  };

  return (
    <div className="doc-menu" ref={box}>
      <button type="button" className="icon-button" aria-label="More for this document" aria-expanded={open} onClick={() => setOpen(!open)}>
        <MoreHorizontal size={20} strokeWidth={1.75} aria-hidden="true" />
      </button>
      {open && (
        <div className="doc-menu-panel" role="dialog" aria-label="Document options">
          {confirming ? (
            <>
              <p>Delete this document, its chat and its videos for good?</p>
              <div className="doc-menu-actions">
                <button type="button" className="button button-danger" onClick={remove} disabled={busy}>
                  Delete for good
                </button>
                <button type="button" className="button button-quiet" onClick={() => setConfirming(false)}>
                  Keep it
                </button>
              </div>
              {error && <p className="field-error" role="alert">{error}</p>}
            </>
          ) : (
            <button type="button" className="doc-menu-item is-danger" onClick={() => setConfirming(true)}>
              <Trash2 size={18} strokeWidth={1.75} aria-hidden="true" /> Delete document
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// One document: its video explanation first, its chat second.
export default function DocumentView({ document, user, usage, onUsed, onDeleted }) {
  const [tab, setTab] = useState("explain");

  return (
    <div className="doc">
      <header className="doc-head">
        <div className="doc-title-row">
          <div>
            <h1 className="doc-title">{document.filename.replace(/\.pdf$/i, "")}</h1>
            <p className="doc-meta">
              <span className="folio">{document.page_count} {document.page_count === 1 ? "page" : "pages"}</span>
              {user.focus && <span>Read for {focusPhrase(user.focus)}</span>}
            </p>
          </div>
          <DeleteMenu document={document} onDeleted={onDeleted} />
        </div>
        <div className="tabs doc-tabs" role="tablist" aria-label="What to do with this document">
          {TABS.map((entry) => {
            const [id, label, TabIcon] = entry;
            return (
            <button
              key={id}
              type="button"
              role="tab"
              id={`tab-${id}`}
              aria-controls={`panel-${id}`}
              aria-selected={tab === id}
              className={tab === id ? "is-active" : ""}
              onClick={() => setTab(id)}
            >
              <TabIcon size={18} strokeWidth={1.75} aria-hidden="true" />
              {label}
            </button>
            );
          })}
        </div>
      </header>

      <section className="doc-body" role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === "explain" ? (
          <StoryPanel document={document} focus={user.focus} usage={usage} onUsed={onUsed} onAsk={() => setTab("chat")} />
        ) : (
          <ChatPanel document={document} focus={user.focus} usage={usage} onUsed={onUsed} />
        )}
      </section>
    </div>
  );
}

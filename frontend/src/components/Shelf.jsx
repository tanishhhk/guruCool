import { useEffect, useMemo, useRef, useState } from "react";
import { Clapperboard, Compass, LogOut, MessageSquareText, Plus, Search, UserRound } from "lucide-react";

import { CreditsMeter } from "./Credits";
import { Logo } from "./Logo";
import { displayName, initialOf } from "../lib/people";
import { groupByRecency, spineTone } from "../lib/shelf";

// A small cloth-bound notebook: its spine tone tells documents apart at a glance.
function Notebook({ tone, hasVideo }) {
  return (
    <svg className="notebook" width="26" height="34" viewBox="0 0 26 34" aria-hidden="true" focusable="false">
      <rect x="1" y="1" width="24" height="32" rx="3" fill={tone} />
      <rect x="1" y="1" width="6" height="32" rx="2" fill="rgba(0,0,0,0.22)" />
      <rect x="11" y="9" width="10" height="2" rx="1" fill="rgba(255,255,255,0.55)" />
      <rect x="11" y="14" width="7" height="2" rx="1" fill="rgba(255,255,255,0.35)" />
      {hasVideo && <path d="M18 1h5v10l-2.5-2-2.5 2Z" fill="#ffc94d" />}
    </svg>
  );
}

function ShelfItem({ item, current, onOpen }) {
  const ready = item.status === "completed";
  return (
    <li>
      <button
        type="button"
        className={`shelf-item${current ? " is-current" : ""}`}
        aria-current={current ? "page" : undefined}
        disabled={!ready}
        onClick={() => onOpen(item)}
      >
        <Notebook tone={spineTone(item.id)} hasVideo={item.story_count > 0} />
        <span className="shelf-item-body">
          <span className="shelf-item-name"><span>{item.filename.replace(/\.pdf$/i, "")}</span></span>
          <span className="shelf-item-meta">
            {ready ? (
              <>
                <span>{item.page_count} {item.page_count === 1 ? "page" : "pages"}</span>
                {item.message_count > 0 && (
                  <span title={`${item.message_count} questions asked`}>
                    <MessageSquareText size={13} strokeWidth={1.75} aria-hidden="true" /> {item.message_count}
                  </span>
                )}
                {item.story_count > 0 && (
                  <span title={`${item.story_count} videos made`}>
                    <Clapperboard size={13} strokeWidth={1.75} aria-hidden="true" /> {item.story_count}
                  </span>
                )}
              </>
            ) : (
              <span>{item.status === "failed" ? "Could not be read" : "Being read"}</span>
            )}
          </span>
          {item.last_question && <span className="shelf-item-last">{item.last_question}</span>}
        </span>
      </button>
    </li>
  );
}

function AccountMenu({ user, onProfile, onTour, onSignOut }) {
  const [open, setOpen] = useState(false);
  const box = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => {
      if (event.type === "keydown" ? event.key === "Escape" : !box.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  const choose = (action) => () => {
    setOpen(false);
    action();
  };

  return (
    <div className="account" ref={box}>
      {open && (
        <div className="account-menu" role="menu" aria-label="Your account">
          <button type="button" role="menuitem" onClick={choose(onProfile)}>
            <UserRound size={18} strokeWidth={1.75} aria-hidden="true" /> Profile and settings
          </button>
          {onTour && (
            <button type="button" role="menuitem" onClick={choose(onTour)}>
              <Compass size={18} strokeWidth={1.75} aria-hidden="true" /> Take the tour
            </button>
          )}
          <button type="button" role="menuitem" onClick={choose(onSignOut)}>
            <LogOut size={18} strokeWidth={1.75} aria-hidden="true" /> Sign out
          </button>
        </div>
      )}
      <button type="button" className="account-button" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="avatar" aria-hidden="true">{initialOf(user)}</span>
        <span className="account-name">
          <span>{displayName(user)}</span>
          <span className="account-email">{user.email || user.phone}</span>
        </span>
      </button>
    </div>
  );
}

export default function Shelf({ user, items, currentId, usage, onHome, onOpen, onProfile, onPlans, onTour, onSignOut }) {
  const [query, setQuery] = useState("");
  const groups = useMemo(() => {
    const wanted = query.trim().toLowerCase();
    const shown = (items ?? []).filter((item) => !wanted || item.filename.toLowerCase().includes(wanted));
    return groupByRecency(shown);
  }, [items, query]);

  return (
    <nav className="shelf" aria-label="Your documents">
      <button type="button" className="shelf-logo" onClick={onHome} aria-label="guruKool home">
        <Logo size={28} />
      </button>

      <button type="button" className="button button-primary shelf-new" onClick={onHome}>
        <Plus size={18} strokeWidth={2} aria-hidden="true" /> New document
      </button>

      {items && items.length > 3 && (
        <label className="shelf-search">
          <Search size={16} strokeWidth={1.75} aria-hidden="true" />
          <span className="visually-hidden">Search your documents</span>
          <input placeholder="Search your shelf" value={query} onChange={(event) => setQuery(event.target.value)} />
        </label>
      )}

      <div className="shelf-list">
        {items === null && (
          <ul className="shelf-group" aria-label="Loading your documents">
            {[0, 1, 2].map((index) => (
              <li key={index} className="shelf-skeleton" aria-hidden="true">
                <span />
                <span />
              </li>
            ))}
          </ul>
        )}
        {items && items.length === 0 && <p className="shelf-empty">Your documents will sit here, with every question you ask and every video you make.</p>}
        {items && items.length > 0 && groups.length === 0 && <p className="shelf-empty">Nothing on your shelf matches that name.</p>}
        {groups.map((group) => (
          <section key={group.label} className="shelf-section" aria-label={group.label}>
            <h2 className="shelf-heading">{group.label}</h2>
            <ul className="shelf-group">
              {group.items.map((item) => (
                <ShelfItem key={item.id} item={item} current={item.id === currentId} onOpen={onOpen} />
              ))}
            </ul>
          </section>
        ))}
      </div>

      <footer className="shelf-foot">
        <CreditsMeter usage={usage} onPlans={onPlans} />
        <AccountMenu user={user} onProfile={onProfile} onTour={onTour} onSignOut={onSignOut} />
      </footer>
    </nav>
  );
}

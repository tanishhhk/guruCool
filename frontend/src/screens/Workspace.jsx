import { useCallback, useEffect, useState } from "react";
import { Menu, X } from "lucide-react";

import { api } from "../api";
import { Logo } from "../components/Logo";
import Shelf from "../components/Shelf";
import WelcomeTour from "../components/WelcomeTour";
import { tourSeen } from "../lib/tour";
import DocumentView from "./DocumentView";
import Home from "./Home";
import Plans from "./Plans";
import Profile from "./Profile";

// The signed-in app: the shelf of documents on the left, the open page on the right.
export default function Workspace({ user, initialDocument, onUser, onSignOut }) {
  const [items, setItems] = useState(null);
  const [currentId, setCurrentId] = useState(initialDocument?.id ?? null);
  const [opened, setOpened] = useState(initialDocument);
  const [view, setView] = useState(initialDocument ? "document" : "home");
  const [usage, setUsage] = useState(null);
  const [drawer, setDrawer] = useState(false);
  const [tour, setTour] = useState(() => !tourSeen(user.id));

  const refreshUsage = useCallback(() => {
    api("/auth/me/usage").then(setUsage).catch(() => {});
  }, []);
  const refreshShelf = useCallback(() => {
    api("/activity")
      .then((page) => setItems(page.documents))
      .catch(() => setItems((previous) => previous ?? []));
  }, []);

  useEffect(() => {
    refreshUsage();
    refreshShelf();
  }, [refreshUsage, refreshShelf]);

  const onUsed = useCallback(() => {
    refreshUsage();
    refreshShelf();
  }, [refreshUsage, refreshShelf]);

  const open = (document) => {
    setOpened(document);
    setCurrentId(document.id);
    setView("document");
    setDrawer(false);
  };
  const goHome = () => {
    setCurrentId(null);
    setView("home");
    setDrawer(false);
  };
  const showPlans = () => {
    setView("plans");
    setDrawer(false);
  };
  const removed = (id) => {
    setItems((previous) => previous?.filter((item) => item.id !== id) ?? previous);
    refreshUsage();
    if (id === currentId) goHome();
  };

  // The shelf entry has the latest counts; a just-uploaded document may not be on it yet.
  const current = items?.find((item) => item.id === currentId) ?? (opened?.id === currentId ? opened : null);

  return (
    <div className={`workspace${drawer ? " has-drawer" : ""}`}>
      <header className="mobile-bar">
        <button type="button" className="icon-button on-ink" aria-label="Open your documents" onClick={() => setDrawer(true)}>
          <Menu size={20} strokeWidth={1.75} aria-hidden="true" />
        </button>
        <button type="button" className="mobile-home" onClick={goHome} aria-label="guruKool home">
          <Logo size={26} />
        </button>
      </header>

      <div className="shelf-wrap">
        <button type="button" className="icon-button on-ink shelf-close" aria-label="Close" onClick={() => setDrawer(false)}>
          <X size={20} strokeWidth={1.75} aria-hidden="true" />
        </button>
        <Shelf
          user={user}
          items={items}
          currentId={view === "document" ? currentId : null}
          usage={usage}
          onHome={goHome}
          onOpen={open}
          onProfile={() => {
            setView("settings");
            setDrawer(false);
          }}
          onPlans={showPlans}
          onTour={() => {
            setTour(true);
            setDrawer(false);
          }}
          onSignOut={onSignOut}
        />
      </div>
      {drawer && <button type="button" className="shelf-scrim" aria-label="Close your documents" onClick={() => setDrawer(false)} />}

      <main className="page-area">
        {view === "home" && <Home user={user} items={items} usage={usage} onPlans={showPlans} onReady={(document) => { onUsed(); open(document); }} onOpen={open} />}
        {view === "plans" && <Plans usage={usage} />}
        {view === "settings" && <Profile user={user} usage={usage} onUser={onUser} onSignOut={onSignOut} />}
        {view === "document" && current && (
          <DocumentView key={current.id} document={current} user={user} usage={usage} onUsed={onUsed} onDeleted={removed} onPlans={showPlans} />
        )}
      </main>

      <WelcomeTour open={tour} userId={user.id} usage={usage} onClose={() => setTour(false)} />
    </div>
  );
}

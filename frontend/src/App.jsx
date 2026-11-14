import { useCallback, useEffect, useState } from "react";

import { API_URL, api, session, wait } from "./api";
import { Mark } from "./components/Logo";
import WorkspaceSkeleton from "./components/WorkspaceSkeleton";
import Onboarding from "./screens/Onboarding";
import SignIn from "./screens/SignIn";
import Workspace from "./screens/Workspace";

const SKIPPED = "gurucool_onboarding_skipped";

// How long a returning user's account keeps retrying quietly before we say the server is down.
const RESTORE_FOR_MS = 3 * 60 * 1000;

// No connection, or the free server still starting (its proxy answers 502 or 503 meanwhile).
const isTransient = (error) => error.status === 0 || error.status >= 500;

export default function App() {
  // Visitors get the sign-in page at once. A returning user gets the workspace skeleton.
  const [stage, setStage] = useState(() => (session.token ? "restoring" : "signin"));
  const [user, setUser] = useState(null);
  const [firstDocument, setFirstDocument] = useState(null);

  const show = useCallback((me) => {
    setUser(me);
    setStage(me.focus || localStorage.getItem(`${SKIPPED}:${me.id}`) ? "workspace" : "onboarding");
  }, []);

  const enter = useCallback(async () => {
    try {
      show(await api("/auth/me"));
    } catch {
      session.clear();
      setStage("signin");
    }
  }, [show]);

  useEffect(() => {
    let cancelled = false;
    if (!session.token) {
      // Wake the free server in the background while the visitor reads the sign-in page.
      fetch(`${API_URL}/health`).catch(() => {});
      return () => {
        cancelled = true;
      };
    }
    (async () => {
      const deadline = Date.now() + RESTORE_FOR_MS;
      while (!cancelled) {
        try {
          const me = await api("/auth/me");
          if (!cancelled) show(me);
          return;
        } catch (error) {
          if (cancelled) return;
          // Only a refused sign-in signs the user out; a sleeping server or a dropped connection does not.
          if (!isTransient(error)) {
            session.clear();
            setStage("signin");
            return;
          }
          if (Date.now() > deadline) {
            setStage("down");
            return;
          }
          await wait(3000);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [show]);

  useEffect(() => {
    const signedOut = () => {
      setUser(null);
      setStage("signin");
    };
    window.addEventListener("gurucool:signed-out", signedOut);
    return () => window.removeEventListener("gurucool:signed-out", signedOut);
  }, []);

  const signOut = async () => {
    await api("/auth/logout", { method: "POST" }).catch(() => {});
    session.clear();
    setUser(null);
    setFirstDocument(null);
    setStage("signin");
  };

  if (stage === "restoring") return <WorkspaceSkeleton />;
  if (stage === "down") {
    return (
      <main className="boot" role="alert">
        <Mark size={48} />
        <p>The server is not responding. Try again in a few minutes.</p>
        <button type="button" className="button button-primary" onClick={() => window.location.reload()}>
          Try again
        </button>
      </main>
    );
  }
  if (stage === "signin") return <SignIn onSignedIn={enter} />;
  if (stage === "onboarding") {
    return (
      <Onboarding
        user={user}
        onSkip={() => {
          localStorage.setItem(`${SKIPPED}:${user.id}`, "1");
          setStage("workspace");
        }}
        onDone={(saved, document, finished) => {
          if (saved) setUser(saved);
          if (document) setFirstDocument(document);
          if (finished) setStage("workspace");
        }}
      />
    );
  }
  return <Workspace user={user} initialDocument={firstDocument} onUser={setUser} onSignOut={signOut} />;
}

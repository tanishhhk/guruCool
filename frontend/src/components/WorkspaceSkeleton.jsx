import { Logo } from "./Logo";

// The workspace's own shape, drawn in shimmering placeholders while a returning
// user's account loads. It reuses the workspace layout, so nothing jumps when
// the real screen replaces it.
export default function WorkspaceSkeleton() {
  return (
    <div className="workspace" role="status" aria-label="Opening your workspace">
      <header className="mobile-bar">
        <span className="mobile-home">
          <Logo size={26} />
        </span>
      </header>

      <div className="shelf-wrap">
        <div className="shelf">
          <span className="shelf-logo">
            <Logo size={28} />
          </span>
          <span className="shelf-new-skeleton" aria-hidden="true" />
          <ul className="shelf-group" aria-hidden="true">
            {[0, 1, 2].map((index) => (
              <li key={index} className="shelf-skeleton">
                <span />
                <span />
              </li>
            ))}
          </ul>
        </div>
      </div>

      <main className="page-area">
        <div className="home page-skeleton" aria-hidden="true">
          <span className="page-skeleton-title" />
          <span />
          <span />
          <span className="page-skeleton-card" />
        </div>
      </main>
    </div>
  );
}

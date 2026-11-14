import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "./styles/base.css";
import "./styles/signin.css";
import "./styles/app.css";
import "./styles/onboarding.css";
import "./styles/workspace.css";
import "./styles/home.css";
import "./styles/chat.css";
import "./styles/explain.css";
import "./styles/tour.css";
import "./styles/profile.css";
import "./styles/credits.css";
import App from "./App.jsx";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import { REMOTE_AUTH, setToken } from "./api/client";
import "./styles.css";

// Costura login → SPA (ADR-002): la superficie pública entrega el token por
// fragmento (#token=…), que nunca viaja al servidor. Se guarda y se limpia
// de la URL inmediatamente.
const hash = new URLSearchParams(window.location.hash.slice(1));
const token = hash.get("token");
if (token && !REMOTE_AUTH) {
  setToken(token);
  history.replaceState(null, "", window.location.pathname);
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

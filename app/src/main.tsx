import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import { REMOTE_AUTH, setToken } from "./api/client";
import { setRelayEmail, setRelayToken } from "./api/relay";
import "./styles.css";

// Costura login → SPA (ADR-002): la superficie pública entrega la credencial por
// fragmento (nunca viaja al servidor). Se guarda y se limpia de la URL. Dos
// caminos: `#token=` (token local del daemon) y `#device_token=` (relay C-2,
// tras el canje de Google en la superficie pública).
const hash = new URLSearchParams(window.location.hash.slice(1));
const token = hash.get("token");
const deviceToken = hash.get("device_token");
if (deviceToken) {
  setRelayToken(deviceToken);
  setRelayEmail(hash.get("email"));
  history.replaceState(null, "", window.location.pathname);
} else if (token && !REMOTE_AUTH) {
  setToken(token);
  history.replaceState(null, "", window.location.pathname);
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

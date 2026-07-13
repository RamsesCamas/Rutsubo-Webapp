// Indicador de estado de conexión (wireframe: `daemon: ● conectado`).

import { useStore } from "../state/store";

const LABEL = {
  connected: "conectado",
  connecting: "conectando…",
  disconnected: "desconectado",
} as const;

export function DaemonStatus() {
  const status = useStore((s) => s.status);
  const provider = useStore((s) => s.provider);
  const daemonOffline = useStore((s) => s.daemonOffline);
  // Conectado al relay pero sin escritorio en línea: honesto "escritorio offline"
  // (ámbar) en vez de un verde engañoso.
  const offline = status === "connected" && daemonOffline;
  return (
    <div className="daemon-status">
      <span>
        daemon:{" "}
        <span className={`dot dot-${offline ? "connecting" : status}`} aria-hidden="true" />{" "}
        {offline ? "escritorio offline" : LABEL[status]}
      </span>
      {provider && (
        <span className="provider">
          modelo: {provider.id} · {provider.health}
          {provider.reason ? ` (${provider.reason})` : ""}
        </span>
      )}
    </div>
  );
}

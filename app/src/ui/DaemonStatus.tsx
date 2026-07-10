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
  return (
    <div className="daemon-status">
      <span>
        daemon: <span className={`dot dot-${status}`} aria-hidden="true" /> {LABEL[status]}
      </span>
      {provider && (
        <span className="provider">
          modelo: {provider.id} · {provider.health}
        </span>
      )}
    </div>
  );
}

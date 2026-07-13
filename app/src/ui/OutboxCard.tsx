// Buzón de tareas offline (ADR-009, solo transporte relay): las tareas "En
// cola" que se ejecutarán cuando el escritorio vuelva a estar en línea. Cancelar
// retira una tarea `queued` (404 si ya se entregó). Vive en el panel de sesiones.

import { relayApi } from "../api/relay";
import { useStore } from "../state/store";

export function OutboxCard() {
  const outbox = useStore((s) => s.outbox);
  const setOutbox = useStore((s) => s.setOutbox);
  const queued = outbox.filter((t) => t.state !== "expired");
  if (queued.length === 0) return null;

  async function cancel(id: string) {
    try {
      await relayApi.cancel(id);
    } catch {
      /* ya drenada/expirada: el refresco la retira igual */
    }
    try {
      setOutbox((await relayApi.outbox()).items);
    } catch {
      /* sin relay: conservar lo último */
    }
  }

  return (
    <section className="outbox" aria-label="Tareas en cola">
      <header className="outbox-header">En cola</header>
      <ul className="outbox-list">
        {queued.map((task) => (
          <li key={task.id} className="outbox-item">
            <div className="outbox-body">
              <span className="outbox-title">
                {task.target.new_session_title ?? "Tarea"}
              </span>
              <span className="outbox-sub">
                {task.state === "delivered"
                  ? "entregada — arrancando…"
                  : "se ejecutará cuando el escritorio esté en línea"}
              </span>
            </div>
            {task.state === "queued" && (
              <button
                type="button"
                className="outbox-cancel"
                onClick={() => void cancel(task.id)}
                aria-label="Cancelar tarea"
                title="Cancelar"
              >
                ✕
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

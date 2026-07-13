// Tarjeta de aprobación inline (RF-15, RF-17): Aprobar/Rechazar + checkbox
// de regla estable (`remember_rule`, RF-18). Se retira sola con
// `approval_resolved` aunque la decisión venga de otro cliente: el reductor
// del store la elimina; aquí solo se deshabilita mientras la decisión viaja.

import { useState } from "react";
import { ApiError } from "../api/client";
import { useTransport } from "../api/transport";
import type { PendingApproval } from "../state/store";

export function ApprovalCard({
  approval,
  sessionId,
}: {
  approval: PendingApproval;
  sessionId: string;
}) {
  const transport = useTransport();
  const [rememberRule, setRememberRule] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function decide(decision: "approve" | "reject") {
    setBusy(true);
    setError(null);
    try {
      // REST → POST; relay → comando WS reenviado al daemon (mismo efecto).
      await transport.decide(sessionId, approval.approvalId, decision, rememberRule);
      // No retiramos la tarjeta aquí: la retira approval_resolved (RF-17).
    } catch (err) {
      if (err instanceof ApiError && err.code === "conflict") {
        // Otro cliente ganó la carrera: approval_resolved llegará enseguida.
        return;
      }
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  return (
    <section className="approval-card" aria-live="polite">
      <header>Aprobación requerida</header>
      <p>
        {/* Para run_shell el summary ES el comando; para archivos ya incluye
            la herramienta (`write_file: ruta`). */}
        <code>{approval.summary}</code>
      </p>
      <div className="approval-actions">
        <button
          type="button"
          className="approve"
          disabled={busy}
          onClick={() => decide("approve")}
        >
          Aprobar
        </button>
        <button
          type="button"
          className="reject"
          disabled={busy}
          onClick={() => decide("reject")}
        >
          Rechazar
        </button>
        <label className="remember">
          <input
            type="checkbox"
            checked={rememberRule}
            onChange={(e) => setRememberRule(e.target.checked)}
          />
          regla estable
        </label>
      </div>
      {error && <p className="error-text">{error}</p>}
    </section>
  );
}

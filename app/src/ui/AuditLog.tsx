// Vista paginada del audit log (RF-05, RF-22) con filtro por sesión y
// proveedor, sobre GET /v1/audit.

import { useCallback, useEffect, useState } from "react";
import type { AuditEntry } from "@bindings/AuditEntry";
import { api } from "../api/client";
import { useStore } from "../state/store";

export function AuditLog() {
  const sessions = useStore((s) => s.sessions);
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [sessionFilter, setSessionFilter] = useState("");
  const [providerFilter, setProviderFilter] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (append: boolean, fromCursor?: string) => {
      try {
        const page = await api.audit({
          cursor: fromCursor,
          session_id: sessionFilter || undefined,
          provider: providerFilter || undefined,
          limit: 25,
        });
        setEntries((prev) => (append ? [...prev, ...page.entries] : page.entries));
        setCursor(page.next_cursor ?? null);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [sessionFilter, providerFilter],
  );

  useEffect(() => {
    void load(false);
  }, [load]);

  return (
    <div className="audit-log">
      <div className="audit-filters">
        <select
          value={sessionFilter}
          onChange={(e) => setSessionFilter(e.target.value)}
          aria-label="Filtrar por sesión"
        >
          <option value="">todas las sesiones</option>
          {sessions.map((s) => (
            <option key={s.id} value={s.id}>
              {s.title || s.id.slice(0, 10)}
            </option>
          ))}
        </select>
        <input
          value={providerFilter}
          onChange={(e) => setProviderFilter(e.target.value)}
          placeholder="proveedor (p. ej. local:mock:qwen3.5-8b)"
          aria-label="Filtrar por proveedor"
        />
      </div>
      {error && <p className="error-text">{error}</p>}
      <table>
        <thead>
          <tr>
            <th>ts</th>
            <th>tipo</th>
            <th>detalle</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => (
            <tr key={e.id}>
              <td className="audit-ts">{new Date(e.ts).toLocaleTimeString()}</td>
              <td>
                <code>{e.kind}</code>
              </td>
              <td className="audit-detail">{JSON.stringify(e.detail)}</td>
            </tr>
          ))}
          {entries.length === 0 && (
            <tr>
              <td colSpan={3} className="empty">
                sin entradas
              </td>
            </tr>
          )}
        </tbody>
      </table>
      {cursor && (
        <button type="button" onClick={() => void load(true, cursor)}>
          cargar más
        </button>
      )}
    </div>
  );
}

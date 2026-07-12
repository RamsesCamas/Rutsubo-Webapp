// Ajustes: configuración de la API key del proveedor (Groq). La key se envía
// al daemon, que la persiste y reconfigura el modelo en caliente; nunca se
// muestra de vuelta (solo su estado). Tras guardar se refresca el health para
// que el indicador del proveedor se actualice.

import { useEffect, useState } from "react";
import { api } from "../api/client";
import { useStore } from "../state/store";

export function SettingsModal({ onClose }: { onClose: () => void }) {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [source, setSource] = useState<string>("");
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api
      .providerStatus()
      .then((s) => {
        setConfigured(s.configured);
        setSource(s.source);
      })
      .catch(() => setConfigured(false));
  }, []);

  async function refreshHealth() {
    try {
      const h = await api.health();
      useStore.getState().setProvider(h.provider);
    } catch {
      /* el indicador se queda como estaba */
    }
  }

  async function save(next: string | null) {
    setBusy(true);
    setError(null);
    try {
      const status = await api.setProviderKey(next);
      setConfigured(status.configured);
      setSource(status.source);
      setValue("");
      await refreshHealth();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Ajustes">
        <div className="modal-head">
          <h2>Ajustes</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Cerrar">×</button>
        </div>

        <section className="settings-section">
          <h3>Modelo de IA (Groq)</h3>
          <p className="hint">
            {configured === null
              ? "Comprobando…"
              : configured
                ? `Hay una API key configurada (${source === "env" ? "desde el entorno" : "guardada"}). El agente puede usar el modelo.`
                : "Sin API key: el agente no puede generar acciones (modo degradado). Pega tu clave de Groq para activarlo."}
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const key = value.trim();
              if (key) void save(key);
            }}
          >
            <input
              type="password"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="gsk_..."
              aria-label="API key de Groq"
              autoComplete="off"
            />
            <div className="settings-actions">
              <button type="submit" disabled={busy || !value.trim()}>
                {busy ? "Guardando…" : "Guardar y activar"}
              </button>
              {configured && (
                <button type="button" className="ghost" disabled={busy} onClick={() => void save(null)}>
                  Quitar key
                </button>
              )}
            </div>
            {error && <p className="error-text">{error}</p>}
          </form>
          <p className="hint small">
            La key se guarda en el daemon local, en tu máquina. Consíguela en console.groq.com.
          </p>
        </section>
      </div>
    </div>
  );
}

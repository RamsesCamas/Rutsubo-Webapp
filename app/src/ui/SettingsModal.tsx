// Ajustes: configuración de la API key del proveedor (Groq). La key se envía
// al daemon, que la persiste y reconfigura el modelo en caliente; nunca se
// muestra de vuelta (solo su estado). Tras guardar se refresca el health para
// que el indicador del proveedor se actualice.

import { useEffect, useState } from "react";
import { api, IS_TAURI, tauriInvoke } from "../api/client";
import { GOOGLE_CLIENT_ID, RELAY_HTTP } from "../api/relay";
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

        {IS_TAURI && <LinkAccountSection />}
      </div>
    </div>
  );
}

/// Solo escritorio: vincular la cuenta con Google (C-2). No cambia el
/// transporte (sigue local, rápido); parea el daemon a la cuenta para que las
/// sesiones locales se vean en el móvil y la web. El OAuth abre el navegador
/// del sistema (comando Rust `google_login`); "dev" verifica sin client ID.
function LinkAccountSection() {
  const [busy, setBusy] = useState(false);
  const [linked, setLinked] = useState<string | null>(null);
  const [devEmail, setDevEmail] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void tauriInvoke<string>("get_relay_token")
      .then(() => setLinked(""))
      .catch(() => setLinked(null));
  }, []);

  async function link(cmd: "google_login" | "dev_login", args: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const email = await tauriInvoke<string>(cmd, args);
      setLinked(email);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="settings-section">
      <h3>Cuenta (Google)</h3>
      {linked !== null ? (
        <p className="hint">
          Cuenta vinculada{linked ? ` (${linked})` : ""}. Tus sesiones locales se ven en el móvil y la web.
        </p>
      ) : (
        <p className="hint">
          Vincula tu cuenta para ver estas sesiones desde el móvil y la web. El escritorio sigue conectado localmente.
        </p>
      )}
      <div className="settings-actions">
        <button
          type="button"
          disabled={busy || !GOOGLE_CLIENT_ID}
          onClick={() =>
            void link("google_login", { googleClientId: GOOGLE_CLIENT_ID, relayHttp: RELAY_HTTP })
          }
        >
          {busy ? "Vinculando…" : "Vincular con Google"}
        </button>
      </div>
      <details className="login-dev">
        <summary>Modo desarrollador (relay dev)</summary>
        <form
          className="login-dev-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (devEmail.includes("@")) void link("dev_login", { email: devEmail, relayHttp: RELAY_HTTP });
          }}
        >
          <input
            type="email"
            value={devEmail}
            onChange={(e) => setDevEmail(e.target.value)}
            placeholder="correo (login dev)"
            aria-label="Correo para login dev"
          />
          <button type="submit" disabled={busy}>Vincular (dev)</button>
        </form>
      </details>
      {error && <p className="error-text">{error}</p>}
    </section>
  );
}

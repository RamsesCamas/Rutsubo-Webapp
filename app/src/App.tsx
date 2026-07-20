// Aplicación autenticada (CSR, ADR-002): tres paneles del wireframe —
// sesiones + estado del daemon | visor de diff | conversación con tarjetas
// de aprobación inline. En <1024 px los paneles colapsan a tabs.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { EventEnvelope } from "@bindings/EventEnvelope";
import { api, fetchTauriToken, getToken, IS_TAURI, REMOTE_AUTH, setToken } from "./api/client";
import {
  GOOGLE_CLIENT_ID,
  getRelayEmail,
  getRelayToken,
  relayApi,
  relaySubscribeUrl,
  setRelayEmail,
  setRelayToken,
} from "./api/relay";
import { googleIdToken } from "./api/google";
import { relayTransport, restTransport, TransportProvider, useTransport } from "./api/transport";
import { useStore } from "./state/store";
import { DaemonSocket } from "./ws/connection";
import { SessionSequencer } from "./ws/sequencer";
import { AuditLog } from "./ui/AuditLog";
import { DaemonStatus } from "./ui/DaemonStatus";
import { OutboxCard } from "./ui/OutboxCard";
import { SettingsModal } from "./ui/SettingsModal";
import { MicButton } from "./ui/MicButton";
import { DiffViewer } from "./ui/DiffViewer";
import { MessageStream } from "./ui/MessageStream";
import { PreviewPanel } from "./ui/PreviewPanel";
import { SessionList } from "./ui/SessionList";

type CenterTab = "diff" | "audit" | "vista";
type MobilePane = "sesiones" | "trabajo" | "chat";

export function App() {
  if (REMOTE_AUTH) return <RemoteApp />;
  if (IS_TAURI) return <TauriApp />;
  return <LocalApp />;
}

/// Navegador sin BFF: dos transportes. Relay (Google Sign-In → device_token →
/// las mismas sesiones que el móvil/escritorio, RNF-10) o Local (token del
/// daemon en la misma máquina, RNF-11). Se reanuda la sesión previa: el
/// device_token del relay tiene prioridad sobre el token local.
function LocalApp() {
  const [session, setSession] = useState<{ relay: boolean; email?: string } | null>(() => {
    if (getRelayToken()) return { relay: true, email: getRelayEmail() ?? undefined };
    if (getToken()) return { relay: false };
    return null;
  });
  if (!session) return <LoginGate onDone={setSession} />;
  if (session.relay) {
    return <Workspace token={getRelayToken() ?? ""} relay email={session.email} />;
  }
  return <Workspace token={getToken() ?? ""} />;
}

function LoginGate({ onDone }: { onDone: (s: { relay: boolean; email?: string }) => void }) {
  return (
    <main className="login-screen">
      <section className="login-card">
        <span className="login-mark" aria-hidden="true" />
        <h1>Rutsubo</h1>
        <p className="login-tagline">Tu agente de código. Tu GPU. Tu workspace.</p>
        <RelayLogin onDone={(email) => onDone({ relay: true, email })} />
        <details className="login-local">
          <summary>Conectar al daemon local con token</summary>
          <TokenGate onToken={() => onDone({ relay: false })} />
        </details>
      </section>
    </main>
  );
}

/// Login del relay: Google (id_token → canje → device_token) y una sección
/// "dev" (id_token de prueba `dev:sub:correo`) para verificar contra un relay
/// con RELAY_GOOGLE_DEV=1 sin depender del client ID real (handoff M0).
function RelayLogin({ onDone }: { onDone: (email: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [devEmail, setDevEmail] = useState("");
  const [error, setError] = useState<string | null>(null);

  const exchange = useCallback(
    async (idToken: string, email: string) => {
      setBusy(true);
      setError(null);
      try {
        const { device_token } = await relayApi.googleExchange(idToken, "Navegador");
        setRelayToken(device_token);
        setRelayEmail(email);
        onDone(email);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
      }
    },
    [onDone],
  );

  async function google() {
    setBusy(true);
    setError(null);
    try {
      const { idToken, email } = await googleIdToken(GOOGLE_CLIENT_ID);
      await exchange(idToken, email);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  function dev(e: React.FormEvent) {
    e.preventDefault();
    const email = devEmail.trim();
    if (!email.includes("@")) {
      setError("correo inválido");
      return;
    }
    void exchange(`dev:sub-${email}:${email}`, email);
  }

  return (
    <>
      {GOOGLE_CLIENT_ID ? (
        <button type="button" className="google-btn" disabled={busy} onClick={() => void google()}>
          <GoogleMark />
          <span>{busy ? "Entrando…" : "Continuar con Google"}</span>
        </button>
      ) : (
        <p className="login-hint">Configura VITE_GOOGLE_CLIENT_ID para el login de Google.</p>
      )}
      <details className="login-dev">
        <summary>Modo desarrollador (relay dev)</summary>
        <form onSubmit={dev} className="login-dev-form">
          <input
            type="email"
            value={devEmail}
            onChange={(e) => setDevEmail(e.target.value)}
            placeholder="correo (login dev)"
            aria-label="Correo para login dev"
          />
          <button type="submit" disabled={busy}>Entrar (dev)</button>
        </form>
      </details>
      {error && <p className="error-text">{error}</p>}
    </>
  );
}

/// Dentro del shell Tauri el login desaparece: el token lo entrega el lado
/// Rust (`get_local_token`) y vive en memoria. Si el comando falla, se cae al
/// TokenGate normal — mismo artefacto, cero bifurcación de build (ADR-002).
function TauriApp() {
  const [token, setTokenState] = useState<string | null>(() => getToken());
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (token) return;
    void fetchTauriToken().then((fetched) => {
      if (fetched) {
        setToken(fetched);
        setTokenState(fetched);
      } else {
        setFailed(true);
      }
    });
  }, [token]);
  if (token) return <Workspace token={token} />;
  if (failed) return <TokenGate onToken={(t) => setTokenState(t)} />;
  return (
    <main className="login-screen">
      <section className="login-card" aria-busy="true">
        <p className="login-hint">Conectando con el daemon…</p>
      </section>
    </main>
  );
}

function RemoteApp() {
  const [email, setEmail] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  useEffect(() => { void api.authMe().then((session) => { setEmail(session?.email ?? null); setChecked(true); }); }, []);
  if (!checked) {
    return (
      <main className="login-screen">
        <section className="login-card" aria-busy="true">
          <p className="login-hint">Comprobando sesión…</p>
        </section>
      </main>
    );
  }
  if (!email) return <LoginScreen />;
  return <Workspace token="" remote email={email} />;
}

function LoginScreen() {
  const [demo, setDemo] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submitDemo(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.demoLogin(code.trim());
      location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "código inválido");
      setBusy(false);
    }
  }

  return (
    <main className="login-screen">
      <section className="login-card">
        <span className="login-mark" aria-hidden="true" />
        <h1>Rutsubo</h1>
        <p className="login-tagline">Tu agente de código. Tu GPU. Tu workspace.</p>
        <a className="google-btn" href="/api/auth/login">
          <GoogleMark />
          <span>Continuar con Google</span>
        </a>
        <p className="login-hint">Acceso limitado a cuentas autorizadas.</p>
        {demo ? (
          <form className="demo-form" onSubmit={submitDemo}>
            <input
              type="password"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="código de acceso demo"
              aria-label="Código de acceso demo"
              autoFocus
            />
            <button type="submit" disabled={busy || !code.trim()}>
              {busy ? "Entrando…" : "Entrar"}
            </button>
            {error && <p className="error-text">{error}</p>}
          </form>
        ) : (
          <button type="button" className="ghost demo-link" onClick={() => setDemo(true)}>
            Entrar en modo demo
          </button>
        )}
      </section>
    </main>
  );
}

/// La "G" oficial multicolor, inline: la CSP de la SPA (default-src 'self')
/// no permite cargar recursos de marca externos.
function GoogleMark() {
  return (
    <svg className="google-mark" viewBox="0 0 48 48" width="20" height="20" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}

function TokenGate({ onToken }: { onToken: (token: string) => void }) {
  const [value, setValue] = useState("");
  return (
    <main className="token-gate">
      <h1>Rutsubo</h1>
      <p>
        Pega el token local del daemon (<code>~/.local/share/rutsubo/token</code>).
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const token = value.trim();
          if (!token) return;
          setToken(token);
          onToken(token);
        }}
      >
        <input
          type="password"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="token del daemon"
          aria-label="Token del daemon"
          autoFocus
        />
        <button type="submit">Entrar</button>
      </form>
    </main>
  );
}

function Workspace({
  token,
  remote = false,
  relay = false,
  email,
}: {
  token: string;
  remote?: boolean;
  relay?: boolean;
  email?: string;
}) {
  const selected = useStore((s) => s.selected);
  const views = useStore((s) => s.views);
  const select = useStore((s) => s.select);
  const [centerTab, setCenterTab] = useState<CenterTab>("diff");
  const [mobilePane, setMobilePane] = useState<MobilePane>("sesiones");
  const [settingsOpen, setSettingsOpen] = useState(false);

  const socketRef = useRef<DaemonSocket | null>(null);
  const sequencersRef = useRef(new Map<string, SessionSequencer>());

  // Refresca el buzón (relay). Se llama al conectar y ante `task_dequeued`.
  const refreshOutbox = useCallback(async () => {
    if (!relay) return;
    try {
      const page = await relayApi.outbox();
      useStore.getState().setOutbox(page.items);
      // Tareas `queued` ⇒ escritorio offline; un buzón vacío NO implica online
      // (la presencia la marca `daemon_unavailable`), así que aquí solo subimos.
      if (page.items.some((t) => t.state === "queued")) {
        useStore.getState().setDaemonOffline(true);
      }
    } catch {
      /* sin relay: conservar lo último */
    }
  }, [relay]);

  // Relleno de huecos del secuenciador (C-3 §3.3.5). REST: replay por HTTP.
  // Relay: sin REST (RNF-10) → re-emitir `subscribe_session`; el daemon
  // unicasta el backlog por el mismo canal (no hay respuesta síncrona aquí).
  const fetchReplay = useCallback(
    async (sessionId: string, afterSeq: number) => {
      if (relay) {
        socketRef.current?.subscribe(sessionId, afterSeq);
        return [] as EventEnvelope[];
      }
      const page = await api.events(sessionId, afterSeq);
      return page.events as EventEnvelope[];
    },
    [relay],
  );

  const ensureSequencer = useCallback(
    (sessionId: string, afterSeq: number) => {
      let sequencer = sequencersRef.current.get(sessionId);
      if (!sequencer) {
        const store = useStore.getState();
        sequencer = new SessionSequencer(sessionId, afterSeq, {
          onEvent: (event) => useStore.getState().applyEvent(event),
          fetchReplay,
          onGapState: (filling) => store.setGapFilling(sessionId, filling),
        });
        sequencersRef.current.set(sessionId, sequencer);
      }
      return sequencer;
    },
    [fetchReplay],
  );

  // Ciclo de vida de la conexión WS. Remoto: ticket efímero por intento; local:
  // token del daemon; relay: WSS `/v1/subscribe?token=<device_token>`.
  useEffect(() => {
    const socket = new DaemonSocket(
      {
        onStatus: (status) => useStore.getState().setStatus(status),
        onEvent: (event) => {
          const sessionId = event.session_id;
          if (!sessionId) {
            // Globales (relay): `daemon_unavailable` = presencia → escritorio offline.
            useStore.getState().applyEvent(event);
            return;
          }
          // Cualquier frame de sesión (vivo o snapshot) implica que el
          // escritorio está en línea: baja el "escritorio offline".
          if (useStore.getState().daemonOffline) {
            useStore.getState().setDaemonOffline(false);
          }
          // La LISTA de sesiones se mantiene aquí (upsert): `session_state`
          // llega tanto vivo como en el snapshot de anuncio (SIN seq) que el
          // daemon manda al conectarse o cuando este cliente entra tarde —
          // así las sesiones del escritorio aparecen en la web.
          if (event.type === "session_state") {
            useStore
              .getState()
              .upsertSessionMeta(sessionId, event.payload.state, event.payload.title ?? null, event.ts);
          }
          if (event.seq == null) return; // anuncio: no entra al secuenciador
          // Una tarea encolada se drenó: refrescar el buzón para retirarla (RF-17).
          if (event.type === "task_dequeued") void refreshOutbox();
          const sequencer = sequencersRef.current.get(sessionId);
          void sequencer?.push(event);
        },
        onOpen: () => {
          // Resuscripción tras (re)conectar, desde el último seq procesado:
          // el daemon repone lo faltante y empalma sin duplicar.
          for (const [sessionId, sequencer] of sequencersRef.current) {
            socket.subscribe(sessionId, sequencer.processedSeq);
          }
        },
      },
      relay ? () => Promise.resolve(relaySubscribeUrl()) : undefined,
    );
    socketRef.current = socket;
    socket.connect();
    return () => socket.close();
  }, [token, remote, relay, refreshOutbox]);

  // Datos iniciales. Relay: sin REST (RNF-10) → poblar del flujo difundido + el
  // buzón. REST: health (proveedor) + lista de sesiones.
  useEffect(() => {
    if (relay) {
      useStore.getState().setProvider(null);
      void refreshOutbox();
      return;
    }
    void api
      .health()
      .then((h) => useStore.getState().setProvider(h.provider))
      .catch(() => useStore.getState().setProvider(null));
    void api
      .listSessions()
      .then((page) => useStore.getState().setSessions(page.sessions))
      .catch(() => {});
  }, [relay, refreshOutbox]);

  // Transporte de comandos (aprobar/enviar) para los hijos vía contexto. El
  // socket se lee perezosamente porque se crea en el efecto de conexión.
  const transport = useMemo(
    () =>
      relay
        ? relayTransport(() => socketRef.current, () => void refreshOutbox())
        : restTransport(),
    [relay, refreshOutbox],
  );

  const onSelect = useCallback(
    (sessionId: string) => {
      select(sessionId);
      setMobilePane("chat");
      if (!sequencersRef.current.has(sessionId)) {
        ensureSequencer(sessionId, 0);
        socketRef.current?.subscribe(sessionId, 0);
      }
    },
    [select, ensureSequencer],
  );

  const view = selected ? views[selected] : undefined;

  function signOutRelay() {
    setRelayToken(null);
    setRelayEmail(null);
    location.reload();
  }

  return (
    <TransportProvider value={transport}>
      <div className="shell">
        <header className="topbar">
          <h1>Rutsubo</h1>
          <DaemonStatus />
          <button type="button" className="icon-btn" onClick={() => setSettingsOpen(true)} aria-label="Ajustes" title="Ajustes">⚙</button>
          {remote && <button type="button" onClick={() => void api.logout().then(() => location.reload())}>Salir ({email})</button>}
          {relay && <button type="button" onClick={signOutRelay}>Salir{email ? ` (${email})` : ""}</button>}
        </header>
        {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}

        <nav className="mobile-tabs" aria-label="Paneles">
          {(["sesiones", "trabajo", "chat"] as const).map((pane) => (
            <button
              key={pane}
              type="button"
              className={mobilePane === pane ? "active" : ""}
              onClick={() => setMobilePane(pane)}
            >
              {pane}
            </button>
          ))}
        </nav>

        <main className="panels">
          <aside className={`panel panel-left ${mobilePane === "sesiones" ? "visible" : ""}`}>
            {relay && <RelayNewTask />}
            {relay && <OutboxCard />}
            <SessionList onSelect={onSelect} remote={remote} />
          </aside>

          <section className={`panel panel-center ${mobilePane === "trabajo" ? "visible" : ""}`}>
            <div className="center-tabs" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={centerTab === "diff"}
                className={centerTab === "diff" ? "active" : ""}
                onClick={() => setCenterTab("diff")}
              >
                Diff
              </button>
              {/* Vista de archivos generados/subidos: solo en la web desplegada
                  (remoto), donde los archivos persisten en Postgres. */}
              {remote && (
                <button
                  type="button"
                  role="tab"
                  aria-selected={centerTab === "vista"}
                  className={centerTab === "vista" ? "active" : ""}
                  onClick={() => setCenterTab("vista")}
                >
                  Vista
                </button>
              )}
              {/* El audit log es REST del daemon: no existe en relay (RNF-10). */}
              {!relay && (
                <button
                  type="button"
                  role="tab"
                  aria-selected={centerTab === "audit"}
                  className={centerTab === "audit" ? "active" : ""}
                  onClick={() => setCenterTab("audit")}
                >
                  Audit log
                </button>
              )}
            </div>
            {centerTab === "vista" && remote ? (
              <PreviewPanel sessionId={selected} />
            ) : centerTab === "diff" || relay ? (
              <DiffViewer diffs={view?.diffs ?? []} />
            ) : (
              <AuditLog />
            )}
          </section>

          <section className={`panel panel-right ${mobilePane === "chat" ? "visible" : ""}`}>
            {view && selected ? (
              <Conversation sessionId={selected} remote={remote} />
            ) : (
              <p className="empty">
                {relay ? "encola una tarea o selecciona una sesión" : "selecciona o crea una sesión"}
              </p>
            )}
          </section>
        </main>
      </div>
    </TransportProvider>
  );
}

/// Encolar una tarea nueva (relay): crea una sesión al drenar en el escritorio.
/// Con el escritorio online el relay la entrega al instante; si no, queda "En
/// cola". Espejo del FAB "Nueva tarea" del móvil.
function RelayNewTask() {
  const transport = useTransport();
  const [draft, setDraft] = useState("");
  const [note, setNote] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const content = draft.trim();
    if (!content) return;
    try {
      const { queued } = await transport.send(null, content);
      setDraft("");
      setNote(queued ? "En cola — se ejecutará cuando el escritorio esté en línea" : "Enviada");
    } catch (err) {
      setNote(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <form className="relay-new-task" onSubmit={submit}>
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder='Nueva tarea, p. ej. "agrega docstrings al módulo X"'
        rows={2}
        maxLength={32000}
        aria-label="Nueva tarea para encolar"
      />
      <button type="submit" disabled={!draft.trim()}>Encolar tarea</button>
      {note && <p className="notice">{note}</p>}
    </form>
  );
}

// Instrucción del modo debugger: análisis de calidad/seguridad sin tocar el
// código salvo que se pida. Se antepone al mensaje del usuario (sin cambios de
// backend/contrato); el agente ya tiene read_file/search en remoto.
const DEBUGGER_PREFIX =
  "Actúa como analista de seguridad y calidad de código. Revisa el código del " +
  "workspace y los archivos subidos en busca de bugs, errores lógicos y " +
  "vulnerabilidades. Reporta cada hallazgo con severidad (alta/media/baja), " +
  "archivo y línea, y una recomendación concreta. No modifiques archivos salvo " +
  "que se te pida explícitamente. Petición del usuario: ";

const EXAMPLE_PROMPT =
  'Genera un archivo saludo.html con un botón que, al hacer clic, muestre una ' +
  'alerta "¡Hola desde Rutsubo!".';

function Conversation({ sessionId, remote = false }: { sessionId: string; remote?: boolean }) {
  const view = useStore((s) => s.views[sessionId]);
  const daemonOffline = useStore((s) => s.daemonOffline);
  const addUserMessage = useStore((s) => s.addUserMessage);
  const transport = useTransport();
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [debug, setDebug] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const busy = view?.state === "running" || view?.state === "waiting_approval";
  // En relay con el escritorio offline el envío queda "En cola".
  const queueing = transport.mode === "relay" && daemonOffline;

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const content = draft.trim();
    if (!content) return;
    setError(null);
    const outgoing = debug ? DEBUGGER_PREFIX + content : content;
    try {
      const { messageId } = await transport.send(sessionId, outgoing);
      addUserMessage(sessionId, messageId, content);
      setDraft("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);
    setNote(null);
    setUploading(true);
    try {
      const { saved } = await api.uploadFile(sessionId, file);
      setNote(`Subido: ${saved.join(", ")}. Actívalo con "🐞 Debugger" y pide el análisis.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setUploading(false);
    }
  }

  if (!view) return null;
  const disabled = view.state === "waiting_approval" || view.state === "archived";
  return (
    <div className="conversation">
      <MessageStream view={view} sessionId={sessionId} />
      {remote && (
        <div className="composer-tools">
          <button
            type="button"
            className={debug ? "chip active" : "chip"}
            aria-pressed={debug}
            onClick={() => setDebug((v) => !v)}
            title="Analizar código en busca de bugs y vulnerabilidades"
          >
            🐞 Debugger
          </button>
          <button type="button" className="chip" disabled={uploading} onClick={() => fileInput.current?.click()}>
            {uploading ? "Subiendo…" : "📎 Subir archivo"}
          </button>
          <button type="button" className="chip" onClick={() => setDraft(EXAMPLE_PROMPT)}>
            Probar ejemplo
          </button>
          <input ref={fileInput} type="file" hidden onChange={onUpload} />
        </div>
      )}
      <form className="composer" onSubmit={send}>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={
            view.state === "waiting_approval"
              ? "resuelve la aprobación pendiente primero…"
              : queueing
                ? "Se ejecutará cuando el escritorio esté en línea"
                : debug
                  ? "Qué código analizar (o deja que revise el workspace)…"
                  : "Escribe una instrucción…"
          }
          rows={2}
          maxLength={32000}
          disabled={disabled}
          aria-label="Instrucción para el agente"
        />
        <button type="submit" disabled={!draft.trim() || view.state === "waiting_approval"}>
          {busy ? "en curso…" : queueing ? "Encolar" : debug ? "Analizar" : "Enviar"}
        </button>
        {/* El mic requiere ASR por REST del daemon: no disponible en relay (RNF-10). */}
        {transport.supportsRest && (
          <MicButton
            disabled={disabled}
            onText={(text) => setDraft((current) => current ? `${current} ${text}` : text)}
            onError={setError}
          />
        )}
      </form>
      {note && <p className="notice">{note}</p>}
      {error && <p className="error-text">{error}</p>}
    </div>
  );
}

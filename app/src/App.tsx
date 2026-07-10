// Aplicación autenticada (CSR, ADR-002): tres paneles del wireframe —
// sesiones + estado del daemon | visor de diff | conversación con tarjetas
// de aprobación inline. En <1024 px los paneles colapsan a tabs.

import { useCallback, useEffect, useRef, useState } from "react";
import type { EventEnvelope } from "@bindings/EventEnvelope";
import { api, getToken, REMOTE_AUTH, setToken } from "./api/client";
import { useStore } from "./state/store";
import { DaemonSocket } from "./ws/connection";
import { SessionSequencer } from "./ws/sequencer";
import { AuditLog } from "./ui/AuditLog";
import { DaemonStatus } from "./ui/DaemonStatus";
import { MicButton } from "./ui/MicButton";
import { DiffViewer } from "./ui/DiffViewer";
import { MessageStream } from "./ui/MessageStream";
import { SessionList } from "./ui/SessionList";

type CenterTab = "diff" | "audit";
type MobilePane = "sesiones" | "trabajo" | "chat";

export function App() {
  if (REMOTE_AUTH) return <RemoteApp />;
  const [token, setTokenState] = useState<string | null>(() => getToken());
  if (!token) {
    return <TokenGate onToken={(t) => setTokenState(t)} />;
  }
  return <Workspace token={token} />;
}

function RemoteApp() {
  const [email, setEmail] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  useEffect(() => { void api.authMe().then((session) => { setEmail(session?.email ?? null); setChecked(true); }); }, []);
  if (!checked) return <main className="token-gate"><p>Comprobando sesión…</p></main>;
  if (!email) return <main className="token-gate"><h1>Rutsubo</h1><p>Inicia sesión para continuar.</p><a className="button-link" href="/api/auth/login">Continuar con Google</a></main>;
  return <Workspace token="" remote email={email} />;
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

function Workspace({ token, remote = false, email }: { token: string; remote?: boolean; email?: string }) {
  const selected = useStore((s) => s.selected);
  const views = useStore((s) => s.views);
  const select = useStore((s) => s.select);
  const [centerTab, setCenterTab] = useState<CenterTab>("diff");
  const [mobilePane, setMobilePane] = useState<MobilePane>("sesiones");

  const socketRef = useRef<DaemonSocket | null>(null);
  const sequencersRef = useRef(new Map<string, SessionSequencer>());

  // Replay REST para el relleno de huecos del secuenciador (C-3 §3.3.5).
  const fetchReplay = useCallback(async (sessionId: string, afterSeq: number) => {
    const page = await api.events(sessionId, afterSeq);
    return page.events as EventEnvelope[];
  }, []);

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

  // Ciclo de vida de la conexión WS. En remoto la URL se resuelve con un
  // ticket efímero por intento (resolveWsUrl); en local con el token.
  useEffect(() => {
    const socket = new DaemonSocket({
      onStatus: (status) => useStore.getState().setStatus(status),
      onEvent: (event) => {
        const sessionId = event.session_id;
        if (!sessionId) return;
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
    });
    socketRef.current = socket;
    socket.connect();
    return () => socket.close();
  }, [token, remote]);

  // Datos iniciales.
  useEffect(() => {
    void api
      .health()
      .then((h) => useStore.getState().setProvider(h.provider))
      .catch(() => useStore.getState().setProvider(null));
    void api
      .listSessions()
      .then((page) => useStore.getState().setSessions(page.sessions))
      .catch(() => {});
  }, []);

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

  return (
    <div className="shell">
      <header className="topbar">
        <h1>Rutsubo</h1>
        <DaemonStatus />
        {remote && <button type="button" onClick={() => void api.logout().then(() => location.reload())}>Salir ({email})</button>}
      </header>

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
          <SessionList onSelect={onSelect} />
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
            <button
              type="button"
              role="tab"
              aria-selected={centerTab === "audit"}
              className={centerTab === "audit" ? "active" : ""}
              onClick={() => setCenterTab("audit")}
            >
              Audit log
            </button>
          </div>
          {centerTab === "diff" ? (
            <DiffViewer diffs={view?.diffs ?? []} />
          ) : (
            <AuditLog />
          )}
        </section>

        <section className={`panel panel-right ${mobilePane === "chat" ? "visible" : ""}`}>
          {view && selected ? (
            <Conversation sessionId={selected} />
          ) : (
            <p className="empty">selecciona o crea una sesión</p>
          )}
        </section>
      </main>
    </div>
  );
}

function Conversation({ sessionId }: { sessionId: string }) {
  const view = useStore((s) => s.views[sessionId]);
  const addUserMessage = useStore((s) => s.addUserMessage);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const busy = view?.state === "running" || view?.state === "waiting_approval";

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const content = draft.trim();
    if (!content) return;
    setError(null);
    // client_msg_id: idempotencia extremo a extremo (C-1).
    const clientMsgId = crypto.randomUUID();
    try {
      const res = await api.sendMessage(sessionId, {
        content,
        client_msg_id: clientMsgId,
      });
      addUserMessage(sessionId, res.message_id, content);
      setDraft("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  if (!view) return null;
  return (
    <div className="conversation">
      <MessageStream view={view} />
      <form className="composer" onSubmit={send}>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={
            view.state === "waiting_approval"
              ? "resuelve la aprobación pendiente primero…"
              : "Escribe una instrucción…"
          }
          rows={2}
          maxLength={32000}
          disabled={view.state === "waiting_approval" || view.state === "archived"}
          aria-label="Instrucción para el agente"
        />
        <button type="submit" disabled={!draft.trim() || view.state === "waiting_approval"}>
          {busy ? "en curso…" : "Enviar"}
        </button>
        <MicButton
          disabled={view.state === "waiting_approval" || view.state === "archived"}
          onText={(text) => setDraft((current) => current ? `${current} ${text}` : text)}
          onError={setError}
        />
      </form>
      {error && <p className="error-text">{error}</p>}
    </div>
  );
}

// Conexión WebSocket al daemon (C-3) con reconexión automática:
// retroceso exponencial con jitter (base 1 s, factor 2, tope 30 s), estado
// visible para la UI (`daemon: ● conectado`) y resuscripción tras reconectar.
//
// La URL se resuelve de forma asíncrona en CADA intento porque en modo remoto
// cada handshake necesita un ticket nuevo de un solo uso (el navegador no
// puede mandar Authorization en el upgrade y el BFF no proxya WebSockets).

import type { CommandEnvelope } from "@bindings/CommandEnvelope";
import type { EventEnvelope } from "@bindings/EventEnvelope";
import { DAEMON_WS, REMOTE_AUTH, api, getToken } from "../api/client";

export type ConnectionStatus = "connecting" | "connected" | "disconnected";

const BACKOFF_BASE_MS = 1_000;
const BACKOFF_CAP_MS = 30_000;

export interface SocketHooks {
  onStatus: (status: ConnectionStatus) => void;
  onEvent: (event: EventEnvelope) => void;
  /** Se invoca en cada (re)conexión: aquí va la resuscripción con after_seq. */
  onOpen: () => void;
}

/** URL del handshake según el modo (se evalúa por intento). */
export async function resolveWsUrl(): Promise<string> {
  if (REMOTE_AUTH) {
    // Ticket efímero de un solo uso emitido por el daemon vía BFF.
    const { ticket } = await api.wsTicket();
    return `${DAEMON_WS}?ticket=${encodeURIComponent(ticket)}`;
  }
  // `?token=` solo para el handshake: la API WebSocket del navegador no
  // permite el header Authorization (excepción local documentada en C-1/D).
  return `${DAEMON_WS}?token=${encodeURIComponent(getToken() ?? "")}`;
}

export class DaemonSocket {
  private socket: WebSocket | null = null;
  private attempts = 0;
  private closedByUser = false;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private hooks: SocketHooks,
    private resolveUrl: () => Promise<string> = resolveWsUrl,
  ) {}

  connect(): void {
    this.closedByUser = false;
    this.hooks.onStatus(this.attempts === 0 ? "connecting" : "disconnected");
    void this.resolveUrl().then(
      (url) => {
        if (this.closedByUser) return;
        this.open(url);
      },
      () => {
        // Sin ticket (BFF caído o sesión vencida): reintento con backoff.
        if (!this.closedByUser) this.scheduleReconnect();
      },
    );
  }

  private open(url: string): void {
    const socket = new WebSocket(url);
    this.socket = socket;

    socket.onopen = () => {
      this.attempts = 0;
      this.hooks.onStatus("connected");
      this.hooks.onOpen();
    };
    socket.onmessage = (message: MessageEvent<string>) => {
      try {
        this.hooks.onEvent(JSON.parse(message.data) as EventEnvelope);
      } catch {
        // frame no-JSON: se ignora (los clientes toleran tipos desconocidos)
      }
    };
    socket.onclose = () => {
      this.socket = null;
      this.hooks.onStatus("disconnected");
      if (!this.closedByUser) this.scheduleReconnect();
    };
    socket.onerror = () => {
      socket.close();
    };
  }

  private scheduleReconnect(): void {
    const exp = Math.min(BACKOFF_BASE_MS * 2 ** this.attempts, BACKOFF_CAP_MS);
    const jitter = Math.random() * exp * 0.3;
    this.attempts += 1;
    this.timer = setTimeout(() => this.connect(), exp + jitter);
  }

  send(command: CommandEnvelope): boolean {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(command));
      return true;
    }
    return false;
  }

  subscribe(sessionId: string, afterSeq: number): void {
    this.send({
      v: 1,
      type: "subscribe_session",
      payload: { session_id: sessionId, after_seq: afterSeq },
      session_id: sessionId,
      ts: new Date().toISOString(),
    });
  }

  close(): void {
    this.closedByUser = true;
    if (this.timer) clearTimeout(this.timer);
    this.socket?.close();
  }
}

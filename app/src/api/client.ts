// Cliente REST tipado del contrato C-1. Los tipos vienen de los bindings
// generados desde el crate `core` (ADR-004): prohibido redeclararlos a mano.

import type { ApprovalsPage } from "@bindings/ApprovalsPage";
import type { AuditPage } from "@bindings/AuditPage";
import type { AsrResponse } from "@bindings/AsrResponse";
import type { CreateSessionRequest } from "@bindings/CreateSessionRequest";
import type { DecisionRequest } from "@bindings/DecisionRequest";
import type { DecisionResponse } from "@bindings/DecisionResponse";
import type { DirListing } from "@bindings/DirListing";
import type { ProviderKeyStatus } from "@bindings/ProviderKeyStatus";
import type { ErrorEnvelope } from "@bindings/ErrorEnvelope";
import type { EventsPage } from "@bindings/EventsPage";
import type { HealthResponse } from "@bindings/HealthResponse";
import type { ModelConfig } from "@bindings/ModelConfig";
import type { PatchSessionRequest } from "@bindings/PatchSessionRequest";
import type { RulesPage } from "@bindings/RulesPage";
import type { SendMessageRequest } from "@bindings/SendMessageRequest";
import type { SendMessageResponse } from "@bindings/SendMessageResponse";
import type { SessionDetail } from "@bindings/SessionDetail";
import type { SessionDto } from "@bindings/SessionDto";
import type { SessionsPage } from "@bindings/SessionsPage";
import type { WsTicketResponse } from "@bindings/WsTicketResponse";

export const REMOTE_AUTH = import.meta.env.VITE_AUTH_MODE === "remote";
export const DAEMON_HTTP = REMOTE_AUTH ? "/api/rutsubo" : (import.meta.env.VITE_DAEMON_HTTP ?? "http://127.0.0.1:7431");
export const DAEMON_WS = import.meta.env.VITE_DAEMON_WS ?? "ws://127.0.0.1:7431/v1/ws";

// Shell de escritorio (ADR-002: la SPA no se bifurca — un solo build sirve
// navegador y Tauri, distinguidos por detección en runtime). El shell activa
// `withGlobalTauri`, así que no hay dependencia npm nueva.
export const IS_TAURI = typeof window !== "undefined" && "__TAURI__" in window;

type TauriGlobal = { core: { invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown> } };

/** Pide al lado Rust del shell el token local del daemon (comando
 *  `get_local_token`). El token viaja solo en memoria: nunca query string,
 *  archivo del frontend ni variable global persistente. `null` = fallo →
 *  la SPA cae al TokenGate normal. */
export async function fetchTauriToken(): Promise<string | null> {
  try {
    const tauri = (window as unknown as { __TAURI__?: TauriGlobal }).__TAURI__;
    if (!tauri) return null;
    const token = await tauri.core.invoke("get_local_token");
    return typeof token === "string" && token.length > 0 ? token : null;
  } catch {
    return null;
  }
}

/** Invoca un comando del lado Rust del shell (solo Tauri). Lanza si el comando
 *  falla; el llamador traduce el error a UI. */
export async function tauriInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const tauri = (window as unknown as { __TAURI__?: TauriGlobal }).__TAURI__;
  if (!tauri) throw new Error("no disponible fuera del escritorio");
  return tauri.core.invoke(cmd, args) as Promise<T>;
}

/** Abre el diálogo NATIVO de selección de carpeta del sistema (solo Tauri).
 *  Devuelve la ruta absoluta elegida, o null si se canceló / no es Tauri. */
export async function pickFolderNative(): Promise<string | null> {
  try {
    const tauri = (window as unknown as { __TAURI__?: TauriGlobal }).__TAURI__;
    if (!tauri) return null;
    const path = await tauri.core.invoke("pick_folder");
    return typeof path === "string" && path.length > 0 ? path : null;
  } catch {
    return null;
  }
}

// El token vive en memoria y se respalda en sessionStorage para sobrevivir
// recargas de la pestaña. Trade-off deliberado (y documentado): jamás
// localStorage —persistiría entre sesiones del navegador y ampliaría la
// ventana de robo—; sessionStorage muere con la pestaña, que es el alcance
// correcto para un token de daemon local.
let tokenInMemory: string | null = null;
const TOKEN_KEY = "rutsubo.token";

export function setToken(token: string | null): void {
  tokenInMemory = token;
  try {
    if (token === null) sessionStorage.removeItem(TOKEN_KEY);
    else sessionStorage.setItem(TOKEN_KEY, token);
  } catch {
    // sessionStorage puede no estar disponible (tests): memoria basta.
  }
}

export function getToken(): string | null {
  if (tokenInMemory) return tokenInMemory;
  try {
    tokenInMemory = sessionStorage.getItem(TOKEN_KEY);
  } catch {
    /* ídem */
  }
  return tokenInMemory;
}

/** Error de la API con el sobre estándar de C-1. */
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token && !REMOTE_AUTH) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";

  let response: Response;
  try {
    response = await fetch(`${DAEMON_HTTP}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, "daemon_unavailable", "no hay conexión con el daemon");
  }

  if (!response.ok) {
    let envelope: ErrorEnvelope | null = null;
    try {
      envelope = (await response.json()) as ErrorEnvelope;
    } catch {
      /* cuerpo no-JSON: error opaco */
    }
    throw new ApiError(
      response.status,
      envelope?.error.code ?? "internal",
      envelope?.error.message ?? `HTTP ${response.status}`,
      envelope?.error.details ?? undefined,
    );
  }
  return (await response.json()) as T;
}

export const api = {
  health: () => request<HealthResponse>("GET", "/v1/health"),
  listSessions: (state?: string) =>
    request<SessionsPage>("GET", `/v1/sessions${state ? `?state=${state}` : ""}`),
  createSession: (req: CreateSessionRequest) =>
    request<SessionDto>("POST", "/v1/sessions", req),
  sessionDetail: (id: string) => request<SessionDetail>("GET", `/v1/sessions/${id}`),
  patchSession: (id: string, req: PatchSessionRequest) =>
    request<SessionDto>("PATCH", `/v1/sessions/${id}`, req),
  sendMessage: (id: string, req: SendMessageRequest) =>
    request<SendMessageResponse>("POST", `/v1/sessions/${id}/messages`, req),
  events: (id: string, afterSeq: number, limit = 1000) =>
    request<EventsPage>(
      "GET",
      `/v1/sessions/${id}/events?after_seq=${afterSeq}&limit=${limit}`,
    ),
  approvals: () => request<ApprovalsPage>("GET", "/v1/approvals"),
  decide: (id: string, req: DecisionRequest) =>
    request<DecisionResponse>("POST", `/v1/approvals/${id}/decision`, req),
  rules: () => request<RulesPage>("GET", "/v1/rules"),
  modelConfig: () => request<ModelConfig>("GET", "/v1/config/model"),
  putModelConfig: (cfg: ModelConfig) => request<ModelConfig>("PUT", "/v1/config/model", cfg),
  // Credencial del proveedor: estado (nunca la key) y configuración.
  providerStatus: () => request<ProviderKeyStatus>("GET", "/v1/config/provider"),
  setProviderKey: (groq_api_key: string | null) =>
    request<ProviderKeyStatus>("PUT", "/v1/config/provider", { groq_api_key }),
  // Explorador de directorios para el selector de carpeta (web).
  browse: (path?: string) =>
    request<DirListing>("GET", `/v1/fs/list${path ? `?path=${encodeURIComponent(path)}` : ""}`),
  audit: (params: { cursor?: string; session_id?: string; provider?: string; limit?: number }) => {
    const query = new URLSearchParams();
    if (params.cursor) query.set("cursor", params.cursor);
    if (params.session_id) query.set("session_id", params.session_id);
    if (params.provider) query.set("provider", params.provider);
    if (params.limit) query.set("limit", String(params.limit));
    const qs = query.toString();
    return request<AuditPage>("GET", `/v1/audit${qs ? `?${qs}` : ""}`);
  },
  async transcribe(audio: Blob, language?: string): Promise<AsrResponse> {
    const data = new FormData();
    data.append("audio", audio, "recording.webm");
    if (language) data.append("language", language);
    const headers: Record<string, string> = {};
    const token = getToken();
    if (token && !REMOTE_AUTH) headers.Authorization = `Bearer ${token}`;
    const response = await fetch(`${DAEMON_HTTP}/v1/asr/transcribe`, { method: "POST", headers, body: data });
    if (!response.ok) {
      const envelope = (await response.json().catch(() => null)) as ErrorEnvelope | null;
      throw new ApiError(response.status, envelope?.error.code ?? "asr_failed", envelope?.error.message ?? "falló la transcripción");
    }
    return response.json() as Promise<AsrResponse>;
  },
  authMe: async () => {
    // Robusto ante BFF caído o respuesta no-JSON: null = sin sesión (nunca
    // dejar la pantalla clavada en "comprobando sesión").
    try {
      const response = await fetch("/api/auth/me");
      if (!response.ok) return null;
      return (await response.json()) as { authenticated: true; email: string };
    } catch {
      return null;
    }
  },
  logout: () => fetch("/api/auth/logout", { method: "POST" }),
  // Ticket efímero de un solo uso para el handshake del WS (el navegador no
  // puede mandar Authorization en el upgrade y el BFF no proxya WebSockets).
  wsTicket: () => request<WsTicketResponse>("POST", "/v1/ws/ticket"),

  // ---- Archivos generados/subidos (web-only, modo remoto) ----
  // Persistidos en Postgres; el proxy BFF los expone bajo /api/rutsubo. Tipos
  // ad-hoc locales (no del contrato C-n): son exclusivos de la web.

  /** Lista de archivos de la sesión (metadatos). */
  listFiles: (id: string) =>
    request<{ files: GeneratedFile[] }>("GET", `/v1/sessions/${id}/files`),

  /** URL cruda de un archivo (para iframe de preview, descarga o pestaña nueva).
   *  El BFF reenvía el Content-Type; el navegador renderiza el HTML. El query
   *  se llama `f` (no `path`): el catch-all del proxy BFF descarta `path`. */
  fileRawUrl: (id: string, path: string) =>
    `${DAEMON_HTTP}/v1/sessions/${id}/files/raw?f=${encodeURIComponent(path)}`,

  /** Sube un archivo de código (multipart; sin Content-Type manual, el
   *  navegador pone el boundary; en remoto la auth es la cookie). */
  async uploadFile(id: string, file: File): Promise<{ saved: string[] }> {
    const data = new FormData();
    data.append("file", file, file.name);
    const headers: Record<string, string> = {};
    const token = getToken();
    if (token && !REMOTE_AUTH) headers.Authorization = `Bearer ${token}`;
    const response = await fetch(`${DAEMON_HTTP}/v1/sessions/${id}/files`, {
      method: "POST",
      headers,
      body: data,
    });
    if (!response.ok) {
      const envelope = (await response.json().catch(() => null)) as ErrorEnvelope | null;
      throw new ApiError(response.status, envelope?.error.code ?? "internal", envelope?.error.message ?? "no se pudo subir el archivo");
    }
    return response.json() as Promise<{ saved: string[] }>;
  },

  /** Login del perfil demo (respaldo con código; sin Google). */
  async demoLogin(code: string): Promise<void> {
    const response = await fetch("/api/auth/demo", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code }),
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      throw new Error(body?.error ?? "código demo inválido");
    }
  },
};

/** Metadatos de un archivo generado/subido (respuesta ad-hoc web-only). */
export interface GeneratedFile {
  path: string;
  mime: string;
  bytes: number;
  updated_at: string;
}

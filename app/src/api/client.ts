// Cliente REST tipado del contrato C-1. Los tipos vienen de los bindings
// generados desde el crate `core` (ADR-004): prohibido redeclararlos a mano.

import type { ApprovalsPage } from "@bindings/ApprovalsPage";
import type { AuditPage } from "@bindings/AuditPage";
import type { AsrResponse } from "@bindings/AsrResponse";
import type { CreateSessionRequest } from "@bindings/CreateSessionRequest";
import type { DecisionRequest } from "@bindings/DecisionRequest";
import type { DecisionResponse } from "@bindings/DecisionResponse";
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

export const REMOTE_AUTH = import.meta.env.VITE_AUTH_MODE === "remote";
export const DAEMON_HTTP = REMOTE_AUTH ? "/api/rutsubo" : (import.meta.env.VITE_DAEMON_HTTP ?? "http://127.0.0.1:7431");
export const DAEMON_WS = import.meta.env.VITE_DAEMON_WS ?? "ws://127.0.0.1:7431/v1/ws";

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
    const response = await fetch("/api/auth/me");
    return response.ok ? (response.json() as Promise<{ authenticated: true; email: string }>) : null;
  },
  logout: () => fetch("/api/auth/logout", { method: "POST" }),
};

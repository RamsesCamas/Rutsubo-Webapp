// Cliente del relay C-2 para el transporte "relay" de la SPA (Google Sign-In):
// canje del id_token por un device_token y buzón de tareas offline (ADR-009).
// La suscripción de eventos va por WSS (ws/connection.ts); aquí solo el canje
// y el buzón por REST. El relay NO expone REST del daemon (RNF-10): en este
// modo no hay mic/ASR ni replay HTTP; el backlog llega por `subscribe_session`.

import type { OutboxAccepted } from "@bindings/OutboxAccepted";
import type { OutboxPage } from "@bindings/OutboxPage";
import type { OutboxRequest } from "@bindings/OutboxRequest";
import { ApiError } from "./client";

export const RELAY_HTTP = import.meta.env.VITE_RELAY_HTTP ?? "http://127.0.0.1:8443";
export const RELAY_WS = import.meta.env.VITE_RELAY_WS ?? "ws://127.0.0.1:8443";
// Client ID **Web** de Google (no es secreto). Vacío ⇒ el botón GIS se oculta
// y solo queda el login "dev" para verificación con RELAY_GOOGLE_DEV.
export const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? "";

// El device_token del relay vive en memoria + sessionStorage (mismo trade-off
// documentado que el token local del daemon: nunca localStorage).
let relayTokenMem: string | null = null;
const RELAY_TOKEN_KEY = "rutsubo.relay_token";
const RELAY_EMAIL_KEY = "rutsubo.relay_email";

export function setRelayToken(token: string | null): void {
  relayTokenMem = token;
  try {
    if (token === null) sessionStorage.removeItem(RELAY_TOKEN_KEY);
    else sessionStorage.setItem(RELAY_TOKEN_KEY, token);
  } catch {
    /* sessionStorage ausente (tests): la memoria basta */
  }
}

export function getRelayToken(): string | null {
  if (relayTokenMem) return relayTokenMem;
  try {
    relayTokenMem = sessionStorage.getItem(RELAY_TOKEN_KEY);
  } catch {
    /* ídem */
  }
  return relayTokenMem;
}

export function setRelayEmail(email: string | null): void {
  try {
    if (email === null) sessionStorage.removeItem(RELAY_EMAIL_KEY);
    else sessionStorage.setItem(RELAY_EMAIL_KEY, email);
  } catch {
    /* ídem */
  }
}

export function getRelayEmail(): string | null {
  try {
    return sessionStorage.getItem(RELAY_EMAIL_KEY);
  } catch {
    return null;
  }
}

/** URL del handshake de suscripción al relay. El navegador no puede mandar
 *  Authorization en el upgrade, así que el device_token va en query (excepción
 *  documentada, igual que el token local del daemon en C-1/D). */
export function relaySubscribeUrl(): string {
  return `${RELAY_WS}/v1/subscribe?token=${encodeURIComponent(getRelayToken() ?? "")}`;
}

async function relayRequest<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  const token = getRelayToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  let response: Response;
  try {
    response = await fetch(`${RELAY_HTTP}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, "relay_unavailable", "no hay conexión con el relay");
  }
  if (response.status === 204) return undefined as T;
  if (!response.ok) {
    const envelope = (await response.json().catch(() => null)) as
      | { error?: { code?: string; message?: string } }
      | null;
    throw new ApiError(
      response.status,
      envelope?.error?.code ?? "relay_error",
      envelope?.error?.message ?? `HTTP ${response.status}`,
    );
  }
  return (await response.json()) as T;
}

export interface GoogleExchange {
  device_token: string;
  device_id: string;
  account_id: string;
}

export const relayApi = {
  /** Canjea el id_token de Google por un device_token del relay (C-2). */
  googleExchange: (idToken: string, name = "Navegador") =>
    relayRequest<GoogleExchange>("POST", "/v1/auth/google", {
      id_token: idToken,
      device: { kind: "web", name },
    }),
  /** Encola (o entrega) una tarea. `state: queued` ⇒ el escritorio está offline. */
  enqueue: (req: OutboxRequest) => relayRequest<OutboxAccepted>("POST", "/v1/outbox", req),
  /** Lista el buzón propio (tareas en cola / entregándose). */
  outbox: () => relayRequest<OutboxPage>("GET", "/v1/outbox"),
  /** Cancela una tarea en cola. */
  cancel: (id: string) => relayRequest<void>("DELETE", `/v1/outbox/${id}`),
};

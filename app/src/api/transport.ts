// Abstracción de transporte cliente→daemon. En modo REST los comandos van por
// HTTP al daemon (C-1); en modo relay van por el WSS del relay envueltos como
// comandos C-3 (el relay los reenvía al daemon), y los envíos pasan por el
// buzón (ADR-009): el relay entrega al instante si el escritorio está online o
// encola si no. Un componente (ApprovalCard, Conversation) usa `useTransport()`
// y no sabe en qué modo está.

import { createContext, useContext } from "react";
import type { CommandEnvelope } from "@bindings/CommandEnvelope";
import type { Decision } from "@bindings/Decision";
import { api } from "./client";
import { relayApi } from "./relay";
import type { DaemonSocket } from "../ws/connection";

export type TransportMode = "rest" | "relay";

export interface SendResult {
  /** true ⇒ quedó en el buzón (escritorio offline). */
  queued: boolean;
  /** id local del mensaje del usuario (para el eco optimista). */
  messageId: string;
}

export interface Transport {
  mode: TransportMode;
  /** REST expone mic/ASR y replay por HTTP; relay no (RNF-10). */
  supportsRest: boolean;
  decide(
    sessionId: string,
    approvalId: string,
    decision: Decision,
    rememberRule: boolean,
  ): Promise<void>;
  send(sessionId: string | null, content: string, opts?: { title?: string }): Promise<SendResult>;
}

export function restTransport(): Transport {
  return {
    mode: "rest",
    supportsRest: true,
    async decide(_sessionId, approvalId, decision, rememberRule) {
      await api.decide(approvalId, { decision, reason: null, remember_rule: rememberRule });
    },
    async send(sessionId, content) {
      if (!sessionId) throw new Error("REST: crear sesión antes de enviar");
      const res = await api.sendMessage(sessionId, {
        content,
        client_msg_id: crypto.randomUUID(),
      });
      return { queued: false, messageId: res.message_id };
    },
  };
}

export function relayTransport(
  // Getter perezoso: el socket se crea en un efecto, después del primer render.
  getSocket: () => DaemonSocket | null,
  onQueued: () => void,
): Transport {
  return {
    mode: "relay",
    supportsRest: false,
    async decide(sessionId, approvalId, decision, rememberRule) {
      // El relay reenvía el comando al daemon (mismo efecto interno que REST).
      const command: CommandEnvelope = {
        v: 1,
        type: "resolve_approval",
        payload: { approval_id: approvalId, decision, reason: null, remember_rule: rememberRule },
        session_id: sessionId,
        ts: new Date().toISOString(),
      };
      getSocket()?.send(command);
    },
    async send(sessionId, content, opts) {
      // Va SIEMPRE por el buzón: entrega inmediata si el escritorio está online
      // o `queued` si no. El estado actualiza el rótulo Enviar/Encolar.
      const accepted = await relayApi.enqueue({
        target: {
          session_id: sessionId,
          new_session_title: sessionId ? null : (opts?.title ?? "Tarea desde la web"),
        },
        payload_kind: "plaintext",
        payload: content,
        client_msg_id: crypto.randomUUID(),
      });
      onQueued();
      return { queued: accepted.state === "queued", messageId: accepted.outbox_id };
    },
  };
}

const TransportContext = createContext<Transport>(restTransport());
export const TransportProvider = TransportContext.Provider;
export function useTransport(): Transport {
  return useContext(TransportContext);
}

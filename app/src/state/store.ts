// Store de la SPA (Zustand). La fuente de verdad del historial es la
// secuencia de eventos C-3: el estado de UI se deriva reduciendo eventos
// (`applyEvent`), lo que hace el replay tras reconexión gratuito.

import { create } from "zustand";
import type { EventEnvelope } from "@bindings/EventEnvelope";
import type { OutboxItem } from "@bindings/OutboxItem";
import type { ProviderStatus } from "@bindings/ProviderStatus";
import type { SessionDto } from "@bindings/SessionDto";
import type { SessionState } from "@bindings/SessionState";
import type { ConnectionStatus } from "../ws/connection";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  completed: boolean;
  stopReason?: string;
}

export interface PendingApproval {
  approvalId: string;
  toolCallId: string;
  tool: string;
  summary: string;
  args: unknown;
}

export interface DiffView {
  toolCallId: string;
  path: string;
  unified: string;
  additions: number;
  deletions: number;
}

export interface ToolActivity {
  toolCallId: string;
  tool: string;
  args: unknown;
  ok?: boolean;
  outputExcerpt?: string;
  rejected?: boolean;
}

export interface SessionView {
  state: SessionState;
  messages: ChatMessage[];
  approvals: PendingApproval[];
  diffs: DiffView[];
  tools: ToolActivity[];
  notices: string[];
  /** true mientras el secuenciador rellena un hueco (pausa de render). */
  gapFilling: boolean;
}

const emptyView = (): SessionView => ({
  state: "idle",
  messages: [],
  approvals: [],
  diffs: [],
  tools: [],
  notices: [],
  gapFilling: false,
});

interface AppStore {
  status: ConnectionStatus;
  provider: ProviderStatus | null;
  sessions: SessionDto[];
  selected: string | null;
  views: Record<string, SessionView>;
  /** Buzón de tareas offline (solo transporte relay). */
  outbox: OutboxItem[];
  /** El escritorio está offline: en relay lo marca `daemon_unavailable` o un
   *  encolado que quedó `queued`. Cambia el rótulo Enviar→Encolar. */
  daemonOffline: boolean;

  setStatus: (status: ConnectionStatus) => void;
  setProvider: (provider: ProviderStatus | null) => void;
  setSessions: (sessions: SessionDto[]) => void;
  upsertSession: (session: SessionDto) => void;
  select: (sessionId: string | null) => void;
  setGapFilling: (sessionId: string, filling: boolean) => void;
  setOutbox: (outbox: OutboxItem[]) => void;
  setDaemonOffline: (offline: boolean) => void;
  /** Mensaje del usuario: local (los comandos no producen evento propio). */
  addUserMessage: (sessionId: string, id: string, text: string) => void;
  /** Reducción de un evento C-3 al estado de la vista. */
  applyEvent: (event: EventEnvelope) => void;
}

export const useStore = create<AppStore>((set) => ({
  status: "connecting",
  provider: null,
  sessions: [],
  selected: null,
  views: {},
  outbox: [],
  daemonOffline: false,

  setStatus: (status) => set({ status }),
  setOutbox: (outbox) => set({ outbox }),
  setDaemonOffline: (daemonOffline) => set({ daemonOffline }),
  setProvider: (provider) => set({ provider }),
  setSessions: (sessions) => set({ sessions }),
  upsertSession: (session) =>
    set((store) => {
      const rest = store.sessions.filter((s) => s.id !== session.id);
      return { sessions: [session, ...rest] };
    }),
  select: (selected) => set({ selected }),
  setGapFilling: (sessionId, filling) =>
    set((store) => {
      const view = store.views[sessionId] ?? emptyView();
      return { views: { ...store.views, [sessionId]: { ...view, gapFilling: filling } } };
    }),
  addUserMessage: (sessionId, id, text) =>
    set((store) => {
      const view = store.views[sessionId] ?? emptyView();
      if (view.messages.some((m) => m.id === id)) return {};
      return {
        views: {
          ...store.views,
          [sessionId]: {
            ...view,
            messages: [...view.messages, { id, role: "user", text, completed: true }],
          },
        },
      };
    }),

  applyEvent: (event) =>
    set((store) => {
      const sessionId = event.session_id;
      if (!sessionId) {
        // Globales: `daemon_unavailable` es presencia (relay) → escritorio offline.
        if (event.type === "daemon_unavailable") return { daemonOffline: true };
        return {};
      }
      // Llega un evento vivo de una sesión ⇒ el escritorio está online.
      const view = reduce(store.views[sessionId] ?? emptyView(), event);
      const patch: Partial<AppStore> = {
        views: { ...store.views, [sessionId]: view },
      };
      if (store.daemonOffline) patch.daemonOffline = false;
      if (event.type === "session_state") {
        patch.sessions = store.sessions.map((s) =>
          s.id === sessionId
            ? {
                ...s,
                state: event.payload.state,
                title: event.payload.title ?? s.title,
              }
            : s,
        );
      }
      return patch;
    }),
}));

/** Reductor puro evento → vista. */
function reduce(view: SessionView, event: EventEnvelope): SessionView {
  switch (event.type) {
    case "session_state":
      return { ...view, state: event.payload.state };

    case "message_delta": {
      const id = event.payload.message_id;
      const existing = view.messages.find((m) => m.id === id);
      const messages = existing
        ? view.messages.map((m) =>
            m.id === id ? { ...m, text: m.text + event.payload.delta } : m,
          )
        : [
            ...view.messages,
            {
              id,
              role: "assistant" as const,
              text: event.payload.delta,
              completed: false,
            },
          ];
      return { ...view, messages };
    }

    case "message_completed":
      return {
        ...view,
        messages: view.messages.map((m) =>
          m.id === event.payload.message_id
            ? { ...m, completed: true, stopReason: event.payload.stop_reason }
            : m,
        ),
      };

    case "tool_call_requested":
      return {
        ...view,
        tools: [
          ...view.tools,
          {
            toolCallId: event.payload.tool_call_id,
            tool: event.payload.tool,
            args: event.payload.args,
          },
        ],
      };

    case "tool_result":
      return {
        ...view,
        tools: view.tools.map((t) =>
          t.toolCallId === event.payload.tool_call_id
            ? {
                ...t,
                ok: event.payload.ok,
                outputExcerpt: event.payload.output_excerpt,
                rejected: !event.payload.ok && event.payload.output_excerpt.includes("rechazado"),
              }
            : t,
        ),
      };

    case "approval_request":
      return {
        ...view,
        approvals: [
          ...view.approvals,
          {
            approvalId: event.payload.approval_id,
            toolCallId: event.payload.tool_call_id,
            tool: event.payload.tool,
            summary: event.payload.summary,
            args: event.payload.args,
          },
        ],
      };

    // RF-17: la tarjeta se retira aunque la decisión venga de otro cliente.
    case "approval_resolved":
      return {
        ...view,
        approvals: view.approvals.filter((a) => a.approvalId !== event.payload.approval_id),
      };

    case "file_diff":
      return {
        ...view,
        diffs: [
          ...view.diffs,
          {
            toolCallId: event.payload.tool_call_id,
            path: event.payload.path,
            unified: event.payload.diff_unified,
            additions: event.payload.additions,
            deletions: event.payload.deletions,
          },
        ],
      };

    case "model_provider_changed":
      return {
        ...view,
        notices: [
          ...view.notices,
          `proveedor: ${event.payload.from} → ${event.payload.to} (${event.payload.trigger})`,
        ],
      };

    case "error":
      return {
        ...view,
        notices: [...view.notices, `error: ${event.payload.message}`],
      };

    case "daemon_unavailable":
    default:
      return view;
  }
}

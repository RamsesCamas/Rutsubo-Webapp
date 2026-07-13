// Presencia del escritorio (relay): `daemon_unavailable` global marca offline;
// cualquier evento vivo de sesión lo limpia (el escritorio está online).

import { beforeEach, describe, expect, it } from "vitest";
import type { EventEnvelope } from "@bindings/EventEnvelope";
import { useStore } from "./store";

const daemonUnavailable = {
  v: 1,
  type: "daemon_unavailable",
  session_id: null,
  ts: "2026-07-13T00:00:00Z",
} as unknown as EventEnvelope;

const sessionState = {
  v: 1,
  type: "session_state",
  session_id: "s1",
  seq: 1,
  ts: "2026-07-13T00:00:01Z",
  payload: { state: "running" },
} as unknown as EventEnvelope;

describe("presencia del escritorio en el store", () => {
  beforeEach(() => {
    useStore.setState({ daemonOffline: false, views: {}, sessions: [] });
  });

  it("daemon_unavailable global marca el escritorio offline", () => {
    useStore.getState().applyEvent(daemonUnavailable);
    expect(useStore.getState().daemonOffline).toBe(true);
  });

  it("un evento vivo de sesión limpia el flag offline", () => {
    useStore.setState({ daemonOffline: true });
    useStore.getState().applyEvent(sessionState);
    expect(useStore.getState().daemonOffline).toBe(false);
    // y reduce a la vista de la sesión
    expect(useStore.getState().views.s1?.state).toBe("running");
  });
});

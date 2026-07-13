// Transporte relay: los envíos van por el buzón (queued ⇒ escritorio offline) y
// las decisiones se reenvían como comandos C-3 `resolve_approval`.

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CommandEnvelope } from "@bindings/CommandEnvelope";
import { relayTransport } from "./transport";

vi.mock("./relay", () => ({
  relayApi: {
    enqueue: vi.fn(),
  },
}));
import { relayApi } from "./relay";

describe("relayTransport", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("send encola y devuelve queued=true cuando el escritorio está offline", async () => {
    vi.mocked(relayApi.enqueue).mockResolvedValue({
      outbox_id: "o-1",
      state: "queued",
      expires_at: "2026-07-20T00:00:00Z",
    });
    const onQueued = vi.fn();
    const t = relayTransport(() => null, onQueued);

    const res = await t.send(null, "agrega docstrings", { title: "T" });

    expect(res.queued).toBe(true);
    expect(res.messageId).toBe("o-1");
    expect(onQueued).toHaveBeenCalledOnce();
    const req = vi.mocked(relayApi.enqueue).mock.calls[0][0];
    expect(req.target).toEqual({ session_id: null, new_session_title: "T" });
    expect(req.payload).toBe("agrega docstrings");
    expect(req.payload_kind).toBe("plaintext");
  });

  it("send a una sesión existente no pone título nuevo y queued=false si se entregó", async () => {
    vi.mocked(relayApi.enqueue).mockResolvedValue({
      outbox_id: "o-2",
      state: "delivered",
      expires_at: "2026-07-20T00:00:00Z",
    });
    const t = relayTransport(() => null, () => {});

    const res = await t.send("s1", "sigue");

    expect(res.queued).toBe(false);
    const req = vi.mocked(relayApi.enqueue).mock.calls[0][0];
    expect(req.target).toEqual({ session_id: "s1", new_session_title: null });
  });

  it("decide envía un comando resolve_approval por el socket", async () => {
    const sent: CommandEnvelope[] = [];
    const socket = { send: (c: CommandEnvelope) => sent.push(c) };
    const t = relayTransport(() => socket as never, () => {});

    await t.decide("s1", "a-1", "approve", true);

    expect(sent).toHaveLength(1);
    expect(sent[0].type).toBe("resolve_approval");
    expect(sent[0].session_id).toBe("s1");
    if (sent[0].type === "resolve_approval") {
      expect(sent[0].payload.approval_id).toBe("a-1");
      expect(sent[0].payload.decision).toBe("approve");
      expect(sent[0].payload.remember_rule).toBe(true);
    }
  });
});

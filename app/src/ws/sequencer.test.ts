// Aceptación Fase E: la semántica C-3 del cliente (orden por seq, descarte de
// duplicados, hueco → pausa → replay REST → empalme) con servidor simulado.

import { describe, expect, it, vi } from "vitest";
import type { EventEnvelope } from "@bindings/EventEnvelope";
import { SessionSequencer, type SequencerHooks } from "./sequencer";

const SID = "01J1ZG7QXW8Y2K3M4N5P6Q7R8S";

function envelope(seq: number): EventEnvelope {
  return {
    v: 1,
    type: "message_delta",
    payload: { message_id: "01J1ZH2K0000000000000000AA", delta: `d${seq}` },
    session_id: SID,
    seq,
    ts: "2026-07-06T18:00:00Z",
  };
}

function collector() {
  const delivered: number[] = [];
  const gaps: boolean[] = [];
  const hooks: SequencerHooks = {
    onEvent: (e) => delivered.push(e.seq!),
    fetchReplay: vi.fn(async () => [] as EventEnvelope[]),
    onGapState: (filling) => gaps.push(filling),
  };
  return { delivered, gaps, hooks };
}

describe("SessionSequencer", () => {
  it("entrega en orden y descarta duplicados sin tocar el replay", async () => {
    const { delivered, hooks } = collector();
    const seq = new SessionSequencer(SID, 0, hooks);
    await seq.push(envelope(1));
    await seq.push(envelope(2));
    await seq.push(envelope(2)); // duplicado
    await seq.push(envelope(3));
    expect(delivered).toEqual([1, 2, 3]);
    expect(hooks.fetchReplay).not.toHaveBeenCalled();
    expect(seq.processedSeq).toBe(3);
  });

  it("ignora eventos con seq ya visto tras reconexión (after_seq)", async () => {
    const { delivered, hooks } = collector();
    const seq = new SessionSequencer(SID, 25, hooks);
    await seq.push(envelope(24)); // anterior al punto de suscripción
    await seq.push(envelope(26));
    expect(delivered).toEqual([26]);
  });

  it("ante un hueco pausa, rellena por REST y empalma en orden", async () => {
    const { delivered, gaps, hooks } = collector();
    hooks.fetchReplay = vi.fn(async (_sid: string, afterSeq: number) => {
      expect(afterSeq).toBe(1);
      return [envelope(2), envelope(3), envelope(4)];
    });
    const seq = new SessionSequencer(SID, 0, hooks);
    await seq.push(envelope(1));
    await seq.push(envelope(5)); // hueco 2..4
    expect(delivered).toEqual([1, 2, 3, 4, 5]);
    expect(hooks.fetchReplay).toHaveBeenCalledTimes(1);
    expect(gaps).toEqual([true, false]); // pausa y reanudación notificadas
  });

  it("empalma sin duplicar lo que llega en vivo durante el replay", async () => {
    const { delivered, hooks } = collector();
    let release!: (events: EventEnvelope[]) => void;
    hooks.fetchReplay = vi.fn(
      () => new Promise<EventEnvelope[]>((resolve) => (release = resolve)),
    );
    const seq = new SessionSequencer(SID, 0, hooks);
    await seq.push(envelope(1));
    const gapPush = seq.push(envelope(4)); // hueco 2..3 → replay pendiente

    // Mientras el replay está en vuelo llegan eventos vivos y un duplicado.
    await seq.push(envelope(5));
    await seq.push(envelope(2)); // también vendrá en el replay: no debe duplicarse

    release([envelope(2), envelope(3)]);
    await gapPush;

    expect(delivered).toEqual([1, 2, 3, 4, 5]);
  });

  it("itera el replay cuando la brecha supera una página", async () => {
    const { delivered, hooks } = collector();
    const pages: Record<number, EventEnvelope[]> = {
      1: [envelope(2), envelope(3)],
      3: [envelope(4), envelope(5)],
    };
    hooks.fetchReplay = vi.fn(async (_sid: string, afterSeq: number) => pages[afterSeq] ?? []);
    const seq = new SessionSequencer(SID, 0, hooks);
    await seq.push(envelope(1));
    await seq.push(envelope(6)); // brecha 2..5, servida en dos páginas
    expect(delivered).toEqual([1, 2, 3, 4, 5, 6]);
    expect(hooks.fetchReplay).toHaveBeenCalledTimes(2);
  });
});

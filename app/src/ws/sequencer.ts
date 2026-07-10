// Semántica C-3 del lado cliente, por sesión:
//  (a) procesar eventos en orden de `seq`;
//  (b) descartar duplicados (seq ya visto);
//  (c) ante un hueco: suspender la entrega, rellenar vía replay REST
//      (`GET /v1/sessions/{id}/events?after_seq=`) y empalmar sin duplicar.
// Lógica pura y testeable: la conexión WS solo hace `push(envelope)`.

import type { EventEnvelope } from "@bindings/EventEnvelope";

export interface SequencerHooks {
  /** Entrega en orden estricto de seq (la UI reduce estado desde aquí). */
  onEvent: (event: EventEnvelope) => void;
  /** Replay REST: eventos con seq > afterSeq, ascendentes. */
  fetchReplay: (sessionId: string, afterSeq: number) => Promise<EventEnvelope[]>;
  /** Señal de pausa/reanudación del render durante el relleno de huecos. */
  onGapState?: (filling: boolean) => void;
}

export class SessionSequencer {
  private lastSeq: number;
  /** Eventos llegados fuera de orden, a la espera de empalme. */
  private pending = new Map<number, EventEnvelope>();
  private filling = false;

  constructor(
    private sessionId: string,
    afterSeq: number,
    private hooks: SequencerHooks,
  ) {
    this.lastSeq = afterSeq;
  }

  get processedSeq(): number {
    return this.lastSeq;
  }

  /** Punto de entrada único: cualquier evento de la sesión, en cualquier orden. */
  async push(event: EventEnvelope): Promise<void> {
    const seq = event.seq;
    if (seq === undefined || seq === null) return; // sin seq: no persistido
    if (seq <= this.lastSeq) return; // (b) duplicado

    this.pending.set(seq, event);
    if (this.filling) return; // el relleno en curso hará el empalme

    if (seq === this.lastSeq + 1) {
      this.drain();
      return;
    }
    // (c) hueco detectado → pausa + replay REST + empalme.
    await this.fillGap();
  }

  /** Entrega todo lo contiguo acumulado. */
  private drain(): void {
    let next = this.pending.get(this.lastSeq + 1);
    while (next !== undefined) {
      this.pending.delete(this.lastSeq + 1);
      this.lastSeq += 1;
      this.hooks.onEvent(next);
      next = this.pending.get(this.lastSeq + 1);
    }
  }

  private async fillGap(): Promise<void> {
    this.filling = true;
    this.hooks.onGapState?.(true);
    try {
      // Itera por si la brecha supera el límite de una página de replay.
      for (;;) {
        const before = this.lastSeq;
        const replayed = await this.hooks.fetchReplay(this.sessionId, this.lastSeq);
        for (const event of replayed) {
          const seq = event.seq;
          if (seq !== undefined && seq !== null && seq > this.lastSeq) {
            this.pending.set(seq, event);
          }
        }
        this.drain();
        const gapClosed = this.pending.size === 0;
        const progressed = this.lastSeq > before;
        if (gapClosed || !progressed) break;
      }
    } finally {
      this.filling = false;
      this.hooks.onGapState?.(false);
      // Lo llegado en vivo durante el relleno puede haber cerrado el hueco.
      this.drain();
    }
  }
}

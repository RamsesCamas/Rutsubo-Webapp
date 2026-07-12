// Test de contrato multi-repo: TODOS los fixtures de evento del contrato
// vendorizado (`contract/fixtures/event/`) deben atravesar el reducer del
// store sin lanzar — incluidos los de tipo desconocido para esta versión de
// la SPA (tolerancia de C-3). Si el core añade un evento y el reducer truena,
// este test lo detecta antes que un usuario.

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { EventEnvelope } from "@bindings/EventEnvelope";
import { useStore } from "./store";

const contractDir = join(__dirname, "..", "..", "..", "contract");
const eventsDir = join(contractDir, "fixtures", "event");

describe("contrato vendorizado", () => {
  it("la VERSION del contrato coincide con el pin del package.json", () => {
    const version = Number(readFileSync(join(contractDir, "VERSION"), "utf8").trim());
    const pkg = JSON.parse(
      readFileSync(join(contractDir, "..", "package.json"), "utf8"),
    ) as { contractVersion?: number };
    expect(pkg.contractVersion).toBe(version);
  });

  const fixtures = readdirSync(eventsDir).filter((f) => f.endsWith(".json"));

  it("hay fixtures de evento vendorizados", () => {
    expect(fixtures.length).toBeGreaterThan(0);
  });

  it.each(fixtures)("applyEvent tolera el fixture %s", (file) => {
    const envelope = JSON.parse(
      readFileSync(join(eventsDir, file), "utf8"),
    ) as EventEnvelope;
    expect(() => useStore.getState().applyEvent(envelope)).not.toThrow();
  });
});

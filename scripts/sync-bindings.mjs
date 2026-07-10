// Sincroniza los bindings ts-rs generados por el backend (repo hermano
// Rutsubo) hacia bindings/ de este repo. Los tipos del protocolo se escriben
// UNA vez en Rust y se derivan a TypeScript (ADR-004, RNF-17); este script es
// la costura entre los dos repositorios (decisión documentada en
// docs/decisions/). Con --check solo verifica drift (para CI).

import { cpSync, existsSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(root, "..", "Rutsubo", "crates", "core", "bindings");
const target = join(root, "bindings");
const checkOnly = process.argv.includes("--check");

if (!existsSync(source)) {
  console.error(
    `sync-bindings: no existe ${source}\n` +
      "Clona el backend como repo hermano: ../Rutsubo (github.com/RamsesCamas/Rutsubo)",
  );
  process.exit(1);
}

function listFiles(dir, prefix = "") {
  const out = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      out.push(...listFiles(path, `${prefix}${name}/`));
    } else if (name.endsWith(".ts")) {
      out.push(`${prefix}${name}`);
    }
  }
  return out.sort();
}

function diverges() {
  if (!existsSync(target)) return true;
  const a = listFiles(source);
  const b = listFiles(target);
  if (a.join("\n") !== b.join("\n")) return true;
  return a.some(
    (f) => readFileSync(join(source, f), "utf8") !== readFileSync(join(target, f), "utf8"),
  );
}

if (checkOnly) {
  if (diverges()) {
    console.error(
      "check:bindings: bindings/ difiere de ../Rutsubo/crates/core/bindings — corre `npm run sync:bindings` y commitea",
    );
    process.exit(1);
  }
  console.log("check:bindings: sin drift");
} else {
  rmSync(target, { recursive: true, force: true });
  cpSync(source, target, { recursive: true });
  console.log(`sync-bindings: ${listFiles(target).length} archivos copiados a bindings/`);
}

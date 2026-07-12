// Vendoriza el contrato versionado del backend (repo hermano Rutsubo,
// directorio contract-export/) hacia contract/ de este repo, y alinea el pin
// `contractVersion` del package.json. Territorio generado: prohibido editar
// contract/ a mano — un cambio de protocolo nace en el core, se exporta y se
// sincroniza, en ese orden. Con --check solo verifica drift (para CI).

import {
  cpSync,
  existsSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(root, "..", "Rutsubo", "contract-export");
const target = join(root, "contract");
const checkOnly = process.argv.includes("--check");

function listFiles(dir, prefix = "") {
  const out = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      out.push(...listFiles(path, `${prefix}${name}/`));
    } else {
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

function pinnedVersion() {
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  return pkg.contractVersion;
}

if (checkOnly) {
  if (existsSync(source) && diverges()) {
    console.error(
      "check:contract: contract/ difiere de ../Rutsubo/contract-export — corre `npm run sync:contract` y commitea",
    );
    process.exit(1);
  }
  const version = Number(readFileSync(join(target, "VERSION"), "utf8").trim());
  if (pinnedVersion() !== version) {
    console.error(
      `check:contract: el pin contractVersion=${pinnedVersion()} del package.json no coincide con contract/VERSION=${version}`,
    );
    process.exit(1);
  }
  console.log(`check:contract: sin drift (VERSION ${version})`);
} else {
  if (!existsSync(source)) {
    console.error(
      `sync-contract: no existe ${source}\n` +
        "Clona el backend como repo hermano y corre `just contract-export` ahí.",
    );
    process.exit(1);
  }
  rmSync(target, { recursive: true, force: true });
  cpSync(source, target, { recursive: true });
  const version = Number(readFileSync(join(target, "VERSION"), "utf8").trim());
  const pkgPath = join(root, "package.json");
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
  pkg.contractVersion = version;
  writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
  console.log(
    `sync-contract: ${listFiles(target).length} archivos copiados a contract/ (VERSION ${version})`,
  );
}

// Visor de diffs (RF-28): render del unified con líneas +/− coloreadas
// (verde/rojo accesibles), contador `+a / −d`, colapsable por archivo.
// Solo lectura: no hay editor.

import { useState } from "react";
import type { DiffView } from "../state/store";

function lineClass(line: string): string {
  if (line.startsWith("+++") || line.startsWith("---")) return "diff-file";
  if (line.startsWith("@@")) return "diff-hunk";
  if (line.startsWith("+")) return "diff-add";
  if (line.startsWith("-")) return "diff-del";
  return "diff-ctx";
}

function DiffFile({ diff }: { diff: DiffView }) {
  const [open, setOpen] = useState(true);
  return (
    <section className="diff-file-block">
      <button type="button" className="diff-header" onClick={() => setOpen(!open)}>
        <span className="diff-toggle">{open ? "▾" : "▸"}</span>
        <code>{diff.path}</code>
        <span className="diff-counter">
          <span className="count-add">+{diff.additions}</span>
          {" / "}
          <span className="count-del">−{diff.deletions}</span>
        </span>
      </button>
      {open && (
        <pre className="diff-body">
          {diff.unified.split("\n").map((line, i) => (
            <span key={i} className={`diff-line ${lineClass(line)}`}>
              {line || " "}
              {"\n"}
            </span>
          ))}
        </pre>
      )}
    </section>
  );
}

export function DiffViewer({ diffs }: { diffs: DiffView[] }) {
  if (diffs.length === 0) {
    return <p className="empty">sin cambios a archivos en esta sesión</p>;
  }
  return (
    <div className="diff-viewer">
      {diffs.map((d, i) => (
        <DiffFile key={`${d.toolCallId}-${i}`} diff={d} />
      ))}
    </div>
  );
}

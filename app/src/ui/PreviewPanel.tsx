// Vista de archivos generados/subidos (web desplegada, modo remoto). Lista los
// archivos persistidos en Postgres y, para HTML, los renderiza en una "ventana
// dedicada" (iframe aislado) o los abre en una pestaña del navegador. Otros
// tipos: vista de texto + descarga. El contenido crudo lo sirve el daemon y el
// BFF reenvía el Content-Type, por lo que el HTML se muestra tal cual.

import { useCallback, useEffect, useState } from "react";
import { api, type GeneratedFile } from "../api/client";

export function PreviewPanel({ sessionId }: { sessionId: string | null }) {
  const [files, setFiles] = useState<GeneratedFile[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!sessionId) return;
    try {
      const { files } = await api.listFiles(sessionId);
      setFiles(files);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [sessionId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const current = files.find((f) => f.path === selected) ?? null;
  const isHtml = current?.mime.includes("text/html") ?? false;
  const rawUrl = sessionId && selected ? api.fileRawUrl(sessionId, selected) : "";

  // Para archivos no-HTML mostramos el texto; se busca al seleccionar.
  useEffect(() => {
    setText(null);
    if (!current || isHtml || !rawUrl) return;
    let alive = true;
    void fetch(rawUrl)
      .then((r) => r.text())
      .then((body) => {
        if (alive) setText(body);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [current, isHtml, rawUrl]);

  if (!sessionId) return <p className="empty">selecciona una sesión</p>;

  return (
    <div className="preview">
      <div className="preview-bar">
        <select
          value={selected ?? ""}
          onChange={(e) => setSelected(e.target.value || null)}
          aria-label="Archivo a previsualizar"
        >
          <option value="">— elige un archivo ({files.length}) —</option>
          {files.map((f) => (
            <option key={f.path} value={f.path}>
              {f.path} ({f.bytes} B)
            </option>
          ))}
        </select>
        <button type="button" className="ghost" onClick={() => void refresh()} title="Actualizar">
          ↻
        </button>
        {selected && (
          <>
            <a className="ghost" href={rawUrl} target="_blank" rel="noreferrer">
              Abrir en pestaña nueva
            </a>
            <a className="ghost" href={rawUrl} download={selected}>
              Descargar
            </a>
          </>
        )}
      </div>

      {error && <p className="error-text">{error}</p>}
      {!selected && !error && (
        <p className="empty">
          Pide al agente que genere un archivo (p. ej. un HTML con un botón) y aparecerá aquí.
        </p>
      )}
      {current && isHtml && (
        // Ventana dedicada: iframe aislado (sandbox) que ejecuta el script del
        // HTML pero no puede tocar la app. El BFF no reenvía X-Frame-Options.
        <iframe
          className="preview-frame"
          title={`preview ${selected}`}
          src={rawUrl}
          sandbox="allow-scripts"
        />
      )}
      {current && !isHtml && (
        <pre className="preview-text">{text ?? "cargando…"}</pre>
      )}
    </div>
  );
}

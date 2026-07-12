// Selector de carpeta del workspace. En Tauri usa el diálogo NATIVO del
// sistema (comando pick_folder); en web abre un explorador servido por el
// daemon (GET /v1/fs/list). En ambos casos el usuario elige una carpeta sin
// escribir rutas absolutas a mano.

import { useEffect, useState } from "react";
import { api, IS_TAURI, pickFolderNative } from "../api/client";
import type { DirListing } from "@bindings/DirListing";

export function FolderPicker({ onPick }: { onPick: (path: string) => void }) {
  const [browsing, setBrowsing] = useState(false);

  async function choose() {
    if (IS_TAURI) {
      const path = await pickFolderNative();
      if (path) onPick(path);
      return;
    }
    setBrowsing(true);
  }

  return (
    <>
      <button type="button" className="ghost" onClick={() => void choose()}>
        📁 Elegir carpeta…
      </button>
      {browsing && (
        <FolderBrowser
          onClose={() => setBrowsing(false)}
          onPick={(p) => {
            setBrowsing(false);
            onPick(p);
          }}
        />
      )}
    </>
  );
}

function FolderBrowser({ onPick, onClose }: { onPick: (path: string) => void; onClose: () => void }) {
  const [listing, setListing] = useState<DirListing | null>(null);
  const [error, setError] = useState<string | null>(null);

  function load(path?: string) {
    setError(null);
    void api
      .browse(path)
      .then(setListing)
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }

  useEffect(() => {
    load(); // arranca en el home del usuario
  }, []);

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Elegir carpeta">
        <div className="modal-head">
          <h2>Elegir carpeta</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Cerrar">×</button>
        </div>

        <div className="folder-current">
          <code>{listing?.path ?? "…"}</code>
        </div>

        <ul className="folder-list">
          {listing?.parent && (
            <li>
              <button type="button" onClick={() => load(listing.parent ?? undefined)}>⬆ ..</button>
            </li>
          )}
          {listing?.entries.map((entry) => (
            <li key={entry.path}>
              <button type="button" onClick={() => load(entry.path)}>📁 {entry.name}</button>
            </li>
          ))}
          {listing && listing.entries.length === 0 && <li className="empty">sin subcarpetas</li>}
        </ul>

        {error && <p className="error-text">{error}</p>}

        <div className="settings-actions">
          <button type="button" disabled={!listing} onClick={() => listing && onPick(listing.path)}>
            Usar esta carpeta
          </button>
        </div>
      </div>
    </div>
  );
}

// Panel de sesiones (RF-01): lista con estado + creación sobre un workspace.

import { useState } from "react";
import { api } from "../api/client";
import { useStore } from "../state/store";
import { FolderPicker } from "./FolderPicker";

export function SessionList({ onSelect }: { onSelect: (id: string) => void }) {
  const sessions = useStore((s) => s.sessions);
  const selected = useStore((s) => s.selected);
  const upsert = useStore((s) => s.upsertSession);
  const [workspace, setWorkspace] = useState("");
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setCreating(true);
    try {
      const session = await api.createSession({
        workspace_path: workspace,
        title: title || null,
      });
      upsert(session);
      setWorkspace("");
      setTitle("");
      onSelect(session.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="session-list">
      <h2>Sesiones</h2>
      <ul>
        {sessions.map((s) => (
          <li key={s.id}>
            <button
              type="button"
              className={`session-item ${s.id === selected ? "active" : ""}`}
              onClick={() => onSelect(s.id)}
            >
              <span className="session-title">{s.title || s.workspace_path}</span>
              <span className={`session-state state-${s.state}`}>{s.state}</span>
            </button>
          </li>
        ))}
        {sessions.length === 0 && <li className="empty">sin sesiones todavía</li>}
      </ul>

      <form className="new-session" onSubmit={create}>
        <h3>Nueva sesión</h3>
        <div className="workspace-field">
          <input
            value={workspace}
            onChange={(e) => setWorkspace(e.target.value)}
            placeholder="carpeta del proyecto"
            required
            aria-label="Carpeta del workspace"
          />
          <FolderPicker onPick={(path) => setWorkspace(path)} />
        </div>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="título (opcional)"
          maxLength={120}
          aria-label="Título de la sesión"
        />
        <button type="submit" disabled={creating || !workspace}>
          + Nueva sesión
        </button>
        {error && <p className="error-text">{error}</p>}
      </form>
    </div>
  );
}

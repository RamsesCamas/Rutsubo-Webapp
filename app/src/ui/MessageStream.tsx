// Conversación en streaming (RF-03): concatena message_delta por message_id
// (lo hace el reductor del store) y hace autoscroll, pausándolo si el usuario
// subió a leer historial.

import { useEffect, useRef } from "react";
import type { SessionView } from "../state/store";
import { ApprovalCard } from "./ApprovalCard";

export function MessageStream({ view, sessionId }: { view: SessionView; sessionId: string }) {
  const scroller = useRef<HTMLDivElement>(null);
  const pinnedToBottom = useRef(true);

  function onScroll() {
    const el = scroller.current;
    if (!el) return;
    pinnedToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
  }

  useEffect(() => {
    const el = scroller.current;
    if (el && pinnedToBottom.current) {
      el.scrollTop = el.scrollHeight;
    }
  });

  return (
    <div className="message-stream" ref={scroller} onScroll={onScroll}>
      {view.notices.map((notice, i) => (
        <p key={`n-${i}`} className="notice">
          {notice}
        </p>
      ))}
      {view.messages.map((m) => (
        <article key={m.id} className={`message message-${m.role}`}>
          <header>{m.role === "user" ? "tú" : "rutsubo"}</header>
          <p>
            {m.text}
            {!m.completed && m.role === "assistant" && <span className="cursor">▋</span>}
          </p>
        </article>
      ))}
      {view.tools.map((t) => (
        <p key={t.toolCallId} className={`tool-line ${t.rejected ? "rejected" : ""}`}>
          <code>{t.tool}</code>
          {t.ok === undefined ? " …" : t.ok ? " ✓" : t.rejected ? " ✗ rechazada" : " ✗"}
        </p>
      ))}
      {view.approvals.map((a) => (
        <ApprovalCard key={a.approvalId} approval={a} sessionId={sessionId} />
      ))}
      {view.gapFilling && <p className="notice">recuperando eventos…</p>}
    </div>
  );
}

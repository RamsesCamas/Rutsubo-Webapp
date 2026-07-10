import { useEffect, useRef, useState } from "react";
import { api } from "../api/client";

type Props = { disabled?: boolean; onText: (text: string) => void; onError: (message: string) => void };

export function MicButton({ disabled, onText, onError }: Props) {
  const [recorder, setRecorder] = useState<MediaRecorder | null>(null);
  const [seconds, setSeconds] = useState(0);
  const chunks = useRef<Blob[]>([]);
  const supported = typeof MediaRecorder !== "undefined";

  useEffect(() => {
    if (!recorder) return;
    const clock = window.setInterval(() => setSeconds((s) => s + 1), 1000);
    const limit = window.setTimeout(() => recorder.stop(), 60_000);
    return () => { window.clearInterval(clock); window.clearTimeout(limit); };
  }, [recorder]);
  if (!supported) return null;

  async function start() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const r = new MediaRecorder(stream, { mimeType: "audio/webm;codecs=opus" });
      chunks.current = [];
      r.ondataavailable = (e) => { if (e.data.size) chunks.current.push(e.data); };
      r.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop()); setRecorder(null);
        try { const out = await api.transcribe(new Blob(chunks.current, { type: "audio/webm;codecs=opus" })); onText(out.text); }
        catch (e) { onError(e instanceof Error ? e.message : "falló la transcripción"); }
      };
      setSeconds(0); setRecorder(r); r.start();
    } catch { onError("No se pudo acceder al micrófono. Revisa los permisos."); }
  }
  return <button type="button" disabled={disabled} onClick={() => recorder ? recorder.stop() : void start()} title="whisper-large-v3">
    {recorder ? `Detener (${seconds}s)` : "Dictar"}
  </button>;
}

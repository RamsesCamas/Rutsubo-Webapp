# @rutsubo/app — SPA autenticada

React 18 + Vite + TypeScript (CSR, ADR-002). Consume el daemon local
(`127.0.0.1:7431`) por REST (C-1) y WebSocket (C-3).

```bash
npm run dev        # http://localhost:5173 (requiere el daemon corriendo)
npm run test       # vitest: capa WS (orden, huecos, replay)
npm run typecheck  # tsc --noEmit
npm run build
```

Estructura:

- `src/api/client.ts` — fetch tipado con el sobre de error C-1; token en
  memoria + `sessionStorage` (trade-off comentado ahí).
- `src/ws/sequencer.ts` — semántica C-3 del cliente (testeada con servidor
  simulado); `src/ws/connection.ts` — reconexión con backoff + jitter.
- `src/state/store.ts` — Zustand; la UI se deriva reduciendo eventos.
- `src/ui/` — SessionList, MessageStream (autoscroll pausable), ApprovalCard
  (se retira con `approval_resolved`, RF-17), DiffViewer (solo lectura),
  AuditLog (paginado con filtros), DaemonStatus.

Los tipos del protocolo se importan de `@bindings/*` (vendorizados desde el
backend); no se declaran a mano.

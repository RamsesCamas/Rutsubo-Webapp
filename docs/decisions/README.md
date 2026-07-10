# Decisiones de implementación — interfaz web de Rutsubo

Documentos normativos: *Requerimientos y Diseño* (RF/RNF) y *ADRs y Contratos
de Servicio* (ADR-001…008, C-1…C-4). Jerarquía: **C-n > ADR-n > handoff**.

## ADRs aplicados a este repo

| ADR | Aplicación |
|---|---|
| ADR-002 (renderizado híbrido) | `public-site/` es SSG puro con Astro (la landing no carga JS de framework: es el sujeto Lighthouse de RNF-02); `app/` es CSR (React 18 + Vite), pensada para compartirse con la capa de presentación de Tauri en fase futura. |
| ADR-004 (contrato único + ts-rs) | `bindings/` es una copia vendorizada de `Rutsubo/crates/core/bindings`, sincronizada con `npm run sync:bindings` y verificada con `npm run check:bindings`. Prohibido redeclarar tipos del protocolo: si falta uno, se agrega en Rust y se regenera. |
| ADR-006 / C-3 | `app/src/ws/` implementa la semántica cliente completa: orden por `seq`, descarte de duplicados, hueco → pausa de render → replay REST → empalme; reconexión con backoff exponencial + jitter (base 1 s, tope 30 s). |

## Resoluciones tomadas durante la implementación

1. **Dos repositorios.** El monorepo del handoff se dividió por decisión del
   usuario (backend: [Rutsubo](https://github.com/RamsesCamas/Rutsubo)). La
   garantía RNF-17 entre repos la da el check de drift de bindings en CI.
2. **Token: memoria + `sessionStorage`.** Nunca `localStorage` (regla dura
   del handoff): `sessionStorage` muere con la pestaña, el alcance correcto
   para un token de daemon local. El trade-off está comentado en
   `app/src/api/client.ts`.
3. **Costura login → SPA por fragmento.** `public-site/login` entrega el
   token en `#token=…` (el fragmento nunca viaja a un servidor); la SPA lo
   consume y limpia la URL. El flujo de cuenta del relay (C-2) queda como
   punto de extensión comentado en `login.astro`.
4. **Mensajes del usuario, locales.** C-3 no emite evento por el comando
   `send_message`; la SPA añade el mensaje del usuario a la vista al enviarlo.
   Tras recargar, la conversación reconstruible desde eventos es la del
   asistente/herramientas (C-1 no expone GET de mensajes en esta fase).
5. **Estado derivado por reducción de eventos.** El store (Zustand) reduce
   `EventEnvelope` → vista; el replay tras reconexión reutiliza el mismo
   camino (sin sincronización ad hoc).

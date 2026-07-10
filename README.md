# Rutsubo — Aplicación Web

Interfaz web de [Rutsubo](https://github.com/RamsesCamas/Rutsubo), el agente de código
*local-first*. Dos superficies con arquitecturas de renderizado distintas (ADR-002):

| Paquete | Descripción |
|---|---|
| `public-site/` | Superficie pública estática (Astro, cero JavaScript de framework en la landing). Aquí se ejecutan las mediciones Lighthouse (RNF-02: FCP < 1500 ms, Performance ≥ 90). |
| `app/` | Aplicación autenticada CSR (React 18 + Vite + TypeScript). Consume la API REST y el WebSocket de eventos del daemon local (`127.0.0.1:7431`). |
| `bindings/` | Tipos TypeScript del protocolo, generados con `ts-rs` desde el crate `rutsubo-core` del backend y vendorizados aquí. **No se editan a mano.** |

## Requisitos

- Node.js 24+
- El daemon de Rutsubo corriendo localmente (ver el repo del backend)

## Uso rápido

```bash
npm install               # instala dependencias de ambos paquetes (workspaces)
npm run dev               # SPA en http://localhost:5173
npm run dev:site          # superficie pública en http://localhost:4321
npm run build             # build de producción de ambas superficies
npm run test              # vitest (capa WS: orden, huecos, replay)
npm run sync:bindings     # copia los bindings desde ../Rutsubo/crates/core/bindings
```

Los tipos del protocolo se importan exclusivamente desde `bindings/`; si falta un tipo,
se agrega en Rust (repo del backend) y se regenera — nunca se redeclara a mano.

Proyecto académico — Maestría en Ciencias e Innovación Tecnológica (UPCh),
materia *Tecnologías para el Desarrollo de Aplicaciones*.

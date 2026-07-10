# @rutsubo/public-site — superficie pública

Sitio 100 % estático (Astro, ADR-002): landing y login. La landing no carga
JavaScript de framework — es el sujeto de las mediciones Lighthouse (RNF-02:
FCP < 1500 ms, Performance ≥ 90, Accessibility ≥ 95).

```bash
npm run dev       # http://localhost:4321
npm run build     # dist/ estático
npm run preview   # sirve dist/ (para auditar con Lighthouse)
```

Evidencia del corte 1: `../docs/audits/lighthouse-corte1.json`
(Performance 100 · Accessibility 100 · FCP 0.6 s).

`login.astro` entrega el token del daemon a la SPA vía fragmento de URL y
contiene el punto de extensión (comentado) para el flujo de cuenta del relay
(contrato C-2, fase futura).

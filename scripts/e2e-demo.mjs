// Demo E2E de aceptación (Fase E): contra el daemon vivo con MockProvider,
// desde la UI real — crear sesión → pedir tarea → ver streaming → aprobar el
// write_file desde la tarjeta → ver el diff en el visor.
//
// Uso: node scripts/e2e-demo.mjs <chrome-path> <token> <workspace-dir>
// Requiere: daemon en 127.0.0.1:7431 y la SPA (vite dev) en localhost:5173.

import puppeteer from "puppeteer-core";

const [chromePath, token, workspace] = process.argv.slice(2);
if (!chromePath || !token || !workspace) {
  console.error("uso: node scripts/e2e-demo.mjs <chrome-path> <token> <workspace-dir>");
  process.exit(2);
}

const browser = await puppeteer.launch({
  executablePath: chromePath,
  headless: "shell",
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});

async function fail(page, message) {
  console.error(`E2E FALLÓ: ${message}`);
  try {
    console.error(await page.content());
  } catch {}
  await browser.close();
  process.exit(1);
}

const page = await browser.newPage();
page.setDefaultTimeout(20_000);

try {
  // Login por fragmento (misma costura que public-site/login).
  await page.goto(`http://localhost:5173/#token=${encodeURIComponent(token)}`, {
    waitUntil: "networkidle0",
  });

  // Estado de conexión visible: daemon ● conectado.
  await page.waitForFunction(
    () => document.querySelector(".daemon-status")?.textContent?.includes("conectado"),
  );

  // Crear sesión sobre el workspace del demo.
  await page.type('input[aria-label="Ruta del workspace"]', workspace);
  await page.type('input[aria-label="Título de la sesión"]', "Demo E2E");
  await page.click(".new-session button[type=submit]");
  await page.waitForSelector(".session-item.active");

  // Pedir la tarea.
  await page.type(
    'textarea[aria-label="Instrucción para el agente"]',
    "Revisa main.rs y deja tus notas",
  );
  await page.click(".composer button[type=submit]");

  // Streaming visible (message_delta concatenados).
  await page.waitForFunction(
    () =>
      document.querySelector(".message-assistant")?.textContent?.includes("Voy a leer"),
  );
  console.log("✓ streaming del asistente visible");

  // Tarjeta de aprobación (write_file) → Aprobar.
  await page.waitForSelector(".approval-card");
  const summary = await page.$eval(".approval-card p", (el) => el.textContent);
  if (!summary?.includes("write_file")) await fail(page, `aprobación inesperada: ${summary}`);
  console.log(`✓ tarjeta de aprobación: ${summary?.trim()}`);
  await page.click(".approval-card .approve");

  // La tarjeta se retira con approval_resolved.
  await page.waitForFunction(() => !document.querySelector(".approval-card"));
  console.log("✓ tarjeta retirada tras approval_resolved");

  // El diff aparece en el visor con su contador.
  await page.waitForSelector(".diff-file-block");
  const counter = await page.$eval(".diff-counter", (el) => el.textContent);
  const path = await page.$eval(".diff-header code", (el) => el.textContent);
  console.log(`✓ diff visible: ${path} ${counter?.trim()}`);

  // Cierre del turno: la sesión vuelve a idle.
  await page.waitForFunction(
    () => document.querySelector(".session-item.active .session-state")?.textContent === "idle",
  );
  console.log("✓ turno completado: sesión idle");

  console.log("DEMO E2E OK");
} catch (err) {
  await fail(page, err.message);
}

await browser.close();

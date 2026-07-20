import { cookie, cookies, signSession } from "../_auth";

// Perfil demo (respaldo de evaluación): mienta una sesión sin Google si el
// visitante presenta el código compartido `DEMO_ACCESS_CODE`. La cuenta demo
// (`demo@rutsubo.app`) debe estar en RUTSUBO_ALLOWED_EMAILS (Vercel + Railway).
// El código evita que cualquiera con la URL gaste la API key de Groq.
const DEMO_EMAIL = "demo@rutsubo.app";

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") return res.status(405).json({ error: "método no permitido" });
  const expected = process.env.DEMO_ACCESS_CODE;
  if (!expected) return res.status(503).json({ error: "modo demo no configurado" });

  let code = "";
  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    code = typeof body?.code === "string" ? body.code : "";
  } catch {
    code = "";
  }
  if (code !== expected) return res.status(403).json({ error: "código demo inválido" });

  res.setHeader("Set-Cookie", cookie(cookies.sessionCookie, await signSession(DEMO_EMAIL), 28_800));
  res.status(200).json({ authenticated: true, email: DEMO_EMAIL });
}

import { clearCookie, cookie, cookies, readCookie, signSession, verifyGoogleIdToken, verifyOauthState } from "../../_auth";

export default async function handler(req: any, res: any) {
  try {
    const code = typeof req.query.code === "string" ? req.query.code : "";
    const state = typeof req.query.state === "string" ? req.query.state : "";
    const rawState = readCookie(req.headers.cookie, cookies.oauthCookie);
    if (!code || !rawState) throw new Error("respuesta OAuth inválida");
    const saved = await verifyOauthState(decodeURIComponent(rawState));
    if (saved.state !== state) throw new Error("estado OAuth no coincide");
    const redirectUri = "https://rutsubo-webapp.vercel.app/api/auth/google/callback";
    const body = new URLSearchParams({ code, client_id: process.env.GOOGLE_CLIENT_ID ?? "", client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "", redirect_uri: redirectUri, grant_type: "authorization_code", code_verifier: saved.verifier });
    const response = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body });
    if (!response.ok) throw new Error("Google rechazó el código de autorización");
    const payload = await response.json() as { id_token?: string };
    if (!payload.id_token) throw new Error("Google no devolvió identidad");
    const email = await verifyGoogleIdToken(payload.id_token);
    const allowed = (process.env.RUTSUBO_ALLOWED_EMAILS ?? "ramsescamas@gmail.com").split(",").map((value) => value.trim().toLowerCase());
    if (!allowed.includes(email)) return res.status(403).send("Esta cuenta no tiene acceso a Rutsubo.");
    res.setHeader("Set-Cookie", [clearCookie(cookies.oauthCookie), cookie(cookies.sessionCookie, await signSession(email), 28_800)]);
    res.redirect("/");
  } catch (error) {
    res.status(401).send(error instanceof Error ? error.message : "No se pudo iniciar sesión");
  }
}

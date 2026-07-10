import { verifySession } from "../_auth";

export const config = { api: { bodyParser: false } };
// BodyInit exige Uint8Array respaldado por ArrayBuffer (no el Buffer de Node,
// que TS 5.9 tipa sobre ArrayBufferLike): se copia a un buffer propio.
async function body(req: any) {
  if (["GET", "HEAD"].includes(req.method ?? "GET")) return undefined;
  const parts: Buffer[] = [];
  for await (const chunk of req) parts.push(Buffer.from(chunk));
  const merged = Buffer.concat(parts);
  const out = new Uint8Array(merged.byteLength);
  out.set(merged);
  return out;
}
export default async function handler(req: any, res: any) {
  const email = await verifySession(req.headers.cookie);
  if (!email) return res.status(401).json({ error: { code: "unauthorized", message: "inicia sesión con Google" } });
  const api = process.env.RUTSUBO_API_URL;
  const secret = process.env.RUTSUBO_PROXY_SECRET;
  if (!api || !secret) return res.status(500).json({ error: "BFF no configurado" });
  const path = Array.isArray(req.query.path) ? req.query.path.join("/") : req.query.path ?? "";
  const url = new URL(`/${path}`, api);
  // Vercel mezcla en req.query el segmento catch-all (`path`) con los query
  // params originales: hay que reenviarlos todos al daemon — sin esto se
  // pierden ?after_seq=/limit= del replay y los filtros de audit/sessions.
  for (const [key, value] of Object.entries(req.query)) {
    if (key === "path") continue;
    for (const item of Array.isArray(value) ? value : [value]) {
      if (typeof item === "string") url.searchParams.append(key, item);
    }
  }
  const requestBody = await body(req);
  const upstream = await fetch(url, { method: req.method, headers: { authorization: `Bearer ${secret}`, "x-rutsubo-user": email, "content-type": req.headers["content-type"] ?? "application/json" }, body: requestBody });
  res.status(upstream.status);
  const type = upstream.headers.get("content-type");
  if (type) res.setHeader("content-type", type);
  res.send(Buffer.from(await upstream.arrayBuffer()));
}

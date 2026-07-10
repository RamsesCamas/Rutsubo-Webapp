import { verifySession } from "../_auth";

export const config = { api: { bodyParser: false } };
async function body(req: any): Promise<Buffer | undefined> {
  if (["GET", "HEAD"].includes(req.method ?? "GET")) return undefined;
  const parts: Buffer[] = [];
  for await (const chunk of req) parts.push(Buffer.from(chunk));
  return Buffer.concat(parts);
}
export default async function handler(req: any, res: any) {
  const email = await verifySession(req.headers.cookie);
  if (!email) return res.status(401).json({ error: { code: "unauthorized", message: "inicia sesión con Google" } });
  const api = process.env.RUTSUBO_API_URL;
  const secret = process.env.RUTSUBO_PROXY_SECRET;
  if (!api || !secret) return res.status(500).json({ error: "BFF no configurado" });
  const path = Array.isArray(req.query.path) ? req.query.path.join("/") : req.query.path ?? "";
  const url = new URL(`/${path}`, api);
  const requestBody = await body(req);
  const upstream = await fetch(url, { method: req.method, headers: { authorization: `Bearer ${secret}`, "x-rutsubo-user": email, "content-type": req.headers["content-type"] ?? "application/json" }, body: requestBody });
  res.status(upstream.status);
  const type = upstream.headers.get("content-type");
  if (type) res.setHeader("content-type", type);
  res.send(Buffer.from(await upstream.arrayBuffer()));
}

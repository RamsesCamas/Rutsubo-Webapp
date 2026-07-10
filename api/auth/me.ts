import { verifySession } from "../_auth";
export default async function handler(req: any, res: any) {
  const email = await verifySession(req.headers.cookie);
  if (!email) return res.status(401).json({ authenticated: false });
  res.status(200).json({ authenticated: true, email });
}

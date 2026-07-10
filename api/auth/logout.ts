import { clearCookie, cookies } from "../_auth";
export default function handler(_req: any, res: any) { res.setHeader("Set-Cookie", clearCookie(cookies.sessionCookie)); res.status(204).end(); }

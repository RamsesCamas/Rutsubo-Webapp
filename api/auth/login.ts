import { cookie, cookies, oauthState, signOauthState } from "../_auth";

export default async function handler(_req: any, res: any) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) return res.status(500).json({ error: "Google login no configurado" });
  const redirectUri = "https://rutsubo-webapp.vercel.app/api/auth/google/callback";
  const { state, verifier, challenge } = oauthState();
  const stateToken = await signOauthState(state, verifier);
  const params = new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri, response_type: "code", scope: "openid email", state, code_challenge: challenge, code_challenge_method: "S256", prompt: "select_account" });
  res.setHeader("Set-Cookie", cookie(cookies.oauthCookie, stateToken, 600));
  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
}

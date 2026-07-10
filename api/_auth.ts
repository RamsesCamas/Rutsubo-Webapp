import { SignJWT, jwtVerify, createRemoteJWKSet } from "jose";
import { createHash, randomBytes } from "node:crypto";

const encoder = new TextEncoder();
const sessionCookie = "rutsubo_session";
const oauthCookie = "rutsubo_oauth";

function secret() {
  const value = process.env.BFF_SESSION_SECRET;
  if (!value) throw new Error("BFF_SESSION_SECRET no configurado");
  return encoder.encode(value);
}

export function cookie(name: string, value: string, maxAge?: number) {
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Lax${maxAge ? `; Max-Age=${maxAge}` : ""}`;
}

export function clearCookie(name: string) { return `${name}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`; }

export function readCookie(header: string | undefined, name: string) {
  return header?.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1);
}

export function oauthState() {
  const state = randomBytes(32).toString("base64url");
  const verifier = randomBytes(48).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { state, verifier, challenge };
}

export async function signOauthState(state: string, verifier: string) {
  return new SignJWT({ state, verifier }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("10m").sign(secret());
}

export async function verifyOauthState(token: string) {
  const { payload } = await jwtVerify(token, secret());
  if (typeof payload.state !== "string" || typeof payload.verifier !== "string") throw new Error("estado OAuth inválido");
  return { state: payload.state, verifier: payload.verifier };
}

export async function signSession(email: string) {
  return new SignJWT({ email }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("8h").sign(secret());
}

export async function verifySession(header: string | undefined) {
  const raw = readCookie(header, sessionCookie);
  if (!raw) return null;
  try {
    const { payload } = await jwtVerify(decodeURIComponent(raw), secret());
    return typeof payload.email === "string" ? payload.email : null;
  } catch { return null; }
}

export async function verifyGoogleIdToken(idToken: string) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) throw new Error("GOOGLE_CLIENT_ID no configurado");
  const jwks = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));
  const { payload } = await jwtVerify(idToken, jwks, { audience: clientId, issuer: ["https://accounts.google.com", "accounts.google.com"] });
  if (payload.email_verified !== true || typeof payload.email !== "string") throw new Error("Google no confirmó el correo");
  return payload.email.toLowerCase();
}

export const cookies = { sessionCookie, oauthCookie };

export const ADMIN_COOKIE_NAME = "dance_rank_admin";
export const JUDGE_COOKIE_NAME = "dance_rank_judge";

export type AdminSession = {
  role: "admin";
  exp: number;
};

export type JudgeSession = {
  judgeId: string;
  competitionId?: string;
  code: string;
  exp: number;
};

const encoder = new TextEncoder();

function base64UrlEncode(bytes: Uint8Array) {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlDecode(value: string) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function encodeJson(value: unknown) {
  return base64UrlEncode(encoder.encode(JSON.stringify(value)));
}

function decodeJson<T>(value: string): T | null {
  try {
    const json = new TextDecoder().decode(base64UrlDecode(value));
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}

async function getHmacKey(secret: string) {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

async function signValue(value: string, secret: string) {
  const key = await getHmacKey(secret);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(value));
  return base64UrlEncode(new Uint8Array(signature));
}

export async function hashJudgePin(pin: string, secret = getSessionSecret()) {
  return signValue(`judge-pin:${pin}`, secret);
}

export async function verifyJudgePin(
  pin: string,
  expectedHash: string | null | undefined,
  secret = getSessionSecret(),
) {
  if (!expectedHash) return false;
  const actualHash = await hashJudgePin(pin, secret);
  return actualHash === expectedHash;
}

export function getSessionSecret() {
  return (
    process.env.ADMIN_SESSION_SECRET ??
    process.env.AUTH_SECRET ??
    "development-session-secret-change-me"
  );
}

export function getAdminPassword() {
  if (process.env.ADMIN_PASSWORD) return process.env.ADMIN_PASSWORD;
  if (process.env.NODE_ENV !== "production") return "admin";
  return "";
}

export function createExpiry(seconds: number) {
  return Math.floor(Date.now() / 1000) + seconds;
}

export async function signSession(payload: object, secret = getSessionSecret()) {
  const encodedPayload = encodeJson(payload);
  const signature = await signValue(encodedPayload, secret);
  return `${encodedPayload}.${signature}`;
}

export async function verifySession<T extends { exp?: number }>(
  token: string | undefined,
  secret = getSessionSecret(),
) {
  if (!token) return null;
  const [encodedPayload, signature] = token.split(".");
  if (!encodedPayload || !signature) return null;

  const expectedSignature = await signValue(encodedPayload, secret);
  if (signature !== expectedSignature) return null;

  const payload = decodeJson<T>(encodedPayload);
  if (!payload) return null;
  if (typeof payload.exp === "number" && payload.exp < Math.floor(Date.now() / 1000)) {
    return null;
  }

  return payload;
}

export function authCookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  };
}

import { NODE_STATUSES, type NodeStatus, type StoryNode } from "./types";

const NODE_ID_PATTERN = /^[A-Z0-9_-]{1,32}$/;
const RECENT_KEY = "meta:recent";

export const jsonHeaders = {
  "Content-Type": "application/json; charset=utf-8",
};

export function normalizeNodeId(value: string): string {
  return value.trim().toUpperCase();
}

export function validateNodeId(value: string): string {
  const normalized = normalizeNodeId(value);
  if (!NODE_ID_PATTERN.test(normalized)) {
    throw new HttpError(400, "Invalid node ID. Use letters, numbers, dashes, or underscores.");
  }
  return normalized;
}

export function normalizeStatus(value: unknown): NodeStatus {
  if (typeof value !== "string" || !NODE_STATUSES.includes(value as NodeStatus)) {
    throw new HttpError(400, "Invalid status value.");
  }
  return value as NodeStatus;
}

export function nodeKey(id: string) {
  return `node:${validateNodeId(id)}`;
}

export function getRecentKey() {
  return RECENT_KEY;
}

export async function readJson<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    throw new HttpError(400, "Invalid JSON body.");
  }
}

export function json(data: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      ...jsonHeaders,
      ...(init.headers || {}),
    },
  });
}

export function empty(init: ResponseInit = {}) {
  return new Response(null, init);
}

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export function parseBearerToken(request: Request): string | null {
  const header = request.headers.get("Authorization");
  if (!header) return null;
  const [scheme, token] = header.split(" ");
  return scheme === "Bearer" && token ? token : null;
}

export function createCorsHeaders(request: Request, allowedOrigins: string) {
  const requestOrigin = request.headers.get("Origin");
  const allowList = allowedOrigins
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  const origin = requestOrigin && allowList.includes(requestOrigin) ? requestOrigin : allowList[0] || "*";

  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET,POST,PUT,OPTIONS",
    "Access-Control-Allow-Headers": "Authorization,Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

export async function sha256Base64Url(input: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(input));
  return arrayBufferToBase64Url(signature);
}

export async function createSessionToken(secret: string, ttlSeconds: number) {
  const payload = {
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
    nonce: crypto.randomUUID(),
  };
  const encodedPayload = toBase64Url(JSON.stringify(payload));
  const signature = await sha256Base64Url(encodedPayload, secret);
  return `${encodedPayload}.${signature}`;
}

export async function verifySessionToken(token: string, secret: string) {
  const [payloadSegment, signatureSegment] = token.split(".");
  if (!payloadSegment || !signatureSegment) {
    return false;
  }

  const expected = await sha256Base64Url(payloadSegment, secret);
  if (expected !== signatureSegment) {
    return false;
  }

  try {
    const payload = JSON.parse(fromBase64Url(payloadSegment)) as { exp: number };
    return typeof payload.exp === "number" && payload.exp > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

export function getExpiryIso(token: string) {
  const [payloadSegment] = token.split(".");
  const payload = JSON.parse(fromBase64Url(payloadSegment)) as { exp: number };
  return new Date(payload.exp * 1000).toISOString();
}

export function sanitizeNode(input: { id: string; title?: unknown; status: unknown; content?: unknown }): StoryNode {
  const id = validateNodeId(input.id);
  const title = typeof input.title === "string" ? input.title.trim() : "";
  const content = typeof input.content === "string" ? input.content : "";
  const status = normalizeStatus(input.status);

  return {
    id,
    title,
    status,
    content,
    updatedAt: new Date().toISOString(),
  };
}

function toBase64Url(input: string) {
  const bytes = new TextEncoder().encode(input);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(input: string) {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function arrayBufferToBase64Url(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

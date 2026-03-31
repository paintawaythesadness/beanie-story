import type { StoryNode } from "./types";

const RECENT_KEY = "meta:recent";

export const jsonHeaders = {
  "Content-Type": "application/json; charset=utf-8",
};

export function normalizeNodeId(value: string): string {
  return value.trim();
}

export function validateNodeId(value: string): string {
  const normalized = normalizeNodeId(value);
  if (!normalized) {
    throw new HttpError(400, "Invalid node ID. It cannot be empty.");
  }
  return normalized;
}

export function nodeKey(id: string) {
  return `node:${encodeURIComponent(validateNodeId(id))}`;
}

export function legacyNodeKey(id: string) {
  return `node:${normalizeLegacyId(id)}`;
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

  const origin = requestOrigin && allowList.includes(requestOrigin) ? requestOrigin : null;
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };

  if (origin) {
    headers["Access-Control-Allow-Origin"] = origin;
  }

  return headers;
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

export function sanitizeNode(input: {
  id: string;
  name?: unknown;
  displayTitle?: unknown;
  content?: unknown;
  meta?: unknown;
  modifiedAt?: unknown;
}): StoryNode {
  const id = validateNodeId(input.id);
  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (!name) {
    throw new HttpError(400, "Missing required field: name.");
  }

  if (input.displayTitle !== undefined && typeof input.displayTitle !== "string") {
    throw new HttpError(400, "displayTitle must be a string when provided.");
  }

  const content = typeof input.content === "string" ? input.content : "";
  const meta = input.meta === undefined ? {} : sanitizeMeta(input.meta);
  const modifiedAt =
    input.modifiedAt === undefined
      ? new Date().toISOString()
      : sanitizeModifiedAt(input.modifiedAt);

  return {
    id,
    name,
    displayTitle: input.displayTitle,
    content,
    meta,
    modifiedAt,
  };
}

export function normalizeStoredNode(node: unknown, requestedId?: string): StoryNode | null {
  if (!isPlainObject(node)) {
    return null;
  }

  if (typeof node.id === "string" && typeof node.name === "string" && typeof node.content === "string") {
    return {
      id: validateNodeId(node.id),
      name: node.name,
      displayTitle: typeof node.displayTitle === "string" ? node.displayTitle : undefined,
      content: node.content,
      meta: sanitizeMeta(node.meta),
      modifiedAt: typeof node.modifiedAt === "string" ? node.modifiedAt : undefined,
    };
  }

  if (
    typeof node.id === "string" &&
    typeof node.title === "string" &&
    typeof node.content === "string"
  ) {
    const id = requestedId ? validateNodeId(requestedId) : validateNodeId(node.id);
    return {
      id,
      name: node.title || id,
      content: node.content,
      meta: typeof node.status === "string" ? { editStatus: node.status } : {},
      modifiedAt: typeof node.updatedAt === "string" ? node.updatedAt : undefined,
    };
  }

  return null;
}

function sanitizeMeta(value: unknown): Record<string, unknown> {
  if (!isPlainObject(value)) {
    throw new HttpError(400, "meta must be an object.");
  }

  return value;
}

function sanitizeModifiedAt(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new HttpError(400, "modifiedAt must be a non-empty string when provided.");
  }

  return value;
}

function normalizeLegacyId(value: string): string {
  return value.trim().toUpperCase();
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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

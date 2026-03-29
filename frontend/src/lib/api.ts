import type { SessionResponse, StoryNode } from "../types";

const DEFAULT_API_BASE = "http://127.0.0.1:8787";
const API_BASE = (import.meta.env.VITE_API_BASE_URL || DEFAULT_API_BASE).replace(/\/$/, "");

function buildHeaders(token?: string): HeadersInit {
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, init);
  const data = (await response.json().catch(() => ({ error: "Invalid server response" }))) as
    | T
    | { error?: string };

  if (!response.ok) {
    const message =
      typeof data === "object" && data && "error" in data && typeof data.error === "string"
        ? data.error
        : "Request failed";
    throw new Error(message);
  }

  return data as T;
}

export async function login(password: string): Promise<SessionResponse> {
  return request<SessionResponse>("/api/login", {
    method: "POST",
    headers: buildHeaders(),
    body: JSON.stringify({ password }),
  });
}

export async function logout(token: string): Promise<void> {
  await request<{ ok: true }>("/api/logout", {
    method: "POST",
    headers: buildHeaders(token),
  });
}

export async function getRecent(token: string): Promise<{ nodes: StoryNode[] }> {
  return request<{ nodes: StoryNode[] }>("/api/recent", {
    headers: buildHeaders(token),
  });
}

export async function getNode(token: string, id: string): Promise<StoryNode> {
  return request<StoryNode>(`/api/node/${encodeURIComponent(id)}`, {
    headers: buildHeaders(token),
  });
}

export async function saveNode(token: string, node: Pick<StoryNode, "id" | "title" | "status" | "content">) {
  return request<StoryNode>(`/api/node/${encodeURIComponent(node.id)}`, {
    method: "PUT",
    headers: buildHeaders(token),
    body: JSON.stringify(node),
  });
}

export { API_BASE };


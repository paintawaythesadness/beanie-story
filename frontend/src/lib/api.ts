import type { SessionResponse, StoryNode } from "../types";

const DEFAULT_API_BASE = "https://beanie-editor-api.paintawaythesadness.workers.dev";

function safeString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

const rawApiBase = import.meta.env.VITE_API_BASE_URL ?? DEFAULT_API_BASE;

if (!import.meta.env.VITE_API_BASE_URL) {
  console.warn("VITE_API_BASE_URL is not set, using default API base");
}

const API_BASE = safeString(rawApiBase).replace(/\/$/, "");

type RawStoryNode = Partial<
  StoryNode & {
    title?: string;
    status?: string;
    updatedAt?: string;
  }
>;

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

function normalizeStoryNode(raw: RawStoryNode, fallbackId = ""): StoryNode {
  const id = typeof raw.id === "string" && raw.id.trim() ? raw.id.trim() : fallbackId.trim();
  const legacyTitle = typeof raw.title === "string" ? raw.title.trim() : "";
  const name = typeof raw.name === "string" && raw.name.trim() ? raw.name.trim() : legacyTitle || id;
  const displayTitle =
    typeof raw.displayTitle === "string" && raw.displayTitle.trim() ? raw.displayTitle.trim() : undefined;
  const content = typeof raw.content === "string" ? raw.content : "";
  const meta =
    raw.meta && typeof raw.meta === "object" && !Array.isArray(raw.meta)
      ? (raw.meta as Record<string, unknown>)
      : typeof raw.status === "string" && raw.status
        ? { editStatus: raw.status }
        : {};
  const modifiedAt =
    typeof raw.modifiedAt === "string" && raw.modifiedAt.trim()
      ? raw.modifiedAt
      : typeof raw.updatedAt === "string" && raw.updatedAt.trim()
        ? raw.updatedAt
        : undefined;

  return {
    id,
    name,
    displayTitle,
    content,
    meta,
    modifiedAt,
  };
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
  const response = await request<{ nodes?: RawStoryNode[] }>("/api/recent", {
    headers: buildHeaders(token),
  });

  return {
    nodes: Array.isArray(response.nodes)
      ? response.nodes
          .map((node) => normalizeStoryNode(node))
          .filter((node) => Boolean(node.id))
      : [],
  };
}

export async function getAllNodes(token: string, limit = 100): Promise<StoryNode[]> {
  const nodes: StoryNode[] = [];
  let cursor: string | undefined;

  do {
    const params = new URLSearchParams({ limit: String(limit) });
    if (cursor) {
      params.set("cursor", cursor);
    }

    const page = await request<{ nodes?: RawStoryNode[]; cursor?: string; listComplete: boolean }>(
      `/api/nodes?${params.toString()}`,
      {
        headers: buildHeaders(token),
      },
    );

    if (Array.isArray(page.nodes)) {
      nodes.push(
        ...page.nodes
          .map((node) => normalizeStoryNode(node))
          .filter((node) => Boolean(node.id)),
      );
    }
    cursor = page.cursor;
  } while (cursor);

  return nodes;
}

export async function getNode(token: string, id: string): Promise<StoryNode> {
  const node = await request<RawStoryNode>(`/api/node/${encodeURIComponent(id)}`, {
    headers: buildHeaders(token),
  });

  return normalizeStoryNode(node, id);
}

export async function saveNode(
  token: string,
  node: Pick<StoryNode, "id" | "name" | "displayTitle" | "content" | "meta" | "modifiedAt">,
) {
  const saved = await request<RawStoryNode>(`/api/node/${encodeURIComponent(node.id)}`, {
    method: "PUT",
    headers: buildHeaders(token),
    body: JSON.stringify(node),
  });

  return normalizeStoryNode(saved, node.id);
}

export { API_BASE };

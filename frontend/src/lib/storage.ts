import type { StoryNode } from "../types";

const SESSION_KEY = "beanie-editor-session";

function draftKey(nodeId: string) {
  return `beanie-editor-draft:${nodeId.toUpperCase()}`;
}

export function saveSession(token: string, expiresAt: string) {
  localStorage.setItem(SESSION_KEY, JSON.stringify({ token, expiresAt }));
}

export function loadSession(): { token: string; expiresAt: string } | null {
  const raw = localStorage.getItem(SESSION_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as { token: string; expiresAt: string };
    if (!parsed.token || !parsed.expiresAt) {
      return null;
    }

    if (Date.parse(parsed.expiresAt) <= Date.now()) {
      localStorage.removeItem(SESSION_KEY);
      return null;
    }

    return parsed;
  } catch {
    localStorage.removeItem(SESSION_KEY);
    return null;
  }
}

export function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

export function saveDraft(node: Pick<StoryNode, "id" | "name" | "displayTitle" | "content" | "meta" | "modifiedAt">) {
  localStorage.setItem(draftKey(node.id), JSON.stringify(node));
}

export function loadDraft(
  id: string,
): Pick<StoryNode, "id" | "name" | "displayTitle" | "content" | "meta" | "modifiedAt"> | null {
  const raw = localStorage.getItem(draftKey(id));
  if (!raw) return null;

  try {
    return JSON.parse(raw) as Pick<StoryNode, "id" | "name" | "displayTitle" | "content" | "meta" | "modifiedAt">;
  } catch {
    return null;
  }
}

export function clearDraft(id: string) {
  localStorage.removeItem(draftKey(id));
}

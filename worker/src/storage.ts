import type { Env, StoryNode } from "./types";
import { getRecentKey, legacyNodeKey, nodeKey, normalizeStoredNode } from "./utils";

export async function getNode(env: Env, id: string): Promise<StoryNode | null> {
  const primary = await env.EDITOR_KV.get(nodeKey(id), "json");
  const normalizedPrimary = normalizeStoredNode(primary, id);
  if (normalizedPrimary) {
    return normalizedPrimary;
  }

  const legacy = await env.EDITOR_KV.get(legacyNodeKey(id), "json");
  return normalizeStoredNode(legacy, id);
}

export async function saveNode(env: Env, node: StoryNode): Promise<void> {
  await env.EDITOR_KV.put(nodeKey(node.id), JSON.stringify(node));
}

export async function deleteNode(env: Env, id: string): Promise<boolean> {
  const key = nodeKey(id);
  const existing = await env.EDITOR_KV.get(key, "json");
  if (existing === null) {
    return false;
  }

  await env.EDITOR_KV.delete(key);
  return true;
}

export async function listNodes(
  env: Env,
  options: { cursor?: string; limit?: number } = {},
): Promise<{ nodes: StoryNode[]; cursor?: string; listComplete: boolean }> {
  const limit = Math.min(Math.max(options.limit ?? 100, 1), 100);
  const page = await env.EDITOR_KV.list({ prefix: "node:", cursor: options.cursor, limit });
  const nodes = await Promise.all(
    page.keys.map(async (key) => {
      const value = await env.EDITOR_KV.get(key.name, "json");
      return normalizeStoredNode(value);
    }),
  );

  return {
    nodes: nodes.filter((node): node is StoryNode => Boolean(node)),
    cursor: page.list_complete ? undefined : page.cursor,
    listComplete: page.list_complete,
  };
}

export async function listRecentIds(env: Env): Promise<string[]> {
  return (await env.EDITOR_KV.get<string[]>(getRecentKey(), "json")) || [];
}

export async function writeRecentIds(env: Env, ids: string[]): Promise<void> {
  await env.EDITOR_KV.put(getRecentKey(), JSON.stringify(ids));
}

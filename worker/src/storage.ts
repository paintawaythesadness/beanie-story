import type { Env, StoryNode } from "./types";
import { getRecentKey, nodeKey } from "./utils";

export async function getNode(env: Env, id: string): Promise<StoryNode | null> {
  return env.EDITOR_KV.get<StoryNode>(nodeKey(id), "json");
}

export async function saveNode(env: Env, node: StoryNode): Promise<void> {
  await env.EDITOR_KV.put(nodeKey(node.id), JSON.stringify(node));
}

export async function listRecentIds(env: Env): Promise<string[]> {
  return (await env.EDITOR_KV.get<string[]>(getRecentKey(), "json")) || [];
}

export async function writeRecentIds(env: Env, ids: string[]): Promise<void> {
  await env.EDITOR_KV.put(getRecentKey(), JSON.stringify(ids));
}


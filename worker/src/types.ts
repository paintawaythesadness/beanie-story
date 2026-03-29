export const NODE_STATUSES = [
  "default",
  "needs_edit",
  "ai_drafted",
  "final",
] as const;

export type NodeStatus = (typeof NODE_STATUSES)[number];

export interface StoryNode {
  id: string;
  title: string;
  status: NodeStatus;
  content: string;
  updatedAt: string;
}

export interface Env {
  EDITOR_KV: KVNamespace;
  EDITOR_PASSWORD: string;
  AUTH_SECRET: string;
  SESSION_TTL_SECONDS?: string;
  RECENT_NODE_LIMIT?: string;
  ALLOWED_ORIGINS?: string;
}

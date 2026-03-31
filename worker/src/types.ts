export interface StoryNode {
  id: string;
  name: string;
  displayTitle?: string;
  content: string;
  meta: Record<string, unknown>;
  modifiedAt?: string;
}

export interface Env {
  EDITOR_KV: KVNamespace;
  EDITOR_PASSWORD: string;
  AUTH_SECRET: string;
  SESSION_TTL_SECONDS?: string;
  RECENT_NODE_LIMIT?: string;
  ALLOWED_ORIGINS?: string;
}

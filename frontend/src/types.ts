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

export interface SessionResponse {
  token: string;
  expiresAt: string;
}


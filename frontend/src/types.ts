export interface StoryNode {
  id: string;
  name: string;
  displayTitle?: string;
  content: string;
  meta: Record<string, unknown>;
  modifiedAt?: string;
}

export interface SessionResponse {
  token: string;
  expiresAt: string;
}

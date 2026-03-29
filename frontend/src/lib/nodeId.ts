const NODE_ID_PATTERN = /^[A-Z0-9_-]{1,32}$/;

export function normalizeNodeId(value: string): string {
  return value.trim().toUpperCase();
}

export function isValidNodeId(value: string): boolean {
  return NODE_ID_PATTERN.test(normalizeNodeId(value));
}

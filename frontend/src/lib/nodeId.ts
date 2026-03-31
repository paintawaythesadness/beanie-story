export function normalizeNodeId(value: string): string {
  return value.trim();
}

export function isValidNodeId(value: string): boolean {
  return normalizeNodeId(value).length > 0;
}

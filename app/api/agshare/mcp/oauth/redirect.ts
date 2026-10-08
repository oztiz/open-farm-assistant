// Strict OAuth redirect URI matching. Reject fragments, credentials and wildcards.
export function normalizeRedirectUri(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 2048 || /[\\\x00-\x20]/.test(value)) return null;
  let url: URL;
  try { url = new URL(value); } catch { return null; }
  if (url.hash || url.username || url.password) return null;
  if (url.protocol !== "https:" && !(url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1"))) return null;
  if (url.hostname.includes("*")) return null;
  return url.href;
}
export function redirectAllowed(requested: unknown, registered: readonly string[]): boolean {
  const normalized = normalizeRedirectUri(requested);
  return normalized !== null && registered.some(uri => normalizeRedirectUri(uri) === normalized);
}

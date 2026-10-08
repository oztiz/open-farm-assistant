import { timingSafeEqual } from "node:crypto";

export type BridgeScope = "read" | "write";

/**
 * Transitional machine-to-machine authentication.
 * OAuth owner-bound access tokens must be validated separately before rollout.
 * Never return or log configured tokens.
 */
export function authorizeBridgeToken(
  authorization: string | null,
  env: {
    AGSHARE_BRIDGE_TOKEN?: string;
    AGSHARE_BRIDGE_READ_TOKEN?: string;
  } = process.env,
): BridgeScope | null {
  const presented = Buffer.from(authorization ?? "", "utf8");
  const candidates: Array<[string | undefined, BridgeScope]> = [
    [env.AGSHARE_BRIDGE_TOKEN, "write"],
    [env.AGSHARE_BRIDGE_READ_TOKEN, "read"],
  ];
  let scope: BridgeScope | null = null;
  let matches = 0;
  for (const [secret, permission] of candidates) {
    if (!secret) continue;
    const expected = Buffer.from(`Bearer ${secret}`, "utf8");
    if (presented.length === expected.length && timingSafeEqual(presented, expected)) {
      scope = permission;
      matches++;
    }
  }
  // Reject ambiguous configuration when the same token is assigned both scopes.
  return matches === 1 ? scope : null;
}

export function bridgeScopeAllows(scope: BridgeScope, tool: string): boolean {
  const readTools = ["agshare_list_fields", "agshare_get_field"];
  const writeTools = ["agshare_create_field", "agshare_update_field"];
  return readTools.includes(tool) || (scope === "write" && writeTools.includes(tool));
}

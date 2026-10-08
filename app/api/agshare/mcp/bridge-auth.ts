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
  for (const [secret, permission] of candidates) {
    if (!secret) continue;
    const expected = Buffer.from(`Bearer ${secret}`, "utf8");
    if (presented.length === expected.length && timingSafeEqual(presented, expected)) {
      scope = permission;
    }
  }
  return scope;
}

export function bridgeScopeAllows(scope: BridgeScope, tool: string): boolean {
  return scope === "write" || tool === "agshare_list_fields" || tool === "agshare_get_field";
}

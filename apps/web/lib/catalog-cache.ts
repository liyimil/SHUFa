import { timingSafeEqual } from "node:crypto";

export const publicCatalogCacheTag = "public-catalog-v1";

export function hasValidBearerToken(
  authorization: string | null,
  expectedToken: string | undefined,
): boolean {
  if (!expectedToken || expectedToken.length < 32 || !authorization) {
    return false;
  }
  const [scheme, token, extra] = authorization.trim().split(/\s+/);
  if (scheme !== "Bearer" || !token || extra) return false;
  const provided = Buffer.from(token);
  const expected = Buffer.from(expectedToken);
  return (
    provided.length === expected.length && timingSafeEqual(provided, expected)
  );
}

import { revalidateTag } from "next/cache";

import {
  hasValidBearerToken,
  publicCatalogCacheTag,
} from "../../../../lib/catalog-cache";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  const expectedToken = process.env.WEB_CACHE_INVALIDATION_TOKEN;
  if (!expectedToken || expectedToken.length < 32) {
    return Response.json(
      { code: "CACHE_INVALIDATION_NOT_CONFIGURED" },
      { status: 503 },
    );
  }
  if (
    !hasValidBearerToken(request.headers.get("authorization"), expectedToken)
  ) {
    return Response.json({ code: "INVALID_INTERNAL_TOKEN" }, { status: 401 });
  }
  revalidateTag(publicCatalogCacheTag, { expire: 0 });
  return Response.json({ revalidated: true });
}

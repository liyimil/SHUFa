import { Injectable } from "@nestjs/common";

export const PUBLIC_CATALOG_INVALIDATOR = Symbol("PUBLIC_CATALOG_INVALIDATOR");

export interface PublicCatalogInvalidator {
  invalidate(): Promise<void>;
}

type Fetcher = typeof fetch;

export async function requestPublicCatalogInvalidation(
  environment: NodeJS.ProcessEnv = process.env,
  fetcher: Fetcher = fetch,
): Promise<boolean> {
  const url = environment.WEB_CACHE_INVALIDATION_URL?.trim();
  const token = environment.WEB_CACHE_INVALIDATION_TOKEN?.trim();
  if (!url || !token) return false;

  const response = await fetcher(url, {
    headers: { Authorization: `Bearer ${token}` },
    method: "POST",
  });
  if (!response.ok) {
    throw new Error(
      `Public catalog cache invalidation failed (${response.status}).`,
    );
  }
  return true;
}

@Injectable()
export class HttpPublicCatalogInvalidator implements PublicCatalogInvalidator {
  async invalidate(): Promise<void> {
    await requestPublicCatalogInvalidation();
  }
}

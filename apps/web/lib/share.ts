export interface PublicPracticeShare {
  attempts: Array<{
    artworkId: string;
    createdAt: string;
    imageUrl: string;
    sequence: number;
  }>;
  character: string;
  createdAt: string;
  id: string;
  master: {
    calligrapherName: string;
    glyphId: string;
    imageUrl: string | null;
    workTitle: string;
  };
}

export interface PublicShareSummary {
  attemptCount: number;
  character: string;
  master: {
    calligrapherName: string;
    workTitle: string;
  };
}

export function buildShareApiUrl(apiOrigin: string, token: string): string {
  return `${apiOrigin.replace(/\/$/, "")}/api/v1/shares/${encodeURIComponent(token)}`;
}

export function buildShareSummaryApiUrl(
  apiOrigin: string,
  token: string,
): string {
  return `${buildShareApiUrl(apiOrigin, token)}/summary`;
}

export async function fetchPublicShare(
  token: string,
): Promise<PublicPracticeShare | null> {
  const apiOrigin = process.env.API_BASE_URL ?? "http://localhost:3001";
  const response = await fetch(buildShareApiUrl(apiOrigin, token), {
    cache: "no-store",
  });
  if (response.status === 404) return null;
  if (!response.ok) {
    throw await readApiClientError(response, "练习分享请求失败");
  }
  return (await response.json()) as PublicPracticeShare;
}

export async function fetchPublicShareSummary(
  token: string,
): Promise<PublicShareSummary | null> {
  const apiOrigin = process.env.API_BASE_URL ?? "http://localhost:3001";
  const response = await fetch(buildShareSummaryApiUrl(apiOrigin, token), {
    cache: "no-store",
  });
  if (response.status === 404) return null;
  if (!response.ok) {
    throw await readApiClientError(response, "分享摘要请求失败");
  }
  return (await response.json()) as PublicShareSummary;
}
import { readApiClientError } from "@calligraphy/api-contract";

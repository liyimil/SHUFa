import type { PublicShareSummary } from "./share";

export interface ShareCardSummary {
  active: boolean;
  attemptCount: number;
  description: string;
  title: string;
}

export function buildShareCardSummary(
  share: PublicShareSummary | null,
): ShareCardSummary {
  if (!share) {
    return {
      active: false,
      attemptCount: 0,
      description: "该分享已过期、被撤销或不存在。",
      title: "书法练习分享不可用",
    };
  }
  return {
    active: true,
    attemptCount: share.attemptCount,
    description: `临写${share.master.calligrapherName}《${share.master.workTitle}》，共${share.attemptCount}次练习。`,
    title: `“${share.character}”字书法练习记录`,
  };
}

export function publicWebOrigin(
  configured: string | undefined = process.env.PUBLIC_WEB_URL,
): string {
  configured ??= "http://localhost:3000";
  const parsed = new URL(configured);
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("PUBLIC_WEB_URL must use http or https.");
  }
  return parsed.origin;
}

export function shareOpenGraphImageUrl(origin: string, token: string): string {
  return `${origin.replace(/\/$/, "")}/shares/${encodeURIComponent(token)}/opengraph-image`;
}

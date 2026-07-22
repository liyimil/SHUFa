import { apiRequestIdHint } from "@calligraphy/api-contract";
import type { Metadata } from "next";
import Link from "next/link";

import { fetchPublicShare, fetchPublicShareSummary } from "../../../lib/share";
import {
  buildShareCardSummary,
  publicWebOrigin,
  shareOpenGraphImageUrl,
} from "../../../lib/share-card";

interface SharePageProps {
  params: Promise<{ token: string }>;
}

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: SharePageProps): Promise<Metadata> {
  const { token } = await params;
  let share = null;
  try {
    share = await fetchPublicShareSummary(token);
  } catch {
    // The public page handles service failures without exposing internals.
  }
  const summary = buildShareCardSummary(share);
  const image = shareOpenGraphImageUrl(publicWebOrigin(), token);
  return {
    description: summary.description,
    openGraph: {
      description: summary.description,
      images: [
        { alt: "书法练习分享结果卡片", height: 630, url: image, width: 1200 },
      ],
      title: summary.title,
      type: "article",
    },
    robots: { follow: false, index: false },
    title: summary.title,
    twitter: {
      card: "summary_large_image",
      description: summary.description,
      images: [image],
      title: summary.title,
    },
  };
}

export default async function SharePage({ params }: SharePageProps) {
  const { token } = await params;
  let share = null;
  let unavailable = false;
  let requestIdHint: string | null = null;
  try {
    share = await fetchPublicShare(token);
  } catch (error: unknown) {
    unavailable = true;
    requestIdHint = apiRequestIdHint(error);
  }

  if (!share) {
    return (
      <main className="result-shell">
        <p className="eyebrow">练习分享</p>
        <h1 className="share-title">分享不可用</h1>
        <p className="empty-state">
          {unavailable
            ? "服务暂时不可用，请稍后重试。"
            : "该分享已过期、被撤销或不存在。"}
        </p>
        {requestIdHint ? <p className="request-id">{requestIdHint}</p> : null}
        <Link className="back-link" href="/">
          去查一个字
        </Link>
      </main>
    );
  }

  return (
    <main className="result-shell">
      <header className="result-header">
        <div>
          <p className="eyebrow">我的书法练习</p>
          <h1 className="result-title">{share.character}</h1>
          <p className="result-subtitle">
            临写 {share.master.calligrapherName}《{share.master.workTitle}》
          </p>
        </div>
        <Link className="back-link" href={`/characters/${share.character}`}>
          查看同字范字
        </Link>
      </header>
      <section aria-label="练习前后记录" className="attempt-grid">
        {share.attempts.map((attempt) => (
          <article className="glyph-card" key={attempt.artworkId}>
            {/* Signed URLs expire quickly and are emitted only for an active share. */}
            <img
              alt={`第 ${attempt.sequence} 次“${share.character}”字练习`}
              className="glyph-image"
              src={attempt.imageUrl}
            />
            <div className="glyph-copy">
              <h2>第 {attempt.sequence} 次练习</h2>
              <p className="source-line">
                {new Intl.DateTimeFormat("zh-CN", {
                  dateStyle: "medium",
                }).format(new Date(attempt.createdAt))}
              </p>
            </div>
          </article>
        ))}
      </section>
      <p className="privacy-note">
        该页面由练习者主动分享；撤销分享后，链接将立即失效。
      </p>
    </main>
  );
}

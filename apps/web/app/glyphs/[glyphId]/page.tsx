import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { fetchGlyphDetail, type GlyphDetail } from "../../../lib/catalog";
import {
  buildGlyphJsonLd,
  buildGlyphMetadata,
  serializeJsonLd,
} from "../../../lib/public-page-metadata";

interface GlyphDetailPageProps {
  params: Promise<{ glyphId: string }>;
}

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: GlyphDetailPageProps): Promise<Metadata> {
  const { glyphId } = await params;
  try {
    return buildGlyphMetadata(await fetchGlyphDetail(glyphId));
  } catch {
    return buildGlyphMetadata(null);
  }
}

export default async function GlyphDetailPage({
  params,
}: GlyphDetailPageProps) {
  const { glyphId } = await params;
  let glyph: GlyphDetail | null = null;
  let requestFailed = false;
  try {
    glyph = await fetchGlyphDetail(glyphId);
  } catch {
    requestFailed = true;
  }
  if (requestFailed) {
    return (
      <main className="result-shell">
        <div className="error-state">
          <h1>范字详情暂时不可用</h1>
          <p>内容可能已下架、权利已到期，或资料服务暂时不可用。</p>
          <Link className="back-link" href="/">
            返回查字
          </Link>
        </div>
      </main>
    );
  }
  if (!glyph) notFound();

  const box = glyph.sourceContext.boundingBox;
  return (
    <main className="result-shell">
      <script
        dangerouslySetInnerHTML={{
          __html: serializeJsonLd(buildGlyphJsonLd(glyph)),
        }}
        type="application/ld+json"
      />
      <Link className="back-link" href={`/characters/${glyph.character}`}>
        返回“{glyph.character}”字
      </Link>
      <article className="glyph-detail">
        <div>
          {glyph.image ? (
            <img
              alt={`${glyph.calligrapher.name}书${glyph.character}字`}
              className="glyph-image"
              height={glyph.image.height}
              src={glyph.image.url}
              width={glyph.image.width}
            />
          ) : (
            <div className="glyph-placeholder">公开裁切图处理中</div>
          )}
        </div>
        <div className="detail-copy">
          <p className="eyebrow">来源可追溯范字</p>
          <h1>
            {glyph.character} · {glyph.calligrapher.name}
          </h1>
          <dl>
            <dt>书家</dt>
            <dd>
              {glyph.calligrapher.dynasty} · {glyph.calligrapher.name}
            </dd>
            <dt>作品</dt>
            <dd>{glyph.work.title}</dd>
            <dt>版本</dt>
            <dd>
              {glyph.edition.name}
              {glyph.edition.holdingInstitution
                ? ` · ${glyph.edition.holdingInstitution}`
                : ""}
            </dd>
            <dt>原帖位置</dt>
            <dd>
              {glyph.sourceContext.pageLabel ?? "未标页码"}；框选坐标 x=
              {box.x}, y={box.y}, {box.width}×{box.height}
            </dd>
            <dt>来源</dt>
            <dd>{glyph.rights.sourceName}</dd>
            <dt>许可</dt>
            <dd>{glyph.rights.licenseName ?? "按来源权利记录审核"}</dd>
          </dl>
          {glyph.rights.attributionText ? (
            <p className="attribution">署名：{glyph.rights.attributionText}</p>
          ) : null}
          <div className="source-links">
            {glyph.edition.sourceUrl ? (
              <a
                href={glyph.edition.sourceUrl}
                rel="noreferrer"
                target="_blank"
              >
                查看版本资料
              </a>
            ) : null}
            {glyph.rights.sourceUrl ? (
              <a href={glyph.rights.sourceUrl} rel="noreferrer" target="_blank">
                查看权利来源
              </a>
            ) : null}
          </div>
          <p className="privacy-note">
            原帖档案图保持私有；这里只公开经过审核的单字衍生图和可核验位置数据。
          </p>
        </div>
      </article>
    </main>
  );
}

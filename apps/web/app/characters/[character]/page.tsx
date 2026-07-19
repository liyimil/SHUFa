import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
  type CatalogFilters,
  fetchCatalog,
  normalizeHanQuery,
  type CatalogResult,
} from "../../../lib/catalog";
import {
  buildCharacterJsonLd,
  buildCharacterMetadata,
  serializeJsonLd,
} from "../../../lib/public-page-metadata";

export const dynamic = "force-dynamic";

interface CharacterPageProps {
  params: Promise<{ character: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function catalogFilters(
  searchParams: Record<string, string | string[] | undefined>,
): CatalogFilters {
  const filters: CatalogFilters = {};
  const calligrapherId = searchParams.calligrapherId;
  const workId = searchParams.workId;
  if (typeof calligrapherId === "string" && uuidPattern.test(calligrapherId)) {
    filters.calligrapherId = calligrapherId;
  }
  if (typeof workId === "string" && uuidPattern.test(workId)) {
    filters.workId = workId;
  }
  if (searchParams.scriptStyle === "REGULAR") {
    filters.scriptStyle = "REGULAR";
  }
  return filters;
}

export async function generateMetadata({
  params,
}: CharacterPageProps): Promise<Metadata> {
  const { character: rawCharacter } = await params;
  const character = normalizeHanQuery(rawCharacter);

  if (!character) {
    return { title: "未找到这个字" };
  }
  try {
    return buildCharacterMetadata(character, await fetchCatalog(character));
  } catch {
    return buildCharacterMetadata(character, null);
  }
}

export default async function CharacterPage({
  params,
  searchParams,
}: CharacterPageProps) {
  const { character: rawCharacter } = await params;
  const character = normalizeHanQuery(rawCharacter);
  const filters = catalogFilters(await searchParams);

  if (!character) {
    notFound();
  }

  let result: CatalogResult;

  try {
    result = await fetchCatalog(character, filters);
  } catch {
    return (
      <main className="result-shell">
        <div className="error-state">
          <h1>资料服务暂时不可用</h1>
          <p>
            你的查询没有丢失，请稍后再试。我们不会用未经核验的图片填充结果。
          </p>
          <Link className="back-link" href="/">
            返回查字
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="result-shell">
      <script
        dangerouslySetInnerHTML={{
          __html: serializeJsonLd(buildCharacterJsonLd(result)),
        }}
        type="application/ld+json"
      />
      <header className="result-header">
        <div>
          <p className="eyebrow">名家同字检索</p>
          <h1 className="result-title">
            {result.canonicalCharacter ?? character}
          </h1>
          <p className="result-subtitle">
            只展示已审核并允许公开的真实来源内容。
          </p>
        </div>
        <Link className="back-link" href="/">
          查另一个字
        </Link>
      </header>

      <form className="catalog-filters" method="get">
        <label>
          书家
          <select
            defaultValue={result.filters.calligrapherId ?? ""}
            name="calligrapherId"
          >
            <option value="">全部书家</option>
            {result.facets.calligraphers.map((item) => (
              <option key={item.id} value={item.id}>
                {item.dynasty} · {item.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          碑帖
          <select defaultValue={result.filters.workId ?? ""} name="workId">
            <option value="">全部碑帖</option>
            {result.facets.works.map((item) => (
              <option key={item.id} value={item.id}>
                {item.title}
              </option>
            ))}
          </select>
        </label>
        <label>
          书体
          <select
            defaultValue={result.filters.scriptStyle ?? ""}
            name="scriptStyle"
          >
            <option value="">全部书体</option>
            {result.facets.scriptStyles.includes("REGULAR") ? (
              <option value="REGULAR">楷书</option>
            ) : null}
          </select>
        </label>
        <div className="filter-actions">
          <button type="submit">应用筛选</button>
          <Link href={`/characters/${encodeURIComponent(character)}`}>
            清除
          </Link>
        </div>
      </form>

      {result.glyphs.length === 0 ? (
        <section className="empty-state">
          <h2>暂时没有可靠范字</h2>
          <p>
            该字尚未收录经过来源与版权审核的名家写法。我们宁可少，也不会用不明图片凑数。
          </p>
        </section>
      ) : (
        <section aria-label={`${character}字的名家写法`} className="glyph-grid">
          {result.glyphs.map((glyph) => (
            <article className="glyph-card" key={glyph.id}>
              {glyph.image ? (
                <img
                  alt={`${glyph.calligrapher.name}书${character}字`}
                  className="glyph-image"
                  height={glyph.image.height}
                  src={glyph.image.url}
                  width={glyph.image.width}
                />
              ) : (
                <div className="glyph-placeholder">图片衍生处理中</div>
              )}
              <div className="glyph-copy">
                <h2>{glyph.calligrapher.name}</h2>
                <p>
                  {glyph.calligrapher.dynasty} · {glyph.work.title}
                </p>
                <p className="source-line">
                  版本：{glyph.edition.name}
                  <br />
                  来源：{glyph.rights.sourceName}
                </p>
                <Link className="detail-link" href={`/glyphs/${glyph.id}`}>
                  查看出处与原帖位置
                </Link>
              </div>
            </article>
          ))}
        </section>
      )}
    </main>
  );
}

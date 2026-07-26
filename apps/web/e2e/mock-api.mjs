import { Buffer } from "node:buffer";
import { createServer } from "node:http";
import process from "node:process";
import { URL } from "node:url";

const host = "127.0.0.1";
const port = 3101;
const calligrapherIds = {
  ouyang: "22222222-2222-4222-8222-222222222222",
  wang: "11111111-1111-4111-8111-111111111111",
};
const workIds = {
  jiuchenggong: "44444444-4444-4444-8444-444444444444",
  lanting: "33333333-3333-4333-8333-333333333333",
};
const glyphIds = {
  ouyang: "66666666-6666-4666-8666-666666666666",
  wang: "55555555-5555-4555-8555-555555555555",
};
const revokedShares = new Set();
const mockUserId = "00000000-0000-4000-8000-000000000001";
const mockAccessToken = "mock-access-token-e2e";
const mockRefreshToken = "mock-refresh-token-e2e";
const syntheticTestImage = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800"><rect width="800" height="800" fill="#e8dfd1"/><text x="400" y="420" text-anchor="middle" font-family="sans-serif" font-size="72" fill="#8c3c2d">E2E TEST</text></svg>',
  "utf8",
);

function glyphFixture(key) {
  const ouyang = key === "ouyang";
  return {
    authenticityGrade: "B_RUBBING_OR_AUTHORIZED_EDITION",
    calligrapher: {
      dynasty: ouyang ? "唐" : "东晋",
      id: calligrapherIds[key],
      name: ouyang ? "欧阳询" : "王羲之",
    },
    edition: {
      holdingInstitution: "E2E 测试馆藏",
      id: ouyang
        ? "88888888-8888-4888-8888-888888888888"
        : "77777777-7777-4777-8777-777777777777",
      name: ouyang ? "九成宫测试拓本" : "兰亭测试摹本",
      sourceUrl: "https://example.test/edition",
    },
    id: glyphIds[key],
    image: {
      height: 800,
      id: ouyang
        ? "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
        : "99999999-9999-4999-8999-999999999999",
      kind: "PUBLIC_GLYPH_CROP",
      url: `http://${host}:${port}/assets/${key}.png`,
      width: 800,
    },
    rights: {
      attributionText: "仅用于自动化测试的合成夹具",
      licenseName: "E2E fixture only",
      sourceName: "自动化测试夹具",
      sourceUrl: "https://example.test/rights",
    },
    work: {
      id: ouyang ? workIds.jiuchenggong : workIds.lanting,
      title: ouyang ? "九成宫醴泉铭（测试夹具）" : "兰亭序（测试夹具）",
    },
  };
}

const allGlyphs = [glyphFixture("wang"), glyphFixture("ouyang")];

function json(response, statusCode, body) {
  response.writeHead(statusCode, {
    "cache-control": "no-store",
    "content-type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(body));
}

function catalogResponse(url) {
  const calligrapherId = url.searchParams.get("calligrapherId");
  const workId = url.searchParams.get("workId");
  const scriptStyle = url.searchParams.get("scriptStyle");
  const glyphs = allGlyphs.filter(
    (glyph) =>
      (!calligrapherId || glyph.calligrapher.id === calligrapherId) &&
      (!workId || glyph.work.id === workId) &&
      (!scriptStyle || scriptStyle === "REGULAR"),
  );
  return {
    canonicalCharacter: "永",
    facets: {
      calligraphers: allGlyphs.map((glyph) => glyph.calligrapher),
      scriptStyles: ["REGULAR"],
      works: allGlyphs.map((glyph) => ({
        calligrapherId: glyph.calligrapher.id,
        id: glyph.work.id,
        title: glyph.work.title,
      })),
    },
    filters: {
      ...(calligrapherId ? { calligrapherId } : {}),
      ...(scriptStyle ? { scriptStyle } : {}),
      ...(workId ? { workId } : {}),
    },
    glyphs,
    query: "永",
  };
}

function shareFixture() {
  return {
    attempts: [
      {
        artworkId: "attempt-one",
        createdAt: "2026-07-20T08:00:00.000Z",
        imageUrl: `http://${host}:${port}/assets/attempt-one.png`,
        sequence: 1,
      },
      {
        artworkId: "attempt-two",
        createdAt: "2026-07-21T08:00:00.000Z",
        imageUrl: `http://${host}:${port}/assets/attempt-two.png`,
        sequence: 2,
      },
    ],
    character: "永",
    createdAt: "2026-07-20T08:00:00.000Z",
    id: "practice-e2e",
    master: {
      calligrapherName: "欧阳询",
      glyphId: glyphIds.ouyang,
      imageUrl: `http://${host}:${port}/assets/ouyang.png`,
      workTitle: "九成宫醴泉铭（测试夹具）",
    },
  };
}

const server = createServer((request, response) => {
  const url = new URL(request.url ?? "/", `http://${host}:${port}`);
  if (request.method === "GET" && url.pathname === "/__test__/health") {
    json(response, 200, { status: "ok" });
    return;
  }
  if (request.method === "POST" && url.pathname === "/__test__/reset") {
    revokedShares.clear();
    json(response, 200, { reset: true });
    return;
  }
  if (
    request.method === "POST" &&
    url.pathname === "/api/v1/identity/anonymous"
  ) {
    json(response, 201, {
      accessToken: mockAccessToken,
      expiresInSeconds: 900,
      refreshExpiresInSeconds: 2592000,
      refreshToken: mockRefreshToken,
      tokenType: "Bearer",
      user: { id: mockUserId, kind: "anonymous" },
    });
    return;
  }
  if (
    request.method === "POST" &&
    url.pathname === "/api/v1/identity/refresh"
  ) {
    json(response, 200, {
      accessToken: mockAccessToken,
      expiresInSeconds: 900,
      refreshExpiresInSeconds: 2592000,
      refreshToken: mockRefreshToken,
      tokenType: "Bearer",
      user: { id: mockUserId, kind: "anonymous" },
    });
    return;
  }
  if (
    request.method === "POST" &&
    url.pathname.startsWith("/__test__/shares/") &&
    url.pathname.endsWith("/revoke")
  ) {
    revokedShares.add(url.pathname.split("/")[3]);
    json(response, 200, { revoked: true });
    return;
  }
  if (request.method === "GET" && url.pathname.startsWith("/assets/")) {
    response.writeHead(200, {
      "cache-control": "no-store",
      "content-type": "image/svg+xml; charset=utf-8",
    });
    response.end(syntheticTestImage);
    return;
  }
  if (
    request.method === "GET" &&
    url.pathname === "/api/v1/characters/%E6%B0%B8/glyphs"
  ) {
    json(response, 200, catalogResponse(url));
    return;
  }
  if (request.method === "GET" && url.pathname.startsWith("/api/v1/glyphs/")) {
    const glyphId = url.pathname.split("/").at(-1);
    const glyph = allGlyphs.find((item) => item.id === glyphId);
    if (!glyph) {
      json(response, 404, { code: "GLYPH_NOT_FOUND", message: "Not found" });
      return;
    }
    json(response, 200, {
      ...glyph,
      character: "永",
      publishedAt: "2026-07-01T00:00:00.000Z",
      sourceContext: {
        boundingBox: { height: 260, width: 240, x: 120, y: 180 },
        pageLabel: "测试页 1",
        sourceImage: { height: 2000, width: 1600 },
      },
    });
    return;
  }
  if (request.method === "GET" && url.pathname.startsWith("/api/v1/shares/")) {
    const parts = url.pathname.split("/");
    const token = parts[4];
    if (!token || revokedShares.has(token)) {
      json(response, 404, { code: "SHARE_NOT_FOUND", message: "Not found" });
      return;
    }
    const share = shareFixture();
    json(
      response,
      200,
      parts[5] === "summary"
        ? {
            attemptCount: share.attempts.length,
            character: share.character,
            master: share.master,
          }
        : share,
    );
    return;
  }
  json(response, 404, { code: "E2E_ROUTE_NOT_FOUND", message: url.pathname });
});

server.listen(port, host);

function closeServer() {
  server.close(() => process.exit(0));
}

process.on("SIGINT", closeServer);
process.on("SIGTERM", closeServer);

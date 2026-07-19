import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  cancelArtworkUpload,
  createFavoriteGroup,
  createAnonymousSession,
  createArtworkUpload,
  fetchCatalog,
  fetchGlyphDetail,
  getPrivacyPreferences,
  listFavoriteLibrary,
  listFeedback,
  listPractices,
  normalizeApiBaseUrl,
  trackProductEvent,
  refreshAnonymousSession,
  placeFavoriteGlyph,
  reorderFavoriteGlyph,
  reorderFavoriteGroup,
  submitFeedback,
  upgradeAnonymousSession,
  updatePrivacyPreferences,
  unfavoriteGlyph,
  waitForArtworkAnalysis,
  waitForArtworkDeletion,
  waitForPracticeAdvice,
} from "../src/api";

const identitySession = {
  accessToken: "signed-token",
  expiresInSeconds: 900,
  refreshExpiresInSeconds: 2_592_000,
  refreshToken: "a".repeat(43),
  tokenType: "Bearer" as const,
  user: { id: "user-id", kind: "anonymous" as const },
};

describe("mobile API client", () => {
  it("normalizes the configured API base URL", () => {
    assert.equal(
      normalizeApiBaseUrl(" https://api.example.com/api/v1/ "),
      "https://api.example.com/api/v1",
    );
    assert.throws(() => normalizeApiBaseUrl("api.example.com"));
  });

  it("reads an anonymous access token", async () => {
    const fetcher: typeof fetch = async () =>
      new Response(JSON.stringify(identitySession), {
        headers: { "content-type": "application/json" },
        status: 201,
      });

    const session = await createAnonymousSession(
      "https://api.example.com/api/v1",
      fetcher,
    );

    assert.deepEqual(session, identitySession);
  });

  it("calls the favorite copybook grouping and ordering endpoints", async () => {
    const calls: Array<{ body: string; method: string; url: string }> = [];
    const fetcher: typeof fetch = async (input, init) => {
      const url = String(input);
      calls.push({
        body: String(init?.body ?? ""),
        method: String(init?.method),
        url,
      });
      if (url.endsWith("/favorites")) {
        return Response.json({ groups: [], ungrouped: [] });
      }
      if (url.endsWith("/favorite-groups")) {
        return Response.json({ id: "group-id", name: "颜体", sortOrder: 0 });
      }
      return Response.json({ ok: true });
    };

    await listFavoriteLibrary(
      "https://api.example.com/api/v1",
      "token",
      fetcher,
    );
    await createFavoriteGroup(
      "https://api.example.com/api/v1",
      "token",
      "颜体",
      fetcher,
    );
    await placeFavoriteGlyph(
      "https://api.example.com/api/v1",
      "token",
      "glyph-id",
      "group-id",
      fetcher,
    );
    await reorderFavoriteGlyph(
      "https://api.example.com/api/v1",
      "token",
      "glyph-id",
      "UP",
      fetcher,
    );
    await reorderFavoriteGroup(
      "https://api.example.com/api/v1",
      "token",
      "group-id",
      "DOWN",
      fetcher,
    );
    await unfavoriteGlyph(
      "https://api.example.com/api/v1",
      "token",
      "glyph-id",
      fetcher,
    );

    assert.deepEqual(
      calls.map(({ method, url }) => ({ method, url })),
      [
        { method: "GET", url: "https://api.example.com/api/v1/favorites" },
        {
          method: "POST",
          url: "https://api.example.com/api/v1/favorite-groups",
        },
        {
          method: "PUT",
          url: "https://api.example.com/api/v1/favorites/glyphs/glyph-id",
        },
        {
          method: "POST",
          url: "https://api.example.com/api/v1/favorites/glyphs/glyph-id/reorder",
        },
        {
          method: "POST",
          url: "https://api.example.com/api/v1/favorite-groups/group-id/reorder",
        },
        {
          method: "DELETE",
          url: "https://api.example.com/api/v1/favorites/glyphs/glyph-id",
        },
      ],
    );
    assert.deepEqual(JSON.parse(calls[2]!.body), { groupId: "group-id" });
    assert.deepEqual(JSON.parse(calls[3]!.body), { direction: "UP" });
  });

  it("upgrades legacy access and rotates refresh credentials", async () => {
    let authorization = "";
    let refreshBody = "";
    const fetcher: typeof fetch = async (input, init) => {
      const url = String(input);
      if (url.endsWith("/identity/session")) {
        authorization = new Headers(init?.headers).get("Authorization") ?? "";
      } else {
        refreshBody = String(init?.body);
      }
      return new Response(JSON.stringify(identitySession), {
        headers: { "Content-Type": "application/json" },
        status: 201,
      });
    };

    await upgradeAnonymousSession(
      "https://api.example.com/api/v1",
      "legacy-token",
      fetcher,
    );
    await refreshAnonymousSession(
      "https://api.example.com/api/v1",
      "old-refresh-token",
      fetcher,
    );

    assert.equal(authorization, "Bearer legacy-token");
    assert.deepEqual(JSON.parse(refreshBody), {
      refreshToken: "old-refresh-token",
    });
  });

  it("cancels a pending upload through the authenticated cleanup boundary", async () => {
    let authorization = "";
    let requestedUrl = "";
    const result = await cancelArtworkUpload(
      "https://api.example.com/api/v1",
      "signed-token",
      "upload-id",
      async (input, init) => {
        requestedUrl = String(input);
        authorization = new Headers(init?.headers).get("Authorization") ?? "";
        return Response.json({
          artworkId: "artwork-id",
          status: "DELETED",
          uploadId: "upload-id",
        });
      },
    );

    assert.equal(
      requestedUrl,
      "https://api.example.com/api/v1/uploads/upload-id/cancel",
    );
    assert.equal(authorization, "Bearer signed-token");
    assert.equal(result.status, "DELETED");
  });

  it("sends a stable client request id when reserving an upload", async () => {
    let requestBody = "";
    const controller = new AbortController();
    await createArtworkUpload(
      "https://api.example.com/api/v1",
      "signed-token",
      {
        clientRequestId: "mobile-request-0001",
        height: 1024,
        mimeType: "image/jpeg",
        sizeBytes: 2048,
        width: 1024,
      },
      async (_input, init) => {
        requestBody = String(init?.body);
        assert.equal(init?.signal, controller.signal);
        return Response.json({
          artworkId: "artwork-id",
          expiresAt: "2026-07-18T00:10:00.000Z",
          maxBytes: 2048,
          requiredHeaders: { "Content-Type": "image/jpeg" },
          uploadId: "upload-id",
          uploadUrl: "https://storage.example/upload",
        });
      },
      controller.signal,
    );

    assert.deepEqual(JSON.parse(requestBody), {
      clientRequestId: "mobile-request-0001",
      height: 1024,
      mimeType: "image/jpeg",
      sizeBytes: 2048,
      width: 1024,
    });
  });

  it("records a typed product event without arbitrary metadata", async () => {
    let requestBody = "";
    await trackProductEvent(
      "https://api.example.com/api/v1",
      "signed-token",
      {
        eventId: "4b02e7dd-24de-47e3-ab13-1d4a7f952935",
        name: "PRACTICE_COMPLETED",
        occurredAt: "2026-07-18T12:00:00.000Z",
        practiceSessionId: "53a3e68c-c38c-4b79-90b4-ab1212491184",
      },
      async (input, init) => {
        assert.equal(String(input), "https://api.example.com/api/v1/events");
        requestBody = String(init?.body);
        return Response.json({
          eventId: "4b02e7dd-24de-47e3-ab13-1d4a7f952935",
          status: "RECORDED",
        });
      },
    );

    assert.deepEqual(Object.keys(JSON.parse(requestBody)).sort(), [
      "eventId",
      "name",
      "occurredAt",
      "practiceSessionId",
    ]);
  });

  it("loads the current user's practice history", async () => {
    let authorization = "";
    const history = await listPractices(
      "https://api.example.com/api/v1",
      "signed-token",
      async (_input, init) => {
        authorization = new Headers(init?.headers).get("Authorization") ?? "";
        return new Response("[]", {
          headers: { "Content-Type": "application/json" },
          status: 200,
        });
      },
    );

    assert.deepEqual(history, []);
    assert.equal(authorization, "Bearer signed-token");
  });

  it("sends catalog filters and uses the public glyph detail boundary", async () => {
    const urls: string[] = [];
    const fetcher: typeof fetch = async (input) => {
      const url = String(input);
      urls.push(url);
      return new Response(
        JSON.stringify(
          url.includes("/glyphs/glyph-id")
            ? {}
            : {
                canonicalCharacter: "永",
                facets: { calligraphers: [], scriptStyles: [], works: [] },
                filters: { scriptStyle: "REGULAR" },
                glyphs: [],
                query: "永",
              },
        ),
        { headers: { "Content-Type": "application/json" }, status: 200 },
      );
    };

    await fetchCatalog(
      "https://api.example.com/api/v1",
      "永",
      { scriptStyle: "REGULAR", workId: "work-id" },
      fetcher,
    );
    await fetchGlyphDetail(
      "https://api.example.com/api/v1",
      "glyph-id",
      fetcher,
    );

    assert.equal(
      urls[0],
      "https://api.example.com/api/v1/characters/%E6%B0%B8/glyphs?scriptStyle=REGULAR&workId=work-id",
    );
    assert.equal(urls[1], "https://api.example.com/api/v1/glyphs/glyph-id");
  });

  it("reads and updates independent privacy permissions", async () => {
    const preferences = {
      allowArtworkStorage: true,
      allowModelTraining: false,
      allowPublicSharing: false,
      policyVersion: "privacy-v1",
      sharingUpdatedAt: "2026-07-18T00:00:00.000Z",
      storageUpdatedAt: "2026-07-18T00:00:00.000Z",
      trainingUpdatedAt: "2026-07-18T00:00:00.000Z",
      updatedAt: "2026-07-18T00:00:00.000Z",
    };
    const methods: string[] = [];
    const bodies: string[] = [];
    const fetcher: typeof fetch = async (_input, init) => {
      methods.push(init?.method ?? "GET");
      if (init?.body) bodies.push(String(init.body));
      return new Response(JSON.stringify(preferences), {
        headers: { "Content-Type": "application/json" },
        status: 200,
      });
    };

    await getPrivacyPreferences(
      "https://api.example.com/api/v1",
      "signed-token",
      fetcher,
    );
    await updatePrivacyPreferences(
      "https://api.example.com/api/v1",
      "signed-token",
      { allowModelTraining: true },
      fetcher,
    );

    assert.deepEqual(methods, ["GET", "PUT"]);
    assert.deepEqual(JSON.parse(bodies[0] ?? "{}"), {
      allowModelTraining: true,
    });
  });

  it("submits typed issue feedback and reads its processing status", async () => {
    const requests: Array<{ body: string; method: string; url: string }> = [];
    const ticket = {
      accurate: null,
      createdAt: "2026-07-18T00:00:00.000Z",
      id: "feedback-id",
      kind: "CONTENT_ERROR",
      message: "出处页码有误",
      referenceId: "glyph-id",
      referenceType: "Glyph",
      resolutionNote: null,
      resolvedAt: null,
      status: "OPEN",
      updatedAt: "2026-07-18T00:00:00.000Z",
    };
    const fetcher: typeof fetch = async (input, init) => {
      requests.push({
        body: String(init?.body ?? ""),
        method: init?.method ?? "GET",
        url: String(input),
      });
      return Response.json(init?.method === "POST" ? ticket : [ticket]);
    };
    await submitFeedback(
      "https://api.example.com/api/v1",
      "signed-token",
      {
        kind: "CONTENT_ERROR",
        message: "出处页码有误",
        referenceId: "glyph-id",
        referenceType: "Glyph",
      },
      fetcher,
    );
    const tickets = await listFeedback(
      "https://api.example.com/api/v1",
      "signed-token",
      fetcher,
    );
    assert.equal(requests[0]?.method, "POST");
    assert.equal(requests[1]?.method, "GET");
    assert.equal(requests[0]?.url, "https://api.example.com/api/v1/feedback");
    assert.equal(tickets[0]?.status, "OPEN");
  });

  it("polls until image quality analysis is complete", async () => {
    let requests = 0;
    const result = await waitForArtworkAnalysis(
      "https://api.example.com/api/v1",
      "token",
      "artwork-id",
      {
        attempts: 3,
        delay: () => Promise.resolve(),
        fetcher: async () => {
          requests += 1;
          return new Response(
            JSON.stringify({
              analysis: {
                findings: [],
                metrics: null,
                status: requests === 1 ? "PROCESSING" : "PASSED",
                thresholdVersion: "quality-v1",
              },
              artworkId: "artwork-id",
              artworkStatus: requests === 1 ? "PROCESSING" : "READY",
              createdAt: "2026-07-18T00:00:00.000Z",
            }),
            { headers: { "Content-Type": "application/json" }, status: 200 },
          );
        },
        intervalMilliseconds: 0,
      },
    );

    assert.equal(requests, 2);
    assert.equal(result.analysis?.status, "PASSED");
  });

  it("stops image polling when quality analysis has terminally failed", async () => {
    let requests = 0;
    const result = await waitForArtworkAnalysis(
      "https://api.example.com/api/v1",
      "token",
      "artwork-id",
      {
        attempts: 3,
        delay: () => Promise.resolve(),
        fetcher: async () => {
          requests += 1;
          return Response.json({
            analysis: {
              findings: [],
              metrics: null,
              status: "FAILED",
              thresholdVersion: null,
            },
            artworkId: "artwork-id",
            artworkStatus: "READY",
            confirmedCharacter: null,
            createdAt: "2026-07-18T00:00:00.000Z",
          });
        },
        intervalMilliseconds: 0,
      },
    );

    assert.equal(requests, 1);
    assert.equal(result.analysis?.status, "FAILED");
    assert.equal(result.artworkStatus, "READY");
  });

  it("stops advice polling when structure analysis has terminally failed", async () => {
    let requests = 0;
    const result = await waitForPracticeAdvice(
      "https://api.example.com/api/v1",
      "token",
      "practice-id",
      3,
      async () => {
        requests += 1;
        return Response.json({
          attempts: [
            {
              advice: null,
              analysis: {
                failureCode: "STRUCTURE_ANALYSIS_FAILED",
                status: "FAILED",
              },
              artworkId: "artwork-id",
              createdAt: "2026-07-18T00:00:00.000Z",
              imageUrl: "https://private.example/artwork",
              sequence: 1,
            },
          ],
          character: "永",
          createdAt: "2026-07-18T00:00:00.000Z",
          id: "practice-id",
          master: {
            calligrapherName: "欧阳询",
            glyphId: "glyph-id",
            imageUrl: "https://public.example/glyph",
            workTitle: "九成宫醴泉铭",
          },
        });
      },
    );

    assert.equal(requests, 1);
    assert.equal(result.attempts[0]?.analysis?.status, "FAILED");
  });

  it("polls an asynchronous artwork deletion until physical cleanup completes", async () => {
    let requests = 0;
    const result = await waitForArtworkDeletion(
      "https://api.example.com/api/v1",
      "token",
      "deletion-id",
      {
        attempts: 3,
        delay: () => Promise.resolve(),
        fetcher: async () => {
          requests += 1;
          return Response.json({
            artworkId: "artwork-id",
            deletionId: "deletion-id",
            status: requests === 1 ? "DELETION_PENDING" : "DELETED",
            updatedAt: "2026-07-18T00:00:00.000Z",
          });
        },
        intervalMilliseconds: 0,
      },
    );

    assert.equal(requests, 2);
    assert.equal(result.status, "DELETED");
  });
});

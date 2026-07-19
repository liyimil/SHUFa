import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  adminApiBaseUrl,
  createAdminContent,
  createAdminSession,
  getAdminAdviceSamples,
  getAdminContent,
  getAdminContentText,
  getAdminFeedback,
  getAdminFunnel,
  reviewAdminAdvice,
  updateAdminContent,
  updateAdminFeedback,
} from "../lib/api";

describe("admin API client", () => {
  it("normalizes the configured API URL", () => {
    assert.equal(
      adminApiBaseUrl(" https://api.example/v1/ "),
      "https://api.example/v1",
    );
  });

  it("posts credentials to the admin session boundary", async () => {
    let requestedUrl = "";
    const result = await createAdminSession(
      "https://api.example/v1",
      "editor@example.com",
      "password",
      async (input) => {
        requestedUrl = String(input);
        return new Response(
          JSON.stringify({
            accessToken: "token",
            staff: { email: "editor@example.com", roles: ["EDITOR"] },
          }),
          { headers: { "Content-Type": "application/json" }, status: 201 },
        );
      },
    );
    assert.equal(requestedUrl, "https://api.example/v1/admin/session");
    assert.equal(result.accessToken, "token");
  });

  it("patches a glyph correction through the authenticated boundary", async () => {
    let requestedMethod = "";
    let requestedUrl = "";
    await updateAdminContent(
      "https://api.example/v1",
      "staff-token",
      "glyphs/glyph-id",
      { character: "永" },
      async (input, init) => {
        requestedUrl = String(input);
        requestedMethod = init?.method ?? "";
        return Response.json({ glyphId: "glyph-id", status: "NEEDS_REVIEW" });
      },
    );
    assert.equal(
      requestedUrl,
      "https://api.example/v1/admin/content/glyphs/glyph-id",
    );
    assert.equal(requestedMethod, "PATCH");
  });

  it("patches master-data lifecycle changes through the same boundary", async () => {
    let requestedBody = "";
    let requestedUrl = "";
    await updateAdminContent(
      "https://api.example/v1",
      "staff-token",
      "calligraphers/calligrapher-id",
      { isActive: false },
      async (input, init) => {
        requestedUrl = String(input);
        requestedBody = String(init?.body ?? "");
        return Response.json({ id: "calligrapher-id", isActive: false });
      },
    );
    assert.equal(
      requestedUrl,
      "https://api.example/v1/admin/content/calligraphers/calligrapher-id",
    );
    assert.deepEqual(JSON.parse(requestedBody), { isActive: false });
  });

  it("loads and restores immutable content history", async () => {
    const requests: Array<{ method: string; url: string }> = [];
    const fetcher: typeof fetch = async (input, init) => {
      requests.push({ method: init?.method ?? "GET", url: String(input) });
      return Response.json([]);
    };
    await getAdminContent(
      "https://api.example/v1",
      "staff-token",
      "history?entityType=Glyph&entityId=glyph-id",
      fetcher,
    );
    await createAdminContent(
      "https://api.example/v1",
      "staff-token",
      "history/audit-id/restore",
      {},
      fetcher,
    );
    assert.deepEqual(requests, [
      {
        method: "GET",
        url: "https://api.example/v1/admin/content/history?entityType=Glyph&entityId=glyph-id",
      },
      {
        method: "POST",
        url: "https://api.example/v1/admin/content/history/audit-id/restore",
      },
    ]);
  });

  it("submits a source asset for machine pre-segmentation", async () => {
    let requestedUrl = "";
    await createAdminContent(
      "https://api.example/v1",
      "staff-token",
      "source-assets/source-id/segmentation-jobs",
      {},
      async (input) => {
        requestedUrl = String(input);
        return Response.json({ jobId: "job-id", status: "PENDING" });
      },
    );
    assert.equal(
      requestedUrl,
      "https://api.example/v1/admin/content/source-assets/source-id/segmentation-jobs",
    );
  });

  it("loads a private source view and accepts its annotated candidate", async () => {
    const requests: Array<{ body: string; method: string; url: string }> = [];
    const fetcher: typeof fetch = async (input, init) => {
      requests.push({
        body: String(init?.body ?? ""),
        method: init?.method ?? "GET",
        url: String(input),
      });
      return Response.json({});
    };
    await getAdminContent(
      "https://api.example/v1",
      "staff-token",
      "source-assets/source-id/view",
      fetcher,
    );
    await createAdminContent(
      "https://api.example/v1",
      "staff-token",
      "segmentation-candidates/candidate-id/accept",
      {
        bboxHeight: 300,
        bboxWidth: 240,
        bboxX: 10,
        bboxY: 20,
        canonicalCharacter: "吉",
        observedCharacter: "𠮷",
        variantType: "HISTORICAL",
      },
      fetcher,
    );
    assert.deepEqual(
      requests.map(({ method, url }) => ({ method, url })),
      [
        {
          method: "GET",
          url: "https://api.example/v1/admin/content/source-assets/source-id/view",
        },
        {
          method: "POST",
          url: "https://api.example/v1/admin/content/segmentation-candidates/candidate-id/accept",
        },
      ],
    );
    assert.equal(JSON.parse(requests[1]?.body ?? "{}").observedCharacter, "𠮷");
  });

  it("downloads the import template and calls preview and commit boundaries", async () => {
    const requests: Array<{ method: string; url: string }> = [];
    const fetcher: typeof fetch = async (input, init) => {
      requests.push({ method: init?.method ?? "GET", url: String(input) });
      return init?.method === "GET"
        ? new Response("source_asset_id,observed_character")
        : Response.json({ status: "READY" });
    };
    const template = await getAdminContentText(
      "https://api.example/v1",
      "staff-token",
      "import-template",
      fetcher,
    );
    await createAdminContent(
      "https://api.example/v1",
      "staff-token",
      "import-batches/preview",
      { csvText: template, fileName: "seed.csv" },
      fetcher,
    );
    await createAdminContent(
      "https://api.example/v1",
      "staff-token",
      "import-batches/batch-id/commit",
      {},
      fetcher,
    );
    assert.equal(template, "source_asset_id,observed_character");
    assert.deepEqual(requests, [
      {
        method: "GET",
        url: "https://api.example/v1/admin/content/import-template",
      },
      {
        method: "POST",
        url: "https://api.example/v1/admin/content/import-batches/preview",
      },
      {
        method: "POST",
        url: "https://api.example/v1/admin/content/import-batches/batch-id/commit",
      },
    ]);
  });

  it("lists and updates feedback through the staff-only boundary", async () => {
    const requests: Array<{ method: string; url: string }> = [];
    const fetcher: typeof fetch = async (input, init) => {
      requests.push({ method: init?.method ?? "GET", url: String(input) });
      return Response.json(init?.method === "PATCH" ? {} : []);
    };
    await getAdminFeedback("https://api.example/v1", "staff-token", fetcher);
    await updateAdminFeedback(
      "https://api.example/v1",
      "staff-token",
      "feedback-id",
      { assignedTo: "editor@example.com", status: "IN_PROGRESS" },
      fetcher,
    );
    assert.deepEqual(requests, [
      { method: "GET", url: "https://api.example/v1/admin/feedback" },
      {
        method: "PATCH",
        url: "https://api.example/v1/admin/feedback/feedback-id",
      },
    ]);
  });

  it("loads teacher samples, records a review and reads the funnel", async () => {
    const requests: Array<{ body: string; method: string; url: string }> = [];
    const fetcher: typeof fetch = async (input, init) => {
      requests.push({
        body: String(init?.body ?? ""),
        method: init?.method ?? "GET",
        url: String(input),
      });
      return Response.json(
        init?.method === "PATCH" ? { status: "REVIEWED" } : [],
      );
    };
    await getAdminAdviceSamples(
      "https://api.example/v1",
      "staff-token",
      "UNREVIEWED",
      fetcher,
    );
    await reviewAdminAdvice(
      "https://api.example/v1",
      "staff-token",
      "attempt-id",
      { comment: "证据与动作一致。", verdict: "APPROVED" },
      fetcher,
    );
    await getAdminFunnel("https://api.example/v1", "staff-token", fetcher);
    assert.deepEqual(
      requests.map(({ method, url }) => ({ method, url })),
      [
        {
          method: "GET",
          url: "https://api.example/v1/admin/advice-reviews?status=UNREVIEWED&limit=20",
        },
        {
          method: "PATCH",
          url: "https://api.example/v1/admin/advice-reviews/attempt-id",
        },
        {
          method: "GET",
          url: "https://api.example/v1/admin/analytics/funnel",
        },
      ],
    );
    assert.equal(JSON.parse(requests[1]?.body ?? "{}").verdict, "APPROVED");
  });
});

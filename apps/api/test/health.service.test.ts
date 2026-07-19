import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { HealthService } from "../src/health/health.service.js";

describe("HealthService", () => {
  it("returns a stable service status", () => {
    const service = new HealthService();
    const now = new Date("2026-07-18T00:00:00.000Z");

    assert.deepEqual(service.getStatus(now), {
      service: "api",
      status: "ok",
      timestamp: "2026-07-18T00:00:00.000Z",
    });
  });
});

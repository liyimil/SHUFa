import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { getWorkerStatus } from "../src/index.js";

describe("worker status", () => {
  it("is idle before queue integration", () => {
    assert.deepEqual(getWorkerStatus(), { service: "worker", status: "idle" });
  });
});

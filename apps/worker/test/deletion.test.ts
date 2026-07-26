import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  processArtworkDeletion,
  reportArtworkDeletionFailure,
} from "../src/deletion.js";

const job = {
  artworkId: "d450b9ee-0b7c-4b8f-b9c6-377dcd2bc1bb",
  attemptNumber: 2,
  deletionId: "73028998-55d5-4d02-856d-302c8683889a",
  objectKey: "users/test/artworks/practice/original.jpg",
};

describe("artwork deletion worker", () => {
  it("deletes the private object before reporting completion", async () => {
    const actions: string[] = [];
    let callbackBody: Record<string, unknown> | null = null;
    await processArtworkDeletion(job, {
      apiBaseUrl: "http://api:3001",
      deletePrivateObject: (objectKey) => {
        actions.push(`delete:${objectKey}`);
        return Promise.resolve();
      },
      fetcher: async (input, init) => {
        actions.push(`callback:${String(input)}`);
        callbackBody = JSON.parse(String(init?.body));
        assert.equal(
          new Headers(init?.headers).get("x-internal-token"),
          "worker-token",
        );
        assert.equal(
          new Headers(init?.headers).get("x-request-id"),
          job.deletionId,
        );
        return new Response("{}", { status: 201 });
      },
      internalToken: "worker-token",
    });

    assert.match(actions[0] ?? "", /^delete:/);
    assert.match(actions[1] ?? "", /\/complete$/);
    assert.deepEqual(callbackBody, {
      attemptNumber: 2,
      objectKey: job.objectKey,
    });
  });

  it("reports a bounded terminal failure for the same retry generation", async () => {
    let callbackBody: Record<string, unknown> | null = null;
    await reportArtworkDeletionFailure(
      job,
      {
        apiBaseUrl: "http://api:3001",
        fetcher: async (_input, init) => {
          callbackBody = JSON.parse(String(init?.body));
          assert.equal(
            new Headers(init?.headers).get("x-request-id"),
            job.deletionId,
          );
          return new Response("{}", { status: 201 });
        },
        internalToken: "worker-token",
      },
      new Error("object storage unavailable"),
    );

    assert.deepEqual(callbackBody, {
      attemptNumber: 2,
      failureCode: "ARTWORK_PHYSICAL_DELETION_FAILED",
      failureMessage: "object storage unavailable",
      objectKey: job.objectKey,
    });
  });

  it("does not send signed URLs in a terminal failure callback", async () => {
    let callbackBody: Record<string, unknown> | null = null;
    await reportArtworkDeletionFailure(
      job,
      {
        apiBaseUrl: "http://api:3001",
        fetcher: async (_input, init) => {
          callbackBody = JSON.parse(String(init?.body));
          return new Response("{}", { status: 201 });
        },
        internalToken: "worker-token",
      },
      new Error(
        "DELETE https://storage.example/private.jpg?X-Amz-Signature=top-secret failed",
      ),
    );

    const serialized = JSON.stringify(callbackBody);
    assert.doesNotMatch(serialized, /storage\.example|top-secret|Signature/);
    assert.match(serialized, /redacted-url/);
  });
});

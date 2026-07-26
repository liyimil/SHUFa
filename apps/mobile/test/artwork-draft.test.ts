import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  clearArtworkDraft,
  type ArtworkDraftStore,
  markArtworkDraftSubmitted,
  restoreArtworkDraft,
  saveArtworkDraft,
  updateArtworkDraft,
} from "../src/artwork-draft";

class MemoryDraftStore implements ArtworkDraftStore {
  clearCount = 0;
  files = new Map<string, number>();
  metadata: string | null = null;
  readonly root = "file:///documents/calligraphy-artwork-draft-v1/";
  sourceSize = 1_024;

  async clear(): Promise<void> {
    this.clearCount += 1;
    this.files.clear();
    this.metadata = null;
  }

  async copyImage(
    _sourceUri: string,
    fileName: string,
  ): Promise<{ size: number; uri: string }> {
    const uri = `${this.root}${fileName}`;
    this.files.set(uri, this.sourceSize);
    return { size: this.sourceSize, uri };
  }

  async deleteImage(uri: string): Promise<void> {
    this.files.delete(uri);
  }

  async getImageSize(uri: string): Promise<number | null> {
    return this.files.get(uri) ?? null;
  }

  isOwnedImage(uri: string): boolean {
    return uri.startsWith(this.root) && !uri.endsWith("metadata.json");
  }

  async readMetadata(): Promise<string | null> {
    return this.metadata;
  }

  async writeMetadata(value: string): Promise<void> {
    this.metadata = value;
  }
}

function selectedInput(uploadRequestId = "mobile-request-1") {
  return {
    fileSize: null,
    height: 1_200,
    mimeType: "image/jpeg",
    uploadRequestId,
    uri: "file:///picker/cropped.jpg",
    width: 1_200,
  };
}

describe("mobile artwork draft", () => {
  it("copies a cropped image to durable storage and restores its retry identity", async () => {
    const store = new MemoryDraftStore();
    const saved = await saveArtworkDraft(store, selectedInput());

    assert.equal(saved.fileSize, 1_024);
    assert.match(saved.uri, /calligraphy-artwork-draft-v1/);
    assert.equal(
      (await restoreArtworkDraft(store))?.uploadRequestId,
      "mobile-request-1",
    );
  });

  it("replaces the previous image only after the new draft is saved", async () => {
    const store = new MemoryDraftStore();
    const first = await saveArtworkDraft(store, selectedInput("request-one"));
    const second = await saveArtworkDraft(store, selectedInput("request-two"));

    assert.equal(store.files.has(first.uri), false);
    assert.equal(store.files.has(second.uri), true);
    assert.equal(
      (await restoreArtworkDraft(store))?.uploadRequestId,
      "request-two",
    );
  });

  it("persists a renewed request id after a cancelled upload", async () => {
    const store = new MemoryDraftStore();
    const saved = await saveArtworkDraft(store, selectedInput());
    await updateArtworkDraft(store, {
      ...saved,
      uploadRequestId: "mobile-retry-2",
    });

    assert.equal(
      (await restoreArtworkDraft(store))?.uploadRequestId,
      "mobile-retry-2",
    );
  });

  it("clears corrupt, missing, and already submitted drafts instead of restoring them", async () => {
    const corruptStore = new MemoryDraftStore();
    corruptStore.metadata = '{"version":1,"uri":"file:///outside.jpg"}';
    assert.equal(await restoreArtworkDraft(corruptStore), null);
    assert.equal(corruptStore.clearCount, 1);

    const missingStore = new MemoryDraftStore();
    const missing = await saveArtworkDraft(missingStore, selectedInput());
    missingStore.files.delete(missing.uri);
    assert.equal(await restoreArtworkDraft(missingStore), null);
    assert.equal(missingStore.clearCount, 1);

    const submittedStore = new MemoryDraftStore();
    const submitted = await saveArtworkDraft(submittedStore, selectedInput());
    await markArtworkDraftSubmitted(submittedStore, submitted);
    assert.equal(await restoreArtworkDraft(submittedStore), null);
    assert.equal(submittedStore.clearCount, 1);
  });

  it("supports an explicit local discard", async () => {
    const store = new MemoryDraftStore();
    await saveArtworkDraft(store, selectedInput());
    await clearArtworkDraft(store);

    assert.equal(await restoreArtworkDraft(store), null);
    assert.equal(store.files.size, 0);
  });
});

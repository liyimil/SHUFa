import { Directory, File, Paths } from "expo-file-system";

import type { ArtworkDraftStore } from "./artwork-draft";

const directoryName = "calligraphy-artwork-draft-v1";
const metadataName = "metadata.json";

function draftDirectory(): Directory {
  return new Directory(Paths.document, directoryName);
}

function ensureDirectory(): Directory {
  const directory = draftDirectory();
  directory.create({ idempotent: true, intermediates: true });
  return directory;
}

function metadataFile(directory = draftDirectory()): File {
  return new File(directory, metadataName);
}

export function createExpoArtworkDraftStore(): ArtworkDraftStore {
  return {
    async clear() {
      const directory = draftDirectory();
      if (directory.exists) directory.delete();
    },
    async copyImage(sourceUri, fileName) {
      const directory = ensureDirectory();
      const source = new File(sourceUri);
      if (!source.exists) throw new Error("无法读取所选图片，请重新选择。");
      const destination = new File(directory, fileName);
      await source.copy(destination, { overwrite: true });
      return { size: destination.size, uri: destination.uri };
    },
    async deleteImage(uri) {
      if (!this.isOwnedImage(uri)) return;
      const file = new File(uri);
      if (file.exists) file.delete();
    },
    async getImageSize(uri) {
      if (!this.isOwnedImage(uri)) return null;
      const file = new File(uri);
      return file.exists ? file.size : null;
    },
    isOwnedImage(uri) {
      try {
        const file = new File(uri);
        return (
          file.parentDirectory.uri === draftDirectory().uri &&
          /^draft-[A-Za-z0-9_-]{1,200}\.(?:jpg|png|webp)$/.test(file.name)
        );
      } catch {
        return false;
      }
    },
    async readMetadata() {
      const file = metadataFile();
      return file.exists ? file.text() : null;
    },
    async writeMetadata(value) {
      const file = metadataFile(ensureDirectory());
      if (!file.exists) file.create();
      file.write(value);
    },
  };
}

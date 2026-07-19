import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Injectable } from "@nestjs/common";

export const OBJECT_STORAGE = Symbol("OBJECT_STORAGE");

export interface StoredObjectMetadata {
  checksumSha256: string | null;
  contentLength: number;
  contentType: string | null;
}

export interface ObjectStorage {
  createDownloadUrl(input: {
    expiresInSeconds: number;
    objectKey: string;
  }): Promise<string>;
  createUploadUrl(input: {
    expiresInSeconds: number;
    mimeType: string;
    objectKey: string;
    metadata?: Record<string, string>;
  }): Promise<string>;
  headPrivateObject(objectKey: string): Promise<StoredObjectMetadata | null>;
  readPrivateObject(
    objectKey: string,
    maximumBytes: number,
  ): Promise<Uint8Array>;
  deletePrivateObject(objectKey: string): Promise<void>;
  deletePublicObject(objectKey: string): Promise<void>;
}

function createS3Client(): S3Client {
  const endpoint = process.env.S3_ENDPOINT;
  const accessKeyId = process.env.S3_ACCESS_KEY;
  const secretAccessKey = process.env.S3_SECRET_KEY;

  return new S3Client({
    credentials:
      accessKeyId && secretAccessKey
        ? {
            accessKeyId,
            secretAccessKey,
          }
        : undefined,
    endpoint,
    forcePathStyle: Boolean(endpoint),
    region: process.env.S3_REGION ?? "local",
  });
}

@Injectable()
export class S3ObjectStorage implements ObjectStorage {
  private readonly bucket =
    process.env.S3_BUCKET_PRIVATE ?? "calligraphy-private";
  private readonly publicBucket =
    process.env.S3_BUCKET_PUBLIC ?? "calligraphy-public";
  private readonly client = createS3Client();

  createUploadUrl(input: {
    expiresInSeconds: number;
    mimeType: string;
    objectKey: string;
    metadata?: Record<string, string>;
  }): Promise<string> {
    return getSignedUrl(
      this.client,
      new PutObjectCommand({
        Bucket: this.bucket,
        ContentType: input.mimeType,
        Key: input.objectKey,
        Metadata: input.metadata,
      }),
      { expiresIn: input.expiresInSeconds },
    );
  }

  createDownloadUrl(input: {
    expiresInSeconds: number;
    objectKey: string;
  }): Promise<string> {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.bucket, Key: input.objectKey }),
      { expiresIn: input.expiresInSeconds },
    );
  }

  async deletePrivateObject(objectKey: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: objectKey }),
    );
  }

  async deletePublicObject(objectKey: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.publicBucket, Key: objectKey }),
    );
  }

  async readPrivateObject(
    objectKey: string,
    maximumBytes: number,
  ): Promise<Uint8Array> {
    const response = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: objectKey,
        Range: `bytes=0-${maximumBytes}`,
      }),
    );
    if (!response.Body) {
      throw new Error("Private object has no response body.");
    }
    return response.Body.transformToByteArray();
  }

  async headPrivateObject(
    objectKey: string,
  ): Promise<StoredObjectMetadata | null> {
    try {
      const response = await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: objectKey }),
      );
      return {
        checksumSha256: response.Metadata?.sha256 ?? null,
        contentLength: response.ContentLength ?? 0,
        contentType: response.ContentType ?? null,
      };
    } catch (error: unknown) {
      const statusCode = (error as { $metadata?: { httpStatusCode?: number } })
        .$metadata?.httpStatusCode;
      if (statusCode === 404) {
        return null;
      }
      throw error;
    }
  }
}

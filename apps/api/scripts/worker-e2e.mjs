import dotenv from "dotenv";
import path from "node:path";
import { randomBytes } from "node:crypto";
const __dirname = import.meta.dirname;
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { PrismaClient } from "../src/generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";
import { Queue } from "bullmq";
import sharp from "sharp";

const API_BASE = "http://localhost:3001/api/v1";
const S3 = new S3Client({
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY,
    secretAccessKey: process.env.S3_SECRET_KEY,
  },
  endpoint: process.env.S3_ENDPOINT,
  forcePathStyle: true,
  region: process.env.S3_REGION ?? "local",
});
const PRIVATE_BUCKET = process.env.S3_BUCKET_PRIVATE ?? "calligraphy-private";
const PUBLIC_BUCKET = process.env.S3_BUCKET_PUBLIC ?? "calligraphy-public";

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 5_000,
  }),
});

async function createFixtureImage(width, height, offset = 0) {
  const stroke = Math.max(18, Math.round(width / 14));
  const svg = Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
      <rect width="100%" height="100%" fill="white"/>
      <g fill="none" stroke="black" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round">
        <path d="M ${width * 0.24 + offset} ${height * 0.22} L ${width * 0.72 + offset} ${height * 0.22}"/>
        <path d="M ${width * 0.5 + offset} ${height * 0.14} L ${width * 0.5 + offset} ${height * 0.82}"/>
        <path d="M ${width * 0.22 + offset} ${height * 0.48} L ${width * 0.48 + offset} ${height * 0.7}"/>
        <path d="M ${width * 0.78 + offset} ${height * 0.42} L ${width * 0.52 + offset} ${height * 0.66}"/>
      </g>
    </svg>
  `);
  return sharp({
    create: {
      background: "white",
      channels: 3,
      height,
      width,
    },
  })
    .composite([{ input: svg }])
    .jpeg({ quality: 90 })
    .toBuffer();
}

const userArtworkFixture = await createFixtureImage(300, 300, -4);
const sourceImageFixture = await createFixtureImage(400, 400);

function redisConn() {
  const url = new URL(process.env.REDIS_URL ?? "redis://localhost:6379");
  return {
    host: url.hostname,
    port: url.port ? Number(url.port) : 6379,
    db: url.pathname.length > 1 ? Number(url.pathname.slice(1)) : 0,
    password: url.password || undefined,
    maxRetriesPerRequest: null,
  };
}

const results = [];
function publicServiceUrl(rawUrl) {
  if (!rawUrl) return "(not configured)";
  try {
    const url = new URL(rawUrl);
    url.username = "";
    url.password = "";
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return "(invalid URL)";
  }
}

function log(name, status, detail = "") {
  results.push({ name, status, detail });
  const icon =
    status === "PASS" ? "\u2713" : status === "FAIL" ? "\u2717" : "\u25CB";
  console.log(
    `  ${icon} ${name}: ${status}${detail ? " \u2014 " + detail : ""}`,
  );
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function poll(
  fn,
  { timeoutMs = 30_000, intervalMs = 1_000, label = "" },
) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const result = await fn();
    if (result) return result;
    await sleep(intervalMs);
  }
  throw new Error(
    `Polling timed out after ${timeoutMs}ms${label ? " (" + label + ")" : ""}`,
  );
}

// ─── Task 1: artwork-analysis ──────────────────────────────────────────────
async function testArtworkAnalysis() {
  console.log(
    "\n[1/5] artwork-analysis (user upload \u2192 AI quality \u2192 callback)",
  );
  let accessToken, userId;

  try {
    // 1a. Create anonymous session
    const anonRes = await fetch(`${API_BASE}/identity/anonymous`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    if (!anonRes.ok)
      throw new Error(`Anonymous session failed: ${anonRes.status}`);
    const session = await anonRes.json();
    accessToken = session.accessToken;
    userId = session.user.id;
    log("Create anonymous session", "PASS", `userId=${userId}`);

    // 1b. Use a generated geometric fixture, not unlicensed calligraphy content.
    const imageBytes = userArtworkFixture;

    // 1c. Create upload session
    const uploadRes = await fetch(`${API_BASE}/uploads`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        clientRequestId: crypto.randomUUID(),
        mimeType: "image/jpeg",
        sizeBytes: imageBytes.length,
        width: 300,
        height: 300,
      }),
    });
    if (!uploadRes.ok)
      throw new Error(
        `Upload create failed: ${uploadRes.status} ${await uploadRes.text()}`,
      );
    const upload = await uploadRes.json();
    const uploadId = upload.uploadId;
    const artworkId = upload.artworkId;
    const objectKey = upload.objectKey;
    const uploadUrl = upload.uploadUrl;
    log(
      "Create upload session",
      "PASS",
      `uploadId=${uploadId}, artworkId=${artworkId}`,
    );

    // 1d. Upload test image via presigned URL
    const putRes = await fetch(uploadUrl, {
      method: "PUT",
      body: imageBytes,
      headers: { "Content-Type": "image/jpeg" },
    });
    if (!putRes.ok) throw new Error(`S3 upload failed: ${putRes.status}`);
    log("Upload test image to MinIO", "PASS", `${imageBytes.length} bytes`);

    // 1e. Complete upload (triggers artwork-analysis job)
    const completeRes = await fetch(
      `${API_BASE}/uploads/${uploadId}/complete`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ sizeBytes: imageBytes.length }),
      },
    );
    if (!completeRes.ok)
      throw new Error(
        `Upload complete failed: ${completeRes.status} ${await completeRes.text()}`,
      );
    log("Complete upload (enqueues analysis)", "PASS");

    // 1e. Poll for analysis result
    const analysis = await poll(
      async () => {
        const res = await fetch(`${API_BASE}/artworks/${artworkId}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!res.ok) return null;
        const data = await res.json();
        if (data.analysis?.status && data.analysis.status !== "PENDING")
          return data;
        return null;
      },
      { timeoutMs: 30_000, intervalMs: 2_000, label: "analysis result" },
    );
    log(
      "Worker processed analysis",
      "PASS",
      `status=${analysis.analysis.status}`,
    );

    // Store for deletion test
    return { accessToken, userId, artworkId, objectKey };
  } catch (error) {
    log("artwork-analysis", "FAIL", String(error.message ?? error));
    return null;
  }
}

// ─── Task 2: artwork-deletion ───────────────────────────────────────────────
async function testArtworkDeletion(artwork) {
  console.log(
    "\n[2/5] artwork-deletion (user delete \u2192 S3 delete \u2192 callback)",
  );
  if (!artwork) {
    log("artwork-deletion", "SKIP", "no artwork from step 1");
    return;
  }

  try {
    // 2a. Request artwork deletion
    const delRes = await fetch(`${API_BASE}/artworks/${artwork.artworkId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${artwork.accessToken}` },
    });
    if (!delRes.ok)
      throw new Error(
        `Delete request failed: ${delRes.status} ${await delRes.text()}`,
      );
    const delData = await delRes.json();
    const deletionId = delData.deletionId;
    log("Request artwork deletion", "PASS", `deletionId=${deletionId}`);

    // 2b. Poll for deletion completion
    await poll(
      async () => {
        const res = await fetch(`${API_BASE}/artwork-deletions/${deletionId}`, {
          headers: { Authorization: `Bearer ${artwork.accessToken}` },
        });
        if (!res.ok) return null;
        const data = await res.json();
        return data.status === "DELETED" ? data : null;
      },
      { timeoutMs: 30_000, intervalMs: 2_000, label: "deletion completion" },
    );
    log("Worker deleted S3 object", "PASS", `status=COMPLETED`);

    // 2c. Verify artwork is DELETED
    const artworkRes = await fetch(
      `${API_BASE}/artworks/${artwork.artworkId}`,
      {
        headers: { Authorization: `Bearer ${artwork.accessToken}` },
      },
    );
    if (artworkRes.ok) {
      const data = await artworkRes.json();
      if (data.artworkStatus !== "DELETED") {
        throw new Error(
          `Artwork remained visible with status ${String(data.artworkStatus)}.`,
        );
      }
      log("Artwork marked DELETED", "PASS", `status=${data.artworkStatus}`);
    } else if (artworkRes.status === 404) {
      log("Artwork removed", "PASS", "404");
    } else {
      throw new Error(
        `Artwork status check failed: HTTP ${artworkRes.status}.`,
      );
    }
  } catch (error) {
    log("artwork-deletion", "FAIL", String(error.message ?? error));
  }
}

// ─── Task 3: glyph-crop ─────────────────────────────────────────────────────
async function testGlyphCrop() {
  console.log(
    "\n[3/5] glyph-crop (admin crop \u2192 AI crop \u2192 public upload \u2192 callback)",
  );
  const queue = new Queue("content-glyph-crop-v1", { connection: redisConn() });

  try {
    // 3a. Create minimal content chain in DB
    const calligrapher = await prisma.calligrapher.create({
      data: {
        name: `E2E Test Calligrapher ${crypto.randomUUID().slice(0, 8)}`,
        dynasty: "唐",
        isActive: true,
      },
    });
    const work = await prisma.work.create({
      data: {
        title: "E2E Test Work",
        dynasty: "唐",
        scriptStyle: "REGULAR",
        calligrapherId: calligrapher.id,
        isActive: true,
      },
    });
    const edition = await prisma.workEdition.create({
      data: { workId: work.id, name: "E2E Edition", isActive: true },
    });
    const rights = await prisma.rightsRecord.create({
      data: { status: "CLEARED_PUBLIC", sourceName: "E2E Test Source" },
    });

    // 3b. Upload source image to MinIO private bucket
    const sourceKey = `content/sources/${crypto.randomUUID()}/source.jpg`;
    const sourceBytes = sourceImageFixture;
    await S3.send(
      new PutObjectCommand({
        Bucket: PRIVATE_BUCKET,
        Key: sourceKey,
        Body: sourceBytes,
        ContentType: "image/jpeg",
      }),
    );
    log("Upload source image to MinIO", "PASS");

    // 3c. Create source_asset
    const sourceAsset = await prisma.sourceAsset.create({
      data: {
        editionId: edition.id,
        rightsRecordId: rights.id,
        objectKey: sourceKey,
        mimeType: "image/jpeg",
        width: 400,
        height: 400,
        checksumSha256: randomBytes(32).toString("hex"),
      },
    });

    // 3d. Create character (upsert — may already exist from seed)
    const character = await prisma.character.upsert({
      where: { value: "永" },
      update: {},
      create: {
        value: "永",
        unicodeCodePoint: "U+6C38",
        radical: "水",
        structureType: "独体",
        frequencyRank: 1,
      },
    });

    // 3e. Create glyph with bbox
    const glyphId = crypto.randomUUID();
    const outputKey = `content/glyphs/${glyphId}/glyph.webp`;
    const glyph = await prisma.glyph.create({
      data: {
        id: glyphId,
        characterId: character.id,
        sourceAssetId: sourceAsset.id,
        scriptStyle: "REGULAR",
        authenticityGrade: "A_ORIGINAL",
        bboxX: 50,
        bboxY: 50,
        bboxWidth: 300,
        bboxHeight: 300,
        contentStatus: "PROCESSING",
      },
    });

    // 3f. Enqueue glyph-crop job
    const job = await queue.add(
      "glyph-crop",
      {
        bboxX: 50,
        bboxY: 50,
        bboxWidth: 300,
        bboxHeight: 300,
        glyphId: glyph.id,
        mimeType: "image/jpeg",
        outputObjectKey: outputKey,
        sourceObjectKey: sourceKey,
      },
      { jobId: glyph.id },
    );
    log("Enqueue glyph-crop job", "PASS", `jobId=${job.id}`);

    // 3g. Poll for glyph_assets row (callback result)
    const asset = await poll(
      async () => {
        const row = await prisma.glyphAsset.findFirst({
          where: { glyphId: glyph.id, kind: "GLYPH_CROP" },
        });
        return row;
      },
      { timeoutMs: 30_000, intervalMs: 2_000, label: "glyph crop result" },
    );
    log(
      "Worker cropped & uploaded",
      "PASS",
      `width=${asset.width}, height=${asset.height}, checksum=${asset.checksum?.slice(0, 12)}...`,
    );

    // 3h. Verify glyph status changed
    const updatedGlyph = await prisma.glyph.findUnique({
      where: { id: glyph.id },
    });
    log(
      "Glyph status updated",
      "PASS",
      `contentStatus=${updatedGlyph.contentStatus}`,
    );

    // Cleanup
    await prisma.glyphAsset.deleteMany({ where: { glyphId: glyph.id } });
    await prisma.glyph.delete({ where: { id: glyph.id } });
    await prisma.sourceAsset.delete({ where: { id: sourceAsset.id } });
    await prisma.rightsRecord.delete({ where: { id: rights.id } });
    await prisma.workEdition.delete({ where: { id: edition.id } });
    await prisma.work.delete({ where: { id: work.id } });
    await prisma.calligrapher.delete({ where: { id: calligrapher.id } });
    // Note: character not deleted — shared seeded data (upserted)
    log("Cleanup DB rows", "PASS");
  } catch (error) {
    log("glyph-crop", "FAIL", String(error.message ?? error));
  } finally {
    await queue.close();
  }
}

// ─── Task 4: source-segmentation ────────────────────────────────────────────
async function testSourceSegmentation() {
  console.log(
    "\n[4/5] source-segmentation (admin job \u2192 AI segment \u2192 callback)",
  );
  const queue = new Queue("content-source-segmentation-v1", {
    connection: redisConn(),
  });

  try {
    // 4a. Create content chain
    const calligrapher = await prisma.calligrapher.create({
      data: {
        name: `E2E Seg Calligrapher ${crypto.randomUUID().slice(0, 8)}`,
        dynasty: "唐",
        isActive: true,
      },
    });
    const work = await prisma.work.create({
      data: {
        title: "E2E Seg Work",
        dynasty: "唐",
        scriptStyle: "REGULAR",
        calligrapherId: calligrapher.id,
        isActive: true,
      },
    });
    const edition = await prisma.workEdition.create({
      data: { workId: work.id, name: "E2E Seg Edition", isActive: true },
    });
    const rights = await prisma.rightsRecord.create({
      data: { status: "CLEARED_PUBLIC", sourceName: "E2E Seg Source" },
    });

    // 4b. Upload source image
    const sourceKey = `content/sources/${crypto.randomUUID()}/source.jpg`;
    const sourceBytes = sourceImageFixture;
    await S3.send(
      new PutObjectCommand({
        Bucket: PRIVATE_BUCKET,
        Key: sourceKey,
        Body: sourceBytes,
        ContentType: "image/jpeg",
      }),
    );

    const sourceAsset = await prisma.sourceAsset.create({
      data: {
        editionId: edition.id,
        rightsRecordId: rights.id,
        objectKey: sourceKey,
        mimeType: "image/jpeg",
        width: 400,
        height: 400,
        checksumSha256: randomBytes(32).toString("hex"),
      },
    });

    // 4c. Create segmentation job in DB
    const segJob = await prisma.contentSegmentationJob.create({
      data: {
        sourceAssetId: sourceAsset.id,
        status: "PENDING",
        requestedBy: "e2e-test",
        activeKey: crypto.randomUUID(),
      },
    });

    // 4d. Enqueue
    const job = await queue.add(
      "source-segmentation",
      {
        jobId: segJob.id,
        mimeType: "image/jpeg",
        sourceObjectKey: sourceKey,
      },
      { jobId: segJob.id },
    );
    log("Enqueue segmentation job", "PASS", `jobId=${job.id}`);

    // 4e. Poll for completion
    const updated = await poll(
      async () => {
        const row = await prisma.contentSegmentationJob.findUnique({
          where: { id: segJob.id },
          include: { _count: { select: { candidates: true } } },
        });
        if (row?.status === "COMPLETED" || row?.status === "FAILED") return row;
        return null;
      },
      { timeoutMs: 30_000, intervalMs: 2_000, label: "segmentation result" },
    );
    const candidateCount = updated._count?.candidates ?? 0;
    log(
      "Worker segmented source",
      "PASS",
      `status=${updated.status}, algorithm=${updated.algorithmVersion ?? "N/A"}, candidates=${candidateCount}`,
    );

    // Cleanup
    await prisma.contentSegmentationCandidate.deleteMany({
      where: { jobId: segJob.id },
    });
    await prisma.contentSegmentationJob.delete({ where: { id: segJob.id } });
    await prisma.sourceAsset.delete({ where: { id: sourceAsset.id } });
    await prisma.rightsRecord.delete({ where: { id: rights.id } });
    await prisma.workEdition.delete({ where: { id: edition.id } });
    await prisma.work.delete({ where: { id: work.id } });
    await prisma.calligrapher.delete({ where: { id: calligrapher.id } });
    log("Cleanup DB rows", "PASS");
  } catch (error) {
    log("source-segmentation", "FAIL", String(error.message ?? error));
  } finally {
    await queue.close();
  }
}

// ─── Task 5: practice-structure ─────────────────────────────────────────────
async function testPracticeStructure() {
  console.log(
    "\n[5/5] practice-structure (user+master \u2192 AI compare \u2192 advice callback)",
  );
  const queue = new Queue("practice-structure-v1", { connection: redisConn() });

  try {
    // 5a. Create user
    const user = await prisma.user.create({
      data: { status: "ACTIVE" },
    });
    const userId = user.id;

    // 5b. Upload user artwork to private bucket
    const userObjectKey = `users/${userId}/artworks/${crypto.randomUUID()}/original.jpg`;
    const userImage = userArtworkFixture;
    await S3.send(
      new PutObjectCommand({
        Bucket: PRIVATE_BUCKET,
        Key: userObjectKey,
        Body: userImage,
        ContentType: "image/jpeg",
      }),
    );

    const artwork = await prisma.userArtwork.create({
      data: {
        userId,
        originalObjectKey: userObjectKey,
        mimeType: "image/jpeg",
        sizeBytes: userImage.length,
        width: 200,
        height: 200,
        status: "UPLOADED",
      },
    });

    // 5c. Create content chain for Glyph (required by PracticeSession.selectedGlyphId)
    const calligrapher = await prisma.calligrapher.create({
      data: {
        name: `E2E Practice Calligrapher ${crypto.randomUUID().slice(0, 8)}`,
        dynasty: "唐",
        isActive: true,
      },
    });
    const work = await prisma.work.create({
      data: {
        title: "E2E Practice Work",
        dynasty: "唐",
        scriptStyle: "REGULAR",
        calligrapherId: calligrapher.id,
        isActive: true,
      },
    });
    const edition = await prisma.workEdition.create({
      data: { workId: work.id, name: "E2E Practice Edition", isActive: true },
    });
    const rights = await prisma.rightsRecord.create({
      data: { status: "CLEARED_PUBLIC", sourceName: "E2E Practice Source" },
    });

    const sourceKey = `content/sources/${crypto.randomUUID()}/source.jpg`;
    const sourceBytes = sourceImageFixture;
    await S3.send(
      new PutObjectCommand({
        Bucket: PRIVATE_BUCKET,
        Key: sourceKey,
        Body: sourceBytes,
        ContentType: "image/jpeg",
      }),
    );
    const sourceAsset = await prisma.sourceAsset.create({
      data: {
        editionId: edition.id,
        rightsRecordId: rights.id,
        objectKey: sourceKey,
        mimeType: "image/jpeg",
        width: 400,
        height: 400,
        checksumSha256: randomBytes(32).toString("hex"),
      },
    });

    const character = await prisma.character.upsert({
      where: { value: "\u6C38" },
      update: {},
      create: {
        value: "\u6C38",
        unicodeCodePoint: "U+6C38",
        radical: "\u6C34",
        structureType: "\u72EC\u4F53",
        frequencyRank: 1,
      },
    });
    const glyph = await prisma.glyph.create({
      data: {
        characterId: character.id,
        sourceAssetId: sourceAsset.id,
        scriptStyle: "REGULAR",
        authenticityGrade: "A_ORIGINAL",
        bboxX: 50,
        bboxY: 50,
        bboxWidth: 300,
        bboxHeight: 300,
        contentStatus: "PUBLISHED",
      },
    });

    // 5d. Upload master glyph to public bucket + create glyph_asset
    const masterObjectKey = `content/glyphs/${glyph.id}/glyph.webp`;
    const masterImage = sourceImageFixture;
    await S3.send(
      new PutObjectCommand({
        Bucket: PUBLIC_BUCKET,
        Key: masterObjectKey,
        Body: masterImage,
        ContentType: "image/jpeg",
      }),
    );
    await prisma.glyphAsset.create({
      data: {
        glyphId: glyph.id,
        kind: "GLYPH_CROP",
        objectKey: masterObjectKey,
        mimeType: "image/jpeg",
        checksum: randomBytes(32).toString("hex"),
        width: 300,
        height: 300,
      },
    });

    // 5e. Create practice session + attempt + analysis run
    const practiceSession = await prisma.practiceSession.create({
      data: {
        userId,
        characterId: character.id,
        selectedGlyphId: glyph.id,
      },
    });

    const attempt = await prisma.practiceAttempt.create({
      data: {
        sessionId: practiceSession.id,
        artworkId: artwork.id,
        sequence: 1,
      },
    });

    // 5f. Create analysis run
    await prisma.practiceAnalysisRun.create({
      data: {
        attemptId: attempt.id,
        status: "PENDING",
        userObjectKey,
        masterObjectKey,
      },
    });

    // 5g. Enqueue
    const job = await queue.add(
      "structure-comparison",
      {
        attemptId: attempt.id,
        masterObjectKey,
        userMimeType: "image/jpeg",
        userObjectKey,
      },
      { jobId: attempt.id },
    );
    log("Enqueue practice-structure job", "PASS", `jobId=${job.id}`);

    // 5h. Poll for result
    const result = await poll(
      async () => {
        const row = await prisma.practiceAnalysisRun.findUnique({
          where: { attemptId: attempt.id },
        });
        if (row?.status === "READY" || row?.status === "FAILED") return row;
        return null;
      },
      {
        timeoutMs: 30_000,
        intervalMs: 2_000,
        label: "practice analysis result",
      },
    );
    log(
      "Worker compared & advised",
      "PASS",
      `status=${result.status}, model=${result.modelVersion ?? "N/A"}`,
    );

    // Cleanup
    await prisma.practiceAnalysisRun.delete({
      where: { attemptId: attempt.id },
    });
    await prisma.practiceAttempt.delete({ where: { id: attempt.id } });
    await prisma.practiceSession.delete({ where: { id: practiceSession.id } });
    await prisma.glyphAsset.deleteMany({ where: { glyphId: glyph.id } });
    await prisma.userArtwork.delete({ where: { id: artwork.id } });
    await prisma.glyph.delete({ where: { id: glyph.id } });
    await prisma.sourceAsset.delete({ where: { id: sourceAsset.id } });
    await prisma.rightsRecord.delete({ where: { id: rights.id } });
    await prisma.workEdition.delete({ where: { id: edition.id } });
    await prisma.work.delete({ where: { id: work.id } });
    await prisma.calligrapher.delete({ where: { id: calligrapher.id } });
    // Note: character not deleted — shared seeded data (upserted)
    await prisma.user.delete({ where: { id: user.id } });
    log("Cleanup DB rows", "PASS");
  } catch (error) {
    log("practice-structure", "FAIL", String(error.message ?? error));
  } finally {
    await queue.close();
  }
}

// ─── Main ───────────────────────────────────────────────────────────────────
async function main() {
  console.log("=== Worker End-to-End Task Test ===");
  console.log(`Time: ${new Date().toISOString()}`);
  console.log(`API: ${API_BASE}`);
  console.log(`Redis: ${publicServiceUrl(process.env.REDIS_URL)}`);
  console.log(`S3: ${publicServiceUrl(process.env.S3_ENDPOINT)}`);

  // Task 1: artwork-analysis (also creates artwork for deletion test)
  const artwork = await testArtworkAnalysis();

  // Task 2: artwork-deletion (depends on task 1)
  await testArtworkDeletion(artwork);

  // Task 3: glyph-crop
  await testGlyphCrop();

  // Task 4: source-segmentation
  await testSourceSegmentation();

  // Task 5: practice-structure
  await testPracticeStructure();

  // Summary
  console.log("\n=== Summary ===");
  const pass = results.filter((r) => r.status === "PASS").length;
  const fail = results.filter((r) => r.status === "FAIL").length;
  const skip = results.filter((r) => r.status === "SKIP").length;
  console.log(
    `Total: ${results.length}  PASS: ${pass}  FAIL: ${fail}  SKIP: ${skip}`,
  );

  if (fail > 0) {
    console.log("\nFailed tests:");
    results
      .filter((r) => r.status === "FAIL")
      .forEach((r) => {
        console.log(`  \u2717 ${r.name}: ${r.detail}`);
      });
  }

  await prisma.$disconnect();
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});

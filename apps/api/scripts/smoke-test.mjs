import dotenv from "dotenv";
import path from "node:path";
const __dirname = import.meta.dirname;
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });
import net from "node:net";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { PrismaClient } from "../src/generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";
import { Queue } from "bullmq";

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

function logTest(name, status, detail = "") {
  const entry = { name, status, detail };
  results.push(entry);
  const icon =
    status === "PASS" ? "\u2713" : status === "FAIL" ? "\u2717" : "\u25CB";
  console.log(
    `  ${icon} ${name}: ${status}${detail ? " \u2014 " + detail : ""}`,
  );
}

async function testPostgreSQL() {
  console.log("\n[1/5] PostgreSQL (port 15432)");
  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 5_000,
  });
  const prisma = new PrismaClient({ adapter });
  try {
    const tableCount = await prisma.$queryRaw`
      SELECT count(*)::int as count
      FROM information_schema.tables
      WHERE table_schema = 'public'
    `;
    const count = tableCount[0]?.count ?? 0;
    if (count > 0) {
      logTest("Connect to PostgreSQL", "PASS", `${count} tables found`);

      const userCount = await prisma.$queryRaw`
        SELECT count(*)::int as count FROM "users"
      `;
      logTest("Query users table", "PASS", `${userCount[0]?.count ?? 0} users`);

      const auditCount = await prisma.$queryRaw`
        SELECT count(*)::int as count FROM "user_consent_audits"
      `;
      logTest(
        "Query consent audits",
        "PASS",
        `${auditCount[0]?.count ?? 0} audit rows`,
      );
    } else {
      logTest("Connect to PostgreSQL", "FAIL", "No tables found");
    }
  } catch (error) {
    logTest("Connect to PostgreSQL", "FAIL", String(error.message ?? error));
  } finally {
    await prisma.$disconnect();
  }
}

function testRedisRaw() {
  console.log("\n[2/5] Redis (port 16379)");
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;
    const fail = (msg) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      logTest("Redis PING", "FAIL", msg);
      resolve();
    };
    const pass = (msg) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      logTest("Redis PING", "PASS", msg);
      resolve();
    };
    socket.setTimeout(5000);
    socket.on("timeout", () => fail("Connection timed out"));
    socket.on("error", (err) => fail(String(err.message ?? err)));
    socket.connect(16379, "localhost", () => {
      socket.write("*1\r\n$4\r\nPING\r\n");
    });
    socket.on("data", (data) => {
      const resp = data.toString().trim();
      if (resp === "+PONG") {
        pass("PONG received");
      } else {
        fail(`Unexpected response: ${resp}`);
      }
    });
  });
}

async function testBullMQQueue() {
  console.log("\n[3/5] BullMQ Queue (Redis-backed)");
  const connection = { host: "localhost", port: 16379 };
  let queue;
  try {
    queue = new Queue("smoke-queue", { connection });
    const job = await queue.add("smoke-job", { message: "test" });
    logTest("Enqueue job", "PASS", `jobId=${job.id}`);

    const counts = await queue.getJobCounts();
    logTest(
      "Get job counts",
      "PASS",
      `waiting=${counts.waiting} active=${counts.active} completed=${counts.completed}`,
    );

    await queue.drain();
    logTest("Drain queue", "PASS");
  } catch (error) {
    logTest("BullMQ queue", "FAIL", String(error.message ?? error));
  } finally {
    if (queue) await queue.close();
  }
}

async function testS3PrivateBucket() {
  console.log("\n[4/5] MinIO Private Bucket \u2014 presigned upload/download");
  const client = new S3Client({
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY,
      secretAccessKey: process.env.S3_SECRET_KEY,
    },
    endpoint: process.env.S3_ENDPOINT,
    forcePathStyle: true,
    region: process.env.S3_REGION ?? "local",
  });
  const bucket = process.env.S3_BUCKET_PRIVATE ?? "calligraphy-private";
  const testKey = "smoke-test/test-upload.txt";
  const testContent = "Hello from calligraphy smoke test!";

  try {
    // Generate presigned upload URL
    const uploadUrl = await getSignedUrl(
      client,
      new PutObjectCommand({
        Bucket: bucket,
        Key: testKey,
        ContentType: "text/plain",
        Metadata: { "smoke-test": "true" },
      }),
      { expiresIn: 60 },
    );
    logTest("Generate presigned upload URL", "PASS");

    // Upload via presigned URL
    const uploadRes = await fetch(uploadUrl, {
      method: "PUT",
      body: testContent,
      headers: { "Content-Type": "text/plain" },
    });
    if (!uploadRes.ok) {
      throw new Error(
        `Upload failed: ${uploadRes.status} ${await uploadRes.text()}`,
      );
    }
    logTest(
      "Upload via presigned URL",
      "PASS",
      `${testContent.length} bytes uploaded`,
    );

    // HEAD object
    const headRes = await client.send(
      new HeadObjectCommand({ Bucket: bucket, Key: testKey }),
    );
    logTest(
      "HEAD object",
      "PASS",
      `contentLength=${headRes.ContentLength}, contentType=${headRes.ContentType}`,
    );

    // Generate presigned download URL
    const downloadUrl = await getSignedUrl(
      client,
      new GetObjectCommand({ Bucket: bucket, Key: testKey }),
      { expiresIn: 60 },
    );
    logTest("Generate presigned download URL", "PASS");

    // Download via presigned URL
    const downloadRes = await fetch(downloadUrl);
    if (!downloadRes.ok) {
      throw new Error(`Download failed: ${downloadRes.status}`);
    }
    const downloadedContent = await downloadRes.text();
    if (downloadedContent === testContent) {
      logTest("Download & verify content", "PASS", "content matches");
    } else {
      logTest("Download & verify content", "FAIL", "content mismatch");
    }

    // Verify anonymous access is denied (private bucket)
    const anonRes = await fetch(
      `${process.env.S3_ENDPOINT}/${bucket}/${testKey}`,
    );
    if (anonRes.status === 403) {
      logTest("Anonymous access denied (private)", "PASS");
    } else {
      logTest(
        "Anonymous access denied (private)",
        "FAIL",
        `unexpected status ${anonRes.status}`,
      );
    }

    // Cleanup
    await client.send(
      new DeleteObjectCommand({ Bucket: bucket, Key: testKey }),
    );
    logTest("Delete test object", "PASS");
  } catch (error) {
    logTest("S3 private bucket", "FAIL", String(error.message ?? error));
  }
}

async function testS3PublicBucket() {
  console.log("\n[5/5] MinIO Public Bucket \u2014 anonymous read access");
  const client = new S3Client({
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY,
      secretAccessKey: process.env.S3_SECRET_KEY,
    },
    endpoint: process.env.S3_ENDPOINT,
    forcePathStyle: true,
    region: process.env.S3_REGION ?? "local",
  });
  const publicBucket = process.env.S3_BUCKET_PUBLIC ?? "calligraphy-public";
  const testKey = "smoke-test/public-test.txt";
  const testContent = "Public content for anonymous access test";

  try {
    // Upload directly via SDK (simulating worker upload)
    await client.send(
      new PutObjectCommand({
        Bucket: publicBucket,
        Key: testKey,
        Body: testContent,
        ContentType: "text/plain",
        CacheControl: "public, max-age=86400",
      }),
    );
    logTest("Upload to public bucket", "PASS");

    // Anonymous access should succeed (public read)
    const publicUrl = `${process.env.S3_ENDPOINT}/${publicBucket}/${testKey}`;
    const anonRes = await fetch(publicUrl);
    if (anonRes.ok) {
      const content = await anonRes.text();
      if (content === testContent) {
        logTest("Anonymous read (public bucket)", "PASS", "content matches");
      } else {
        logTest("Anonymous read (public bucket)", "FAIL", "content mismatch");
      }
    } else {
      logTest(
        "Anonymous read (public bucket)",
        "FAIL",
        `status ${anonRes.status}`,
      );
    }

    // Cleanup
    await client.send(
      new DeleteObjectCommand({ Bucket: publicBucket, Key: testKey }),
    );
    logTest("Delete public test object", "PASS");
  } catch (error) {
    logTest("S3 public bucket", "FAIL", String(error.message ?? error));
  }
}

async function main() {
  console.log("=== Calligraphy Cross-Service Smoke Test ===");
  console.log(`Time: ${new Date().toISOString()}`);
  console.log(`PG: ${publicServiceUrl(process.env.DATABASE_URL)}`);
  console.log(`Redis: ${publicServiceUrl(process.env.REDIS_URL)}`);
  console.log(
    `S3: ${process.env.S3_ENDPOINT} (private=${process.env.S3_BUCKET_PRIVATE}, public=${process.env.S3_BUCKET_PUBLIC})`,
  );

  await testPostgreSQL();
  await testRedisRaw();
  await testBullMQQueue();
  await testS3PrivateBucket();
  await testS3PublicBucket();

  console.log("\n=== Summary ===");
  const pass = results.filter((r) => r.status === "PASS").length;
  const fail = results.filter((r) => r.status === "FAIL").length;
  console.log(`Total: ${results.length}  PASS: ${pass}  FAIL: ${fail}`);

  if (fail > 0) {
    console.log("\nFailed tests:");
    results
      .filter((r) => r.status === "FAIL")
      .forEach((r) => {
        console.log(`  \u2717 ${r.name}: ${r.detail}`);
      });
    process.exit(1);
  } else {
    console.log("\nAll smoke tests passed!");
    process.exit(0);
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});

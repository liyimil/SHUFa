import { randomBytes, scryptSync } from "node:crypto";
import console from "node:console";
import process from "node:process";

const password = process.env.ADMIN_PASSWORD;
if (!password || password.length < 12) {
  console.error("Set ADMIN_PASSWORD to at least 12 characters.");
  process.exitCode = 1;
} else {
  const salt = randomBytes(16).toString("base64url");
  const digest = scryptSync(password, salt, 64).toString("base64url");
  console.log(`scrypt$${salt}$${digest}`);
}

import { existsSync } from "node:fs";
import process from "node:process";

const failures = [];

if (!existsSync(".env")) {
  failures.push("apps/api/.env is missing; create it from apps/api/.env.example.");
} else {
  try {
    process.loadEnvFile(".env");
  } catch {
    failures.push("apps/api/.env could not be read.");
  }
}

const adminToken = process.env.ADMIN_TOKEN?.trim() ?? "";
if (!adminToken || adminToken.startsWith("replace-with-")) {
  failures.push("ADMIN_TOKEN must be set to a non-empty local value.");
}

const signingKey = process.env.LINK_SIGNING_KEY ?? "";
if (
  signingKey.startsWith("replace-with-") ||
  new TextEncoder().encode(signingKey).byteLength < 32
) {
  failures.push(
    "LINK_SIGNING_KEY must be at least 32 bytes; generate a local key with `openssl rand -hex 32`."
  );
}

const webhookUrl = process.env.WEBHOOK_URL?.trim() ?? "";
try {
  const parsedWebhookUrl = new URL(webhookUrl);
  if (
    parsedWebhookUrl.protocol !== "https:" ||
    parsedWebhookUrl.username ||
    parsedWebhookUrl.password ||
    webhookUrl.startsWith("replace-with-")
  ) {
    failures.push("WEBHOOK_URL must be a configured HTTPS webhook URL.");
  }
} catch {
  failures.push("WEBHOOK_URL must be a configured HTTPS webhook URL.");
}

try {
  const origin = new URL(process.env.PUBLIC_APP_ORIGIN ?? "");
  if (
    !["https:", "http:"].includes(origin.protocol) ||
    origin.username ||
    origin.password ||
    origin.pathname !== "/" ||
    origin.search ||
    origin.hash
  ) {
    failures.push("PUBLIC_APP_ORIGIN must be an HTTP(S) origin without a path.");
  }
} catch {
  failures.push("PUBLIC_APP_ORIGIN must be a valid HTTP(S) origin.");
}

if (failures.length > 0) {
  console.error("API local startup validation failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exitCode = 1;
} else {
  console.info("API local configuration is valid.");
}
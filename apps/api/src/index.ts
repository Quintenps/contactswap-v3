import { Hono } from "hono";
import { routePath } from "hono/route";
import { renderVCard } from "./vcard";

const app = new Hono<{ Bindings: Env }>();

type OwnerProfile = {
  name: string;
  email: string;
  address: string;
  birthday: string;
};

type StoredOwnerProfile = OwnerProfile & { vcard: string };

const encoder = new TextEncoder();

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

async function hashGuestToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(token));
  return encodeBase64Url(new Uint8Array(digest));
}

async function signVCardLink(linkId: string, signingKey: string): Promise<string> {
  if (encoder.encode(signingKey).byteLength < 32) {
    throw new Error("LINK_SIGNING_KEY must contain at least 32 bytes.");
  }

  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(signingKey),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(`vcard:${linkId}`));
  return encodeBase64Url(new Uint8Array(signature));
}

function getPublicAppOrigin(value: string): URL {
  const origin = new URL(value);
  if (
    !["https:", "http:"].includes(origin.protocol) ||
    origin.username ||
    origin.password ||
    origin.pathname !== "/" ||
    origin.search ||
    origin.hash
  ) {
    throw new Error("PUBLIC_APP_ORIGIN must be an HTTP(S) origin.");
  }

  return origin;
}

function isValidBirthday(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number(value.slice(0, 4)) < 1) {
    return false;
  }

  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

function parseProfile(value: unknown): OwnerProfile | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }

  const fields = value as Record<string, unknown>;
  if (["name", "email", "address", "birthday"].some((field) => typeof fields[field] !== "string")) {
    return null;
  }

  const profile = {
    name: (fields.name as string).trim(),
    email: (fields.email as string).trim(),
    address: (fields.address as string).trim(),
    birthday: (fields.birthday as string).trim()
  };

  if (
    !profile.name ||
    !profile.address ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profile.email) ||
    !isValidBirthday(profile.birthday) ||
    Object.hasOwn(fields, "picture")
  ) {
    return null;
  }

  return profile;
}

app.use("/api/owner/*", async (context, next) => {
  context.header("Cache-Control", "no-store");
  const adminToken = context.env.ADMIN_TOKEN;
  if (!adminToken || context.req.header("Authorization") !== `Bearer ${adminToken}`) {
    return context.json(
      { error: { code: "unauthorized", message: "Admin authorization is required." } },
      401
    );
  }

  await next();
});

app.get("/api/health", (context) =>
  context.text("Hello, world!", 200, {
    "Cache-Control": "no-store",
    "Content-Type": "text/plain; charset=utf-8"
  })
);

app.get("/api/owner/profile", async (context) => {
  const profile = await context.env.DB.prepare(
    "SELECT name, email, address, birthday FROM owner_profile WHERE id = 1"
  ).first<OwnerProfile>();

  if (!profile) {
    return context.json(
      { error: { code: "profile_not_found", message: "No owner profile has been saved." } },
      404
    );
  }

  return context.json(profile);
});

app.put("/api/owner/profile", async (context) => {
  let input: unknown;
  try {
    input = await context.req.json();
  } catch {
    return context.json(
      { error: { code: "invalid_profile", message: "The profile request is invalid." } },
      400
    );
  }

  const profile = parseProfile(input);
  if (!profile) {
    return context.json(
      { error: { code: "invalid_profile", message: "The profile request is invalid." } },
      400
    );
  }

  const vcard = renderVCard(profile);
  await context.env.DB.prepare(
    `INSERT INTO owner_profile (id, name, email, address, birthday, vcard, updated_at)
     VALUES (1, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name,
       email = excluded.email,
       address = excluded.address,
       birthday = excluded.birthday,
       vcard = excluded.vcard,
       updated_at = excluded.updated_at`
  )
    .bind(
      profile.name,
      profile.email,
      profile.address,
      profile.birthday,
      vcard,
      new Date().toISOString()
    )
    .run();

  return context.json(profile);
});

app.get("/api/owner/profile/vcard", async (context) => {
  const profile = await context.env.DB.prepare(
    "SELECT vcard FROM owner_profile WHERE id = 1"
  ).first<Pick<StoredOwnerProfile, "vcard">>();

  if (!profile) {
    return context.json(
      { error: { code: "profile_not_found", message: "No owner profile has been saved." } },
      404
    );
  }

  context.header("Content-Type", "text/vcard; version=4.0; charset=utf-8");
  context.header("Content-Disposition", 'attachment; filename="contactswap-profile.vcf"');
  return context.body(profile.vcard);
});

app.post("/api/owner/links", async (context) => {
  const profile = await context.env.DB.prepare(
    "SELECT id FROM owner_profile WHERE id = 1"
  ).first<{ id: number }>();

  if (!profile) {
    return context.json(
      { error: { code: "profile_not_found", message: "No owner profile has been saved." } },
      404
    );
  }

  const publicAppOrigin = getPublicAppOrigin(context.env.PUBLIC_APP_ORIGIN);
  const linkId = crypto.randomUUID();
  const tokenBytes = crypto.getRandomValues(new Uint8Array(32));
  const guestToken = encodeBase64Url(tokenBytes);
  const tokenHash = await hashGuestToken(guestToken);
  const vcardSignature = await signVCardLink(linkId, context.env.LINK_SIGNING_KEY);

  await context.env.DB.prepare(
    `INSERT INTO guest_links (id, token_hash, vcard_signature, created_at)
     VALUES (?, ?, ?, ?)`
  )
    .bind(linkId, tokenHash, vcardSignature, new Date().toISOString())
    .run();

  const guestUrl = new URL(`/guest/${guestToken}`, publicAppOrigin).toString();
  return context.json({ guestUrl }, 201);
});

app.onError((error, context) => {
  const requestId = crypto.randomUUID();
  const stackFrames =
    error instanceof Error && error.stack
      ? error.stack
          .split("\n")
          .slice(1, 6)
          .map((frame) => frame.trim())
          .filter((frame) => frame.startsWith("at "))
      : [];

  console.error("Unhandled API exception", {
    event: "api.unhandled_exception",
    requestId,
    method: context.req.method,
    route: routePath(context) || "<unmatched>",
    errorName: error instanceof Error ? error.name : typeof error,
    stackFrames
  });

  context.header("Cache-Control", "no-store");
  context.header("X-Request-ID", requestId);
  return context.json(
    { error: { code: "internal_error", message: "An unexpected error occurred." } },
    500
  );
});

app.notFound((context) => context.text("Not found", 404));

export default app;
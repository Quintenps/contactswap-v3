import { Hono } from "hono";
import { routePath } from "hono/route";
import { optimizeProfilePhoto, PhotoRequestError, photoLimits, readPhotoBody } from "./photo";
import { renderVCard } from "./vcard";

const app = new Hono<{ Bindings: Env }>();

type OwnerProfile = {
  name: string;
  email: string;
  address: string;
  birthday: string;
};

type StoredOwnerProfile = OwnerProfile & { photo_key: string | null };
type GuestSubmission = OwnerProfile;
type StoredGuestSubmission = GuestSubmission & { photo_key: string | null };
type NotificationJob = { id: string; attempts: number };

const encoder = new TextEncoder();
const retentionMilliseconds = 30 * 24 * 60 * 60 * 1000;

async function getPhoto(environment: Env, photoKey: string | null): Promise<Uint8Array | undefined> {
  if (!photoKey) {
    return undefined;
  }

  const photo = await environment.PHOTOS.get(photoKey);
  if (!photo) {
    throw new Error("The photo object is missing.");
  }
  return new Uint8Array(await photo.arrayBuffer());
}

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

function parseGuestSubmission(value: unknown): GuestSubmission | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }

  const fields = value as Record<string, unknown>;
  const allowedFields = new Set(["name", "email", "address", "birthday"]);
  if (Object.keys(fields).some((field) => !allowedFields.has(field))) {
    return null;
  }

  return parseProfile(fields);
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

app.use("/api/guest/*", async (context, next) => {
  context.header("Cache-Control", "no-store");
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
    "SELECT name, email, address, birthday, photo_key FROM owner_profile WHERE id = 1"
  ).first<StoredOwnerProfile>();

  if (!profile) {
    return context.json(
      { error: { code: "profile_not_found", message: "No owner profile has been saved." } },
      404
    );
  }

  const { photo_key: photoKey, ...fields } = profile;
  return context.json({ ...fields, hasPhoto: Boolean(photoKey) });
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

  await context.env.DB.prepare(
    `INSERT INTO owner_profile (id, name, email, address, birthday, updated_at)
     VALUES (1, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name,
       email = excluded.email,
       address = excluded.address,
       birthday = excluded.birthday,
       updated_at = excluded.updated_at`
  )
    .bind(
      profile.name,
      profile.email,
      profile.address,
      profile.birthday,
      new Date().toISOString()
    )
    .run();

  const savedProfile = await context.env.DB.prepare(
    "SELECT photo_key FROM owner_profile WHERE id = 1"
  ).first<{ photo_key: string | null }>();
  return context.json({ ...profile, hasPhoto: Boolean(savedProfile?.photo_key) });
});

app.get("/api/owner/profile/vcard", async (context) => {
  const profile = await context.env.DB.prepare(
    "SELECT name, email, address, birthday, photo_key FROM owner_profile WHERE id = 1"
  ).first<StoredOwnerProfile>();

  if (!profile) {
    return context.json(
      { error: { code: "profile_not_found", message: "No owner profile has been saved." } },
      404
    );
  }

  const photo = await getPhoto(context.env, profile.photo_key);
  context.header("Content-Type", "text/vcard; version=4.0; charset=utf-8");
  context.header("Content-Disposition", 'attachment; filename="contactswap-profile.vcf"');
  return context.body(renderVCard(profile, photo));
});

app.put("/api/owner/profile/photo", async (context) => {
  const profile = await context.env.DB.prepare(
    "SELECT name, email, address, birthday, photo_key FROM owner_profile WHERE id = 1"
  ).first<StoredOwnerProfile>();
  if (!profile) {
    return context.json(
      { error: { code: "profile_not_found", message: "No owner profile has been saved." } },
      404
    );
  }

  const contentType = context.req.header("Content-Type")?.split(";")[0].trim().toLowerCase();
  if (!contentType || !["image/jpeg", "image/png", "image/webp"].includes(contentType)) {
    return context.json(
      { error: { code: "unsupported_photo_type", message: "The photo type is not supported." } },
      415
    );
  }

  const contentLength = context.req.header("Content-Length");
  if (contentLength && Number(contentLength) > photoLimits.maxSourceBytes) {
    return context.json(
      { error: { code: "photo_too_large", message: "The uploaded photo is too large." } },
      413
    );
  }

  let optimized: Uint8Array;
  try {
    const source = await readPhotoBody(context.req.raw.body);
    optimized = await optimizeProfilePhoto(context.env.IMAGES, source, contentType);
  } catch (error) {
    if (error instanceof PhotoRequestError) {
      return context.json(
        {
          error: {
            code: error.code,
            message:
              error.code === "photo_too_large"
                ? "The photo could not be reduced to the supported size."
                : "The uploaded photo is invalid."
          }
        },
        error.status
      );
    }
    if (typeof error === "object" && error !== null && "code" in error && error.code === 9412) {
      return context.json(
        { error: { code: "invalid_photo", message: "The uploaded photo is invalid." } },
        400
      );
    }
    throw error;
  }

  const photoKey = `owner-profile/${crypto.randomUUID()}.jpg`;
  await context.env.PHOTOS.put(photoKey, optimized, {
    httpMetadata: { contentType: "image/jpeg" }
  });

  let profileReferenceUpdated = false;
  try {
    const storedPhoto = await context.env.PHOTOS.get(photoKey);
    if (!storedPhoto) {
      throw new Error("The owner photo could not be read after upload.");
    }
    const storedBytes = new Uint8Array(await storedPhoto.arrayBuffer());
    if (
      storedBytes.byteLength !== optimized.byteLength ||
      storedBytes.some((byte, index) => byte !== optimized[index])
    ) {
      throw new Error("The owner photo could not be verified after upload.");
    }
    renderVCard(profile, storedBytes);

    const updated = await context.env.DB.prepare(
      "UPDATE owner_profile SET photo_key = ?, updated_at = ? WHERE id = 1 AND photo_key IS ?"
    )
      .bind(photoKey, new Date().toISOString(), profile.photo_key)
      .run();
    if (updated.meta.changes !== 1) {
      await context.env.PHOTOS.delete(photoKey);
      return context.json(
        { error: { code: "photo_changed", message: "The profile photo changed during upload." } },
        409
      );
    }
    profileReferenceUpdated = true;
    if (profile.photo_key) {
      await context.env.PHOTOS.delete(profile.photo_key);
    }
  } catch (error) {
    let canDeleteNewObject = !profileReferenceUpdated;
    try {
      const currentProfile = await context.env.DB.prepare(
        "SELECT photo_key FROM owner_profile WHERE id = 1"
      ).first<{ photo_key: string | null }>();
      if (currentProfile?.photo_key === photoKey) {
        const restored = await context.env.DB.prepare(
          "UPDATE owner_profile SET photo_key = ? WHERE id = 1 AND photo_key = ?"
        )
          .bind(profile.photo_key, photoKey)
          .run();
        canDeleteNewObject = restored.meta.changes === 1;
      }
    } catch {
      canDeleteNewObject = false;
    }
    if (canDeleteNewObject) {
      await context.env.PHOTOS.delete(photoKey);
    }
    throw error;
  }

  return context.json({ hasPhoto: true });
});

app.get("/api/owner/profile/photo", async (context) => {
  const profile = await context.env.DB.prepare(
    "SELECT photo_key FROM owner_profile WHERE id = 1"
  ).first<{ photo_key: string | null }>();
  if (!profile?.photo_key) {
    return context.json(
      { error: { code: "photo_not_found", message: "The owner photo was not found." } },
      404
    );
  }

  const photo = await context.env.PHOTOS.get(profile.photo_key);
  if (!photo) {
    return context.json(
      { error: { code: "photo_not_found", message: "The owner photo was not found." } },
      404
    );
  }
  context.header("Content-Type", "image/jpeg");
  context.header("Content-Disposition", "inline");
  context.header("X-Content-Type-Options", "nosniff");
  return context.body(photo.body);
});

app.delete("/api/owner/profile/photo", async (context) => {
  const profile = await context.env.DB.prepare(
    "SELECT photo_key FROM owner_profile WHERE id = 1"
  ).first<{ photo_key: string | null }>();
  if (!profile) {
    return context.json(
      { error: { code: "profile_not_found", message: "No owner profile has been saved." } },
      404
    );
  }
  if (!profile.photo_key) {
    return context.body(null, 204);
  }

  const updated = await context.env.DB.prepare(
    "UPDATE owner_profile SET photo_key = NULL, updated_at = ? WHERE id = 1 AND photo_key = ?"
  )
    .bind(new Date().toISOString(), profile.photo_key)
    .run();
  if (updated.meta.changes !== 1) {
    return context.json(
      { error: { code: "photo_changed", message: "The profile photo changed during removal." } },
      409
    );
  }

  try {
    await context.env.PHOTOS.delete(profile.photo_key);
  } catch (error) {
    await context.env.DB.prepare(
      "UPDATE owner_profile SET photo_key = ? WHERE id = 1 AND photo_key IS NULL"
    )
      .bind(profile.photo_key)
      .run();
    throw error;
  }
  return context.body(null, 204);
});

app.get("/api/owner/submissions", async (context) => {
  const now = new Date().toISOString();
  const submissions = await context.env.DB.prepare(
    `SELECT id, name, created_at AS createdAt, expires_at AS expiresAt
     FROM guest_submissions
     WHERE expires_at > ?
     ORDER BY created_at DESC, id DESC`
  )
    .bind(now)
    .all<{ id: string; name: string; createdAt: string; expiresAt: string }>();

  return context.json({ submissions: submissions.results });
});

app.get("/api/owner/submissions/:id", async (context) => {
  const now = new Date().toISOString();
  const submission = await context.env.DB.prepare(
    `SELECT id, name, email, address, birthday,
            created_at AS createdAt, expires_at AS expiresAt
     FROM guest_submissions
     WHERE id = ? AND expires_at > ?`
  )
    .bind(context.req.param("id"), now)
    .first<GuestSubmission & { id: string; createdAt: string; expiresAt: string }>();

  if (!submission) {
    return context.json(
      { error: { code: "submission_not_found", message: "The submission was not found." } },
      404
    );
  }

  return context.json(submission);
});

app.get("/api/owner/submissions/:id/vcard", async (context) => {
  const now = new Date().toISOString();
  const submission = await context.env.DB.prepare(
    `SELECT name, email, address, birthday, photo_key
     FROM guest_submissions
     WHERE id = ? AND expires_at > ?`
  )
    .bind(context.req.param("id"), now)
    .first<StoredGuestSubmission>();

  if (!submission) {
    return context.json(
      { error: { code: "submission_not_found", message: "The submission was not found." } },
      404
    );
  }

  const photo = await getPhoto(context.env, submission.photo_key);
  context.header("Content-Type", "text/vcard; version=4.0; charset=utf-8");
  context.header("Content-Disposition", 'attachment; filename="contactswap-submission.vcf"');
  context.header("Referrer-Policy", "no-referrer");
  return context.body(renderVCard(submission, photo));
});

app.get("/api/owner/links", async (context) => {
  const links = await context.env.DB.prepare(
    `SELECT id, created_at AS createdAt, consumed_at AS consumedAt, revoked_at AS revokedAt
     FROM guest_links
     ORDER BY created_at DESC, id DESC`
  ).all<{
    id: string;
    createdAt: string;
    consumedAt: string | null;
    revokedAt: string | null;
  }>();

  return context.json({
    links: links.results.map((link) => ({
      id: link.id,
      createdAt: link.createdAt,
      status: link.revokedAt ? "revoked" : link.consumedAt ? "consumed" : "active"
    }))
  });
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

app.delete("/api/owner/links/:id", async (context) => {
  const linkId = context.req.param("id");
  if (!/^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(linkId)) {
    return context.json(
      { error: { code: "invalid_link_id", message: "The link ID is invalid." } },
      400
    );
  }

  const result = await context.env.DB.prepare(
    `UPDATE guest_links SET revoked_at = ?
     WHERE id = ? AND revoked_at IS NULL AND consumed_at IS NULL`
  )
    .bind(new Date().toISOString(), linkId)
    .run();

  if (result.meta.changes === 0) {
    const link = await context.env.DB.prepare("SELECT id FROM guest_links WHERE id = ?")
      .bind(linkId)
      .first<{ id: string }>();

    if (!link) {
      return context.json(
        { error: { code: "guest_link_not_found", message: "The guest link was not found." } },
        404
      );
    }
  }

  return context.body(null, 204);
});

app.get("/api/guest/links/:token", async (context) => {
  const tokenHash = await hashGuestToken(context.req.param("token"));
  const link = await context.env.DB.prepare(
    "SELECT id, vcard_signature, consumed_at, revoked_at FROM guest_links WHERE token_hash = ?"
  )
    .bind(tokenHash)
    .first<{
      id: string;
      vcard_signature: string;
      consumed_at: string | null;
      revoked_at: string | null;
    }>();

  if (!link) {
    return context.json(
      { error: { code: "guest_link_not_found", message: "The guest link was not found." } },
      404
    );
  }
  if (link.consumed_at || link.revoked_at) {
    return context.json(
      { error: { code: "guest_link_unavailable", message: "The guest link is no longer available." } },
      410
    );
  }

  return context.json({ vcardUrl: `/api/guest/vcard/${link.id}/${link.vcard_signature}` });
});

app.get("/api/guest/vcard/:linkId/:signature", async (context) => {
  const profile = await context.env.DB.prepare(
    `SELECT owner_profile.name, owner_profile.email, owner_profile.address,
            owner_profile.birthday, owner_profile.photo_key
     FROM guest_links
     JOIN owner_profile ON owner_profile.id = 1
     WHERE guest_links.id = ?
       AND guest_links.vcard_signature = ?
       AND guest_links.consumed_at IS NULL
       AND guest_links.revoked_at IS NULL`
  )
    .bind(context.req.param("linkId"), context.req.param("signature"))
    .first<StoredOwnerProfile>();

  if (!profile) {
    return context.json(
      { error: { code: "vcard_unavailable", message: "The vCard is not available." } },
      404
    );
  }

  const photo = await getPhoto(context.env, profile.photo_key);
  context.header("Content-Type", "text/vcard; version=4.0; charset=utf-8");
  context.header("Content-Disposition", 'attachment; filename="contactswap-profile.vcf"');
  context.header("Referrer-Policy", "no-referrer");
  return context.body(renderVCard(profile, photo));
});

app.post("/api/guest/links/:token/submissions", async (context) => {
  const contentType = context.req.header("Content-Type")?.split(";")[0].trim().toLowerCase();
  let submission: GuestSubmission | null = null;
  let uploadedPhoto: File | undefined;

  if (contentType === "application/json") {
    let input: unknown;
    try {
      input = await context.req.json();
    } catch {
      return context.json(
        { error: { code: "invalid_submission", message: "The submission request is invalid." } },
        400
      );
    }
    submission = parseGuestSubmission(input);
  } else if (contentType === "multipart/form-data") {
    let form: FormData;
    try {
      form = await context.req.formData();
    } catch {
      return context.json(
        { error: { code: "invalid_submission", message: "The submission request is invalid." } },
        400
      );
    }

    const allowedFields = new Set(["name", "email", "address", "birthday", "picture"]);
    let invalid = false;
    form.forEach((_value, field) => {
      if (!allowedFields.has(field)) {
        invalid = true;
      }
    });

    const values: Record<string, string> = {};
    for (const field of ["name", "email", "address", "birthday"]) {
      const entries = form.getAll(field);
      if (entries.length !== 1 || typeof entries[0] !== "string") {
        invalid = true;
      } else {
        values[field] = entries[0];
      }
    }

    const photoEntries = form.getAll("picture");
    const photoEntry = photoEntries[0];
    if (photoEntries.length > 1 || (photoEntry !== undefined && typeof photoEntry === "string")) {
      invalid = true;
    } else if (photoEntry !== undefined) {
      uploadedPhoto = photoEntry;
    }

    if (!invalid) {
      submission = parseGuestSubmission(values);
    }
  }

  if (!submission) {
    return context.json(
      { error: { code: "invalid_submission", message: "The submission request is invalid." } },
      400
    );
  }

  const tokenHash = await hashGuestToken(context.req.param("token"));
  const link = await context.env.DB.prepare(
    "SELECT id, consumed_at, revoked_at FROM guest_links WHERE token_hash = ?"
  )
    .bind(tokenHash)
    .first<{ id: string; consumed_at: string | null; revoked_at: string | null }>();
  if (!link) {
    return context.json(
      { error: { code: "guest_link_not_found", message: "The guest link was not found." } },
      404
    );
  }
  if (link.consumed_at || link.revoked_at) {
    return context.json(
      { error: { code: "guest_link_unavailable", message: "The guest link is no longer available." } },
      410
    );
  }

  let optimizedPhoto: Uint8Array | undefined;
  if (uploadedPhoto) {
    const photoContentType = uploadedPhoto.type.trim().toLowerCase();
    if (!["image/jpeg", "image/png", "image/webp"].includes(photoContentType)) {
      return context.json(
        { error: { code: "unsupported_photo_type", message: "The photo type is not supported." } },
        415
      );
    }
    if (uploadedPhoto.size > photoLimits.maxSourceBytes) {
      return context.json(
        { error: { code: "photo_too_large", message: "The uploaded photo is too large." } },
        413
      );
    }

    try {
      const source = await readPhotoBody(uploadedPhoto.stream());
      optimizedPhoto = await optimizeProfilePhoto(context.env.IMAGES, source, photoContentType);
    } catch (error) {
      if (error instanceof PhotoRequestError) {
        return context.json(
          {
            error: {
              code: error.code,
              message:
                error.status === 413
                  ? "The uploaded photo is too large."
                  : error.status === 422
                    ? "The photo could not be reduced to the supported size."
                    : "The uploaded photo is invalid."
            }
          },
          error.status
        );
      }
      if (typeof error === "object" && error !== null && "code" in error && error.code === 9412) {
        return context.json(
          { error: { code: "invalid_photo", message: "The uploaded photo is invalid." } },
          400
        );
      }
      throw error;
    }
  }

  const now = new Date().toISOString();
  const expiresAt = new Date(Date.parse(now) + retentionMilliseconds).toISOString();
  const submissionId = crypto.randomUUID();
  const notificationId = crypto.randomUUID();
  const photoKey = optimizedPhoto ? `guest-submissions/${crypto.randomUUID()}.jpg` : null;
  let inserted = 0;

  try {
    if (photoKey && optimizedPhoto) {
      await context.env.PHOTOS.put(photoKey, optimizedPhoto, {
        httpMetadata: { contentType: "image/jpeg" }
      });
    }

    const results = await context.env.DB.batch([
      context.env.DB.prepare(
        `INSERT INTO guest_submissions
           (id, link_id, name, email, address, birthday, photo_key, created_at, expires_at)
         SELECT ?, id, ?, ?, ?, ?, ?, ?, ?
         FROM guest_links
         WHERE token_hash = ? AND consumed_at IS NULL AND revoked_at IS NULL`
      ).bind(
        submissionId,
        submission.name,
        submission.email,
        submission.address,
        submission.birthday,
        photoKey,
        now,
        expiresAt,
        tokenHash
      ),
      context.env.DB.prepare(
        `UPDATE guest_links SET consumed_at = ?
         WHERE id = (SELECT link_id FROM guest_submissions WHERE id = ?)
           AND consumed_at IS NULL AND revoked_at IS NULL`
      ).bind(now, submissionId),
      context.env.DB.prepare(
        `INSERT INTO notification_outbox (id, submission_id, attempts, next_attempt_at, created_at)
         SELECT ?, ?, 0, ?, ? WHERE EXISTS (SELECT 1 FROM guest_submissions WHERE id = ?)`
      ).bind(notificationId, submissionId, now, now, submissionId)
    ]);
    inserted = results[0].meta.changes;
  } catch {
    const link = await context.env.DB.prepare(
      "SELECT consumed_at, revoked_at FROM guest_links WHERE token_hash = ?"
    )
      .bind(tokenHash)
      .first<{ consumed_at: string | null; revoked_at: string | null }>();

    if (!link) {
      return context.json(
        { error: { code: "guest_link_not_found", message: "The guest link was not found." } },
        404
      );
    }
    if (link.consumed_at || link.revoked_at) {
      return context.json(
        { error: { code: "guest_link_unavailable", message: "The guest link is no longer available." } },
        410
      );
    }
    throw new Error("Guest submission persistence failed.");
  }

  if (inserted !== 1) {
    const link = await context.env.DB.prepare(
      "SELECT id FROM guest_links WHERE token_hash = ?"
    )
      .bind(tokenHash)
      .first<{ id: string }>();
    return context.json(
      {
        error: {
          code: link ? "guest_link_unavailable" : "guest_link_not_found",
          message: link ? "The guest link is no longer available." : "The guest link was not found."
        }
      },
      link ? 410 : 404
    );
  }

  return context.json({ success: true }, 201);
});

export async function runScheduledTasks(environment: Env): Promise<void> {
  const now = new Date().toISOString();
  await environment.DB.prepare("DELETE FROM guest_submissions WHERE expires_at <= ?")
    .bind(now)
    .run();

  const dueJobs = await environment.DB.prepare(
    `SELECT id, attempts FROM notification_outbox
     WHERE next_attempt_at <= ? ORDER BY next_attempt_at LIMIT 10`
  )
    .bind(now)
    .all<NotificationJob>();

  for (const job of dueJobs.results) {
    try {
      const response = await fetch(environment.WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: "@everyone A new contact was submitted through ContactSwap.",
          allowed_mentions: { parse: ["everyone"] }
        })
      });
      if (!response.ok) {
        throw new Error("Webhook delivery failed.");
      }

      await environment.DB.prepare("DELETE FROM notification_outbox WHERE id = ?")
        .bind(job.id)
        .run();
    } catch {
      const attempts = job.attempts + 1;
      const delayMinutes = Math.min(2 ** Math.min(attempts, 10), 24 * 60);
      const retryAt = new Date(Date.now() + delayMinutes * 60 * 1000).toISOString();
      await environment.DB.prepare(
        "UPDATE notification_outbox SET attempts = ?, next_attempt_at = ? WHERE id = ?"
      )
        .bind(attempts, retryAt, job.id)
        .run();
    }
  }
}

const worker = Object.assign(app, {
  scheduled: (_controller: ScheduledController, environment: Env) => runScheduledTasks(environment)
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

export default worker;
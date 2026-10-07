import { Hono } from "hono";
import { PhotoRequestError, optimizeProfilePhoto, photoLimits, readPhotoBody } from "../../photo";
import type { GuestSubmission } from "../../api-types";
import { hashGuestToken, parseGuestSubmission, retentionMilliseconds } from "../../api-utils";

const routes = new Hono<{ Bindings: Env }>();

routes.post("/links/:token/submissions", async (context) => {
  const contentType = context.req.header("Content-Type")?.split(";")[0].trim().toLowerCase();
  let submission: GuestSubmission | null = null;
  let uploadedPhoto: File | undefined;

  if (contentType === "multipart/form-data") {
    let form: FormData;
    try {
      form = await context.req.formData();
    } catch {
      return context.json(
        { error: { code: "invalid_submission", message: "The submission request is invalid." } },
        400
      );
    }

    const allowedFields = new Set(["name", "email", "address", "birthday", "phone", "org", "title", "picture"]);
    let invalid = false;
    form.forEach((_value, field) => {
      if (!allowedFields.has(field)) {
        invalid = true;
      }
    });

    const values: Record<string, string> = {};
    for (const field of ["name", "email", "address", "birthday", "phone"]) {
      const entries = form.getAll(field);
      if (entries.length !== 1 || typeof entries[0] !== "string") {
        invalid = true;
      } else {
        values[field] = entries[0];
      }
    }
    for (const field of ["org", "title"]) {
      const entries = form.getAll(field);
      if (entries.length > 1) {
        invalid = true;
      } else if (entries.length === 1) {
        const entry = entries[0];
        if (typeof entry !== "string") {
          invalid = true;
        } else {
          values[field] = entry;
        }
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
           (id, link_id, name, email, address, birthday, phone, org, title, photo_key, created_at, expires_at)
         SELECT ?, id, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
         FROM guest_links
         WHERE token_hash = ? AND consumed_at IS NULL AND revoked_at IS NULL`
      ).bind(
        submissionId,
        submission.name,
        submission.email,
        submission.address,
        submission.birthday,
        submission.phone,
        submission.org,
        submission.title,
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

export default routes;

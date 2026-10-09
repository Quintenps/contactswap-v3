import { Hono } from "hono";
import { optimizeProfilePhoto, PhotoRequestError, photoLimits, readPhotoBody } from "../../photo";
import type { StoredOwnerProfile } from "../../api-types";
import { getPhoto, isValidPhone, validateProfile } from "../../api-utils";
import { renderVCard, vCardDownloadFilename } from "../../vcard";

const routes = new Hono<{ Bindings: Env }>();

routes.get("/profile", async (context) => {
  const profile = await context.env.DB.prepare(
    `SELECT first_name AS firstName, last_name AS lastName, email,
            street, city, postal_code AS postalCode, country, birthday, phone,
            org, title, photo_key
     FROM owner_profile WHERE id = 1`
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

routes.put("/profile", async (context) => {
  let input: unknown;
  try {
    input = await context.req.json();
  } catch {
    return context.json(
      { error: { code: "invalid_profile", message: "The profile request is invalid." } },
      400
    );
  }

  const validation = validateProfile(input);
  if (!validation.profile) {
    return context.json(
      {
        error: {
          code: "invalid_profile",
          message: "The profile request is invalid.",
          ...(Object.keys(validation.fieldErrors).length > 0
            ? { fields: validation.fieldErrors }
            : {})
        }
      },
      400
    );
  }

  const profile = validation.profile;
  await context.env.DB.prepare(
    `INSERT INTO owner_profile
       (id, first_name, last_name, email, street, city, postal_code, country, birthday, phone, org, title, updated_at)
     VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       first_name = excluded.first_name,
       last_name = excluded.last_name,
       email = excluded.email,
       street = excluded.street,
       city = excluded.city,
       postal_code = excluded.postal_code,
       country = excluded.country,
       birthday = excluded.birthday,
       phone = excluded.phone,
       org = excluded.org,
       title = excluded.title,
       updated_at = excluded.updated_at`
  )
    .bind(
      profile.firstName,
      profile.lastName,
      profile.email,
      profile.street,
      profile.city,
      profile.postalCode,
      profile.country,
      profile.birthday,
      profile.phone,
      profile.org,
      profile.title,
      new Date().toISOString()
    )
    .run();

  const savedProfile = await context.env.DB.prepare(
    "SELECT photo_key FROM owner_profile WHERE id = 1"
  ).first<{ photo_key: string | null }>();
  return context.json({ ...profile, hasPhoto: Boolean(savedProfile?.photo_key) });
});

routes.get("/profile/vcard", async (context) => {
  const profile = await context.env.DB.prepare(
    `SELECT first_name AS firstName, last_name AS lastName, email,
            street, city, postal_code AS postalCode, country, birthday, phone,
            org, title, photo_key
     FROM owner_profile WHERE id = 1`
  ).first<StoredOwnerProfile>();

  if (!profile) {
    return context.json(
      { error: { code: "profile_not_found", message: "No owner profile has been saved." } },
      404
    );
  }

  if (!isValidPhone(profile.phone)) {
    return context.json(
      { error: { code: "profile_phone_required", message: "A valid phone number is required." } },
      409
    );
  }

  const photo = await getPhoto(context.env, profile.photo_key);
  context.header("Content-Type", "text/vcard; version=3.0; charset=utf-8");
  context.header(
    "Content-Disposition",
    `attachment; filename="${vCardDownloadFilename(profile.firstName, profile.lastName)}"`
  );
  return context.body(renderVCard(profile, photo));
});

routes.put("/profile/photo", async (context) => {
  const profile = await context.env.DB.prepare(
    `SELECT first_name AS firstName, last_name AS lastName, email,
            street, city, postal_code AS postalCode, country, birthday, phone,
            org, title, photo_key
     FROM owner_profile WHERE id = 1`
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

routes.get("/profile/photo", async (context) => {
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

routes.delete("/profile/photo", async (context) => {
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

export default routes;

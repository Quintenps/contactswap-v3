import { Hono } from "hono";
import type { StoredOwnerProfile } from "../../api-types";
import { getPhoto, isValidPhone } from "../../api-utils";
import { renderVCard, vCardDownloadFilename } from "../../vcard";

const routes = new Hono<{ Bindings: Env }>();

routes.get("/profile-photo/:linkId/:signature", async (context) => {
  const profile = await context.env.DB.prepare(
    `SELECT owner_profile.photo_key
     FROM guest_links
     JOIN owner_profile ON owner_profile.id = 1
     WHERE guest_links.id = ?
       AND guest_links.vcard_signature = ?
       AND guest_links.consumed_at IS NULL
       AND guest_links.revoked_at IS NULL`
  )
    .bind(context.req.param("linkId"), context.req.param("signature"))
    .first<{ photo_key: string | null }>();

  if (!profile?.photo_key) {
    return context.json(
      { error: { code: "profile_photo_unavailable", message: "The profile photo is not available." } },
      404
    );
  }

  const photo = await context.env.PHOTOS.get(profile.photo_key);
  if (!photo) {
    return context.json(
      { error: { code: "profile_photo_unavailable", message: "The profile photo is not available." } },
      404
    );
  }

  context.header("Content-Type", "image/jpeg");
  context.header("Content-Disposition", "inline");
  context.header("Referrer-Policy", "no-referrer");
  context.header("X-Content-Type-Options", "nosniff");
  return context.body(photo.body);
});

routes.get("/vcard/:linkId/:signature", async (context) => {
  const profile = await context.env.DB.prepare(
    `SELECT owner_profile.name, owner_profile.email, owner_profile.address,
            owner_profile.birthday, owner_profile.phone, owner_profile.org,
            owner_profile.title, owner_profile.photo_key
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

  if (!isValidPhone(profile.phone)) {
    return context.json(
      { error: { code: "vcard_unavailable", message: "The vCard is not available." } },
      404
    );
  }

  const photo = await getPhoto(context.env, profile.photo_key);
  context.header("Content-Type", "text/vcard; version=3.0; charset=utf-8");
  context.header(
    "Content-Disposition",
    `attachment; filename="${vCardDownloadFilename(profile.name)}"`
  );
  context.header("Referrer-Policy", "no-referrer");
  return context.body(renderVCard(profile, photo));
});

export default routes;

import { Hono } from "hono";
import type { StoredOwnerProfile } from "../../api-types";
import { getPhoto } from "../../api-utils";
import { renderVCard } from "../../vcard";

const routes = new Hono<{ Bindings: Env }>();

routes.get("/vcard/:linkId/:signature", async (context) => {
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

export default routes;

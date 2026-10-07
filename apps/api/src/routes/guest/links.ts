import { Hono } from "hono";
import { hashGuestToken } from "../../api-utils";

const routes = new Hono<{ Bindings: Env }>();

routes.get("/links/:token", async (context) => {
  const tokenHash = await hashGuestToken(context.req.param("token"));
  const link = await context.env.DB.prepare(
    `SELECT guest_links.id, guest_links.vcard_signature, guest_links.consumed_at, guest_links.revoked_at,
            owner_profile.name AS owner_name, owner_profile.photo_key
     FROM guest_links
     LEFT JOIN owner_profile ON owner_profile.id = 1
     WHERE guest_links.token_hash = ?`
  )
    .bind(tokenHash)
    .first<{
      id: string;
      vcard_signature: string;
      consumed_at: string | null;
      revoked_at: string | null;
      owner_name: string | null;
      photo_key: string | null;
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

  if (!link.owner_name) {
    return context.json(
      { error: { code: "owner_profile_unavailable", message: "The owner profile is unavailable." } },
      404
    );
  }

  return context.json({
    ownerName: link.owner_name,
    profilePhotoUrl: link.photo_key
      ? `/api/guest/profile-photo/${link.id}/${link.vcard_signature}`
      : null,
    vcardUrl: `/api/guest/vcard/${link.id}/${link.vcard_signature}`
  });
});

export default routes;

import { Hono } from "hono";
import { hashGuestToken } from "../../api-utils";

const routes = new Hono<{ Bindings: Env }>();

routes.get("/links/:token", async (context) => {
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

export default routes;

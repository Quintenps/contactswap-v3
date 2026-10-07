import { Hono } from "hono";
import { encodeBase64Url, getPublicAppOrigin, hashGuestToken, signVCardLink } from "../../api-utils";

const routes = new Hono<{ Bindings: Env }>();

routes.get("/links", async (context) => {
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

routes.post("/links", async (context) => {
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

  const guestUrl = new URL(`/token/${guestToken}`, publicAppOrigin).toString();
  return context.json({ guestUrl }, 201);
});

routes.delete("/links/:id", async (context) => {
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

export default routes;

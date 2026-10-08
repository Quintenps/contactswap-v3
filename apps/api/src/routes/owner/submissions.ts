import { Hono } from "hono";
import type { GuestSubmission, StoredGuestSubmission } from "../../api-types";
import { formatDisplayName, getPhoto, isValidPhone } from "../../api-utils";
import { renderVCard, vCardDownloadFilename } from "../../vcard";

const routes = new Hono<{ Bindings: Env }>();

routes.get("/submissions", async (context) => {
  const now = new Date().toISOString();
  const submissions = await context.env.DB.prepare(
    `SELECT id, first_name AS firstName, last_name AS lastName,
            created_at AS createdAt, expires_at AS expiresAt
     FROM guest_submissions
     WHERE expires_at > ?
     ORDER BY created_at DESC, id DESC`
  )
    .bind(now)
    .all<{ id: string; firstName: string; lastName: string; createdAt: string; expiresAt: string }>();

  return context.json({
    submissions: submissions.results.map(({ firstName, lastName, ...submission }) => ({
      ...submission,
      name: formatDisplayName(firstName, lastName)
    }))
  });
});

routes.get("/submissions/:id", async (context) => {
  const now = new Date().toISOString();
  const submission = await context.env.DB.prepare(
    `SELECT id, first_name AS firstName, last_name AS lastName,
            email, street, city, postal_code AS postalCode, country,
            birthday, phone, org, title,
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

routes.get("/submissions/:id/vcard", async (context) => {
  const now = new Date().toISOString();
  const submission = await context.env.DB.prepare(
    `SELECT first_name AS firstName, last_name AS lastName, email,
            street, city, postal_code AS postalCode, country,
            birthday, phone, org, title, photo_key
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

  if (!isValidPhone(submission.phone)) {
    return context.json(
      { error: { code: "submission_phone_required", message: "A valid phone number is required." } },
      409
    );
  }

  const photo = await getPhoto(context.env, submission.photo_key);
  context.header("Content-Type", "text/vcard; version=3.0; charset=utf-8");
  context.header(
    "Content-Disposition",
    `attachment; filename="${vCardDownloadFilename(submission.firstName, submission.lastName)}"`
  );
  context.header("Referrer-Policy", "no-referrer");
  return context.body(renderVCard(submission, photo));
});

export default routes;

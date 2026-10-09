import { createExecutionContext } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import app, { runScheduledTasks } from "../src/index";

const adminToken = "test-only-admin-token";
const testEnv: Env = {
  ...env,
  ADMIN_TOKEN: adminToken,
  LINK_SIGNING_KEY: "test-only-link-signing-key-with-32-bytes",
  WEBHOOK_URL: "https://hooks.example.invalid/test-only-secret",
  PUBLIC_APP_ORIGIN: "https://contactswap.quinten.dev"
};
const profile = {
  firstName: "Quinten",
  lastName: "Example",
  email: "quinten@example.invalid",
  street: "123 Owner Street",
  city: "Amsterdam",
  postalCode: "1012 AB",
  country: "The Netherlands",
  birthday: "1990-02-28",
  phone: "+31600000000",
  org: "ContactSwap, Inc.",
  title: "Founder"
};
const submission = {
  firstName: "Guest",
  lastName: "Example",
  email: "guest@example.invalid",
  street: "456 Guest Street",
  city: "Amsterdam",
  postalCode: "1013 AB",
  country: "The Netherlands",
  birthday: "1988-06-12",
  phone: "+31600000001",
  org: "Guest Company",
  title: "Designer"
};

async function call(path: string, init: RequestInit = {}): Promise<Response> {
  return app.fetch(
    new Request(`http://contactswap.local${path}`, init),
    testEnv,
    createExecutionContext()
  );
}

async function createGuestLink(): Promise<{ token: string; linkId: string }> {
  await call("/api/owner/profile", {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${adminToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(profile)
  });

  const response = await call("/api/owner/links", {
    method: "POST",
    headers: { Authorization: `Bearer ${adminToken}` }
  });
  const body = (await response.json()) as { guestUrl: string };
  const token = new URL(body.guestUrl).pathname.split("/").at(-1) as string;
  const link = await env.DB.prepare("SELECT id FROM guest_links LIMIT 1").first<{ id: string }>();
  return { token, linkId: link!.id };
}

function submissionForm(body: Record<string, string>): FormData {
  const form = new FormData();
  for (const [field, value] of Object.entries(body)) {
    form.append(field, value);
  }
  return form;
}

async function submit(token: string, body: Record<string, string> = submission): Promise<Response> {
  return call(`/api/guest/links/${token}/submissions`, {
    method: "POST",
    body: submissionForm(body)
  });
}

describe("guest URL API flow", () => {
  beforeEach(async () => {
    await env.DB.prepare("DROP TRIGGER IF EXISTS fail_notification_insert").run();
    await env.DB.prepare("DELETE FROM notification_outbox").run();
    await env.DB.prepare("DELETE FROM guest_submissions").run();
    await env.DB.prepare("DELETE FROM guest_links").run();
    await env.DB.prepare("DELETE FROM owner_profile").run();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("resolves an active token with only the guest preview and rejects unknown tokens", async () => {
    const { token } = await createGuestLink();
    const resolved = await call(`/api/guest/links/${token}`);
    const body = (await resolved.json()) as {
      ownerName: string;
      profilePhotoUrl: string | null;
      vcardUrl: string;
      submissionComplete: boolean;
    };

    expect(resolved.status).toBe(200);
    expect(resolved.headers.get("Cache-Control")).toBe("no-store");
    expect(body.ownerName).toBe(`${profile.firstName} ${profile.lastName}`);
    expect(body.profilePhotoUrl).toBeNull();
    expect(body.vcardUrl).toMatch(/^\/api\/guest\/vcard\/[\da-f-]{36}\/[A-Za-z\d_-]+$/i);
    expect(body.submissionComplete).toBe(false);
    expect(JSON.stringify(body)).not.toContain(profile.email);
    expect(JSON.stringify(body)).not.toContain(profile.street);
    expect(JSON.stringify(body)).not.toContain(profile.birthday);
    expect(JSON.stringify(body)).not.toContain(profile.phone);
    expect(JSON.stringify(body)).not.toContain(profile.org);
    expect(JSON.stringify(body)).not.toContain(profile.title);

    const unknown = await call("/api/guest/links/unknown-token");
    expect(unknown.status).toBe(404);
    expect(unknown.headers.get("Cache-Control")).toBe("no-store");
    expect(await unknown.json()).toEqual({
      error: { code: "guest_link_not_found", message: "The guest link was not found." }
    });
  });

  it("serves the profile photo only while its guest link is active", async () => {
    const revokedLink = await createGuestLink();
    const photoKey = `owner-profile/guest-preview-${crypto.randomUUID()}.jpg`;
    const photoBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
    await env.PHOTOS.put(photoKey, photoBytes, { httpMetadata: { contentType: "image/jpeg" } });
    await env.DB.prepare("UPDATE owner_profile SET photo_key = ? WHERE id = 1")
      .bind(photoKey)
      .run();

    const revokedResolution = (await (
      await call(`/api/guest/links/${revokedLink.token}`)
    ).json()) as { profilePhotoUrl: string };
    expect(revokedResolution.profilePhotoUrl).toMatch(
      /^\/api\/guest\/profile-photo\/[\da-f-]{36}\/[A-Za-z\d_-]+$/i
    );
    const photo = await call(revokedResolution.profilePhotoUrl);
    expect(photo.status).toBe(200);
    expect(photo.headers.get("Cache-Control")).toBe("no-store");
    expect(photo.headers.get("Content-Type")).toBe("image/jpeg");
    expect(photo.headers.get("Content-Disposition")).toBe("inline");
    expect(photo.headers.get("Referrer-Policy")).toBe("no-referrer");
    expect(photo.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(new Uint8Array(await photo.arrayBuffer())).toEqual(photoBytes);
    const [linkId, signature] = revokedResolution.profilePhotoUrl.split("/").slice(-2);
    expect((await call(`/api/guest/profile-photo/${linkId}/${signature.slice(1)}x`)).status).toBe(404);

    await env.DB.prepare("UPDATE guest_links SET revoked_at = ? WHERE id = ?")
      .bind(new Date().toISOString(), revokedLink.linkId)
      .run();
    expect((await call(revokedResolution.profilePhotoUrl)).status).toBe(404);

    const consumedLink = await createGuestLink();
    const consumedResolution = (await (
      await call(`/api/guest/links/${consumedLink.token}`)
    ).json()) as { profilePhotoUrl: string };
    expect((await submit(consumedLink.token)).status).toBe(201);
    expect((await call(consumedResolution.profilePhotoUrl)).status).toBe(200);
    const vcardUrl = consumedResolution.profilePhotoUrl.replace("profile-photo", "vcard");
    expect((await call(vcardUrl)).status).toBe(200);
    expect((await call(consumedResolution.profilePhotoUrl)).status).toBe(404);
    await env.PHOTOS.delete(photoKey);
  });

  it("serves the current owner vCard only with an active link-scoped signature", async () => {
    const { token } = await createGuestLink();
    const resolved = (await (await call(`/api/guest/links/${token}`)).json()) as {
      vcardUrl: string;
    };
    await call("/api/owner/profile", {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${adminToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ ...profile, street: "Updated Owner Street" })
    });
    const currentCard = await call(resolved.vcardUrl);

    expect(currentCard.status).toBe(200);
    expect(currentCard.headers.get("Content-Type")).toBe(
      "text/vcard; version=3.0; charset=utf-8"
    );
    expect(currentCard.headers.get("Content-Disposition")).toBe(
      'attachment; filename="quinten-example.vcf"'
    );
    expect(currentCard.headers.get("Cache-Control")).toBe("no-store");
    expect(currentCard.headers.get("Referrer-Policy")).toBe("no-referrer");
    const currentCardBody = await currentCard.text();
    expect(currentCardBody).toContain("FN:Quinten Example");
    expect(currentCardBody).toContain("VERSION:3.0\r\n");
    expect(currentCardBody).toContain("TEL;TYPE=CELL,VOICE,PREF:+31600000000\r\n");
    expect(currentCardBody).toContain("ORG:ContactSwap\\, Inc.\r\n");
    expect(currentCardBody).toContain("TITLE:Founder\r\n");
    expect(currentCardBody).toContain(
      "ADR;TYPE=home:;;Updated Owner Street;Amsterdam;;1012 AB;The Netherlands\r\n"
    );
    expect((await call(resolved.vcardUrl)).status).toBe(404);

    const [linkId, signature] = resolved.vcardUrl.split("/").slice(-2);
    const invalidSignature = await call(`/api/guest/vcard/${linkId}/${signature.slice(1)}x`);
    expect(invalidSignature.status).toBe(404);
    expect(await invalidSignature.text()).not.toContain(profile.email);

    const secondLink = await createGuestLink();
    const secondResolved = (await (await call(`/api/guest/links/${secondLink.token}`)).json()) as {
      vcardUrl: string;
    };
    const secondSignature = secondResolved.vcardUrl.split("/").at(-1);
    const crossLink = await call(`/api/guest/vcard/${linkId}/${secondSignature}`);
    expect(crossLink.status).toBe(404);
    expect(await crossLink.text()).not.toContain(profile.email);
  });

  it("allows only one concurrent vCard download to consume a link", async () => {
    const { token } = await createGuestLink();
    const resolved = (await (await call(`/api/guest/links/${token}`)).json()) as {
      vcardUrl: string;
    };

    const responses = await Promise.all([
      call(resolved.vcardUrl),
      call(resolved.vcardUrl)
    ]);

    expect(responses.map((response) => response.status).sort()).toEqual([200, 404]);
    expect((await call(`/api/guest/links/${token}`)).status).toBe(410);
  });

  it("does not consume a link when the signed card request fails", async () => {
    const { token } = await createGuestLink();
    const resolved = (await (await call(`/api/guest/links/${token}`)).json()) as {
      vcardUrl: string;
    };
    const [linkId, signature] = resolved.vcardUrl.split("/").slice(-2);

    expect((await call(`/api/guest/vcard/${linkId}/${signature.slice(1)}x`)).status).toBe(404);
    expect((await call(resolved.vcardUrl)).status).toBe(200);
  });

  it("rejects missing, blank, malformed, and unsupported submission values without consuming the link", async () => {
    const { token } = await createGuestLink();
    const invalidBodies = [
      { ...submission, firstName: "   " },
      { ...submission, lastName: " " },
      { ...submission, street: "" },
      { ...submission, city: "" },
      { ...submission, postalCode: "" },
      { ...submission, country: "" },
      { ...submission, email: "not-an-email" },
      { ...submission, birthday: "2025-02-30" },
      { ...submission, phone: "+31 6 0000 0000" },
      { ...submission, phone: "+3161234567890123" },
      { ...submission, extra: "unsupported" },
      { firstName: submission.firstName, email: submission.email, street: submission.street }
    ];

    for (const body of invalidBodies) {
      const response = await submit(token, body);
      expect(response.status).toBe(400);
      expect(response.headers.get("Cache-Control")).toBe("no-store");
      expect(JSON.stringify(await response.json())).not.toContain(submission.email);
    }

    const jsonRequest = await call(`/api/guest/links/${token}/submissions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(submission)
    });
    expect(jsonRequest.status).toBe(400);

    const malformedMultipart = await call(`/api/guest/links/${token}/submissions`, {
      method: "POST",
      headers: { "Content-Type": "multipart/form-data; boundary=broken" },
      body: "not a multipart body"
    });
    expect(malformedMultipart.status).toBe(400);
    expect((await call(`/api/guest/links/${token}`)).status).toBe(200);
    expect(await env.DB.prepare("SELECT id FROM guest_submissions").first()).toBeNull();
  });

  it("returns safe field validation errors without persisting or consuming a guest link", async () => {
    const { token } = await createGuestLink();
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const response = await submit(token, {
      ...submission,
      email: "bad email",
      birthday: tomorrow,
      city: "Lon\ndon",
      org: "x".repeat(256)
    });

    expect(response.status).toBe(400);
    const errorBody = await response.json();
    expect(errorBody).toEqual({
      error: {
        code: "invalid_submission",
        message: "The submission request is invalid.",
        fields: {
          email: "invalid_email",
          birthday: "future_birthday",
          city: "control_character",
          org: "too_long"
        }
      }
    });
    expect(JSON.stringify(errorBody)).not.toContain("bad email");
    expect(JSON.stringify(errorBody)).not.toContain("Lon");
    expect((await call(`/api/guest/links/${token}`)).status).toBe(200);
    expect(await env.DB.prepare("SELECT id FROM guest_submissions").first()).toBeNull();
    expect(await env.DB.prepare("SELECT id FROM notification_outbox").first()).toBeNull();
  });

  it("atomically stores one submission, keeps the card available, and schedules a private notification", async () => {
    const { token } = await createGuestLink();
    const response = await submit(token);

    expect(response.status).toBe(201);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({ success: true });
    const resolution = await call(`/api/guest/links/${token}`);
    expect(resolution.status).toBe(200);
    const resolutionBody = (await resolution.json()) as {
      submissionComplete: boolean;
      vcardUrl: string;
    };
    expect(resolutionBody.submissionComplete).toBe(true);
    expect((await submit(token)).status).toBe(410);
    expect((await call(resolutionBody.vcardUrl)).status).toBe(200);
    expect((await call(`/api/guest/links/${token}`)).status).toBe(410);

    const stored = await env.DB.prepare(
      `SELECT first_name AS firstName, last_name AS lastName, email, street, city,
              postal_code AS postalCode, country, birthday, phone, org, title,
              created_at AS createdAt, expires_at AS expiresAt
       FROM guest_submissions`
    ).first<Record<string, string>>();
    expect(stored).toMatchObject({
      ...submission,
      createdAt: expect.any(String),
      expiresAt: expect.any(String)
    });
    expect(Date.parse(stored!.expiresAt) - Date.parse(stored!.createdAt)).toBe(
      30 * 24 * 60 * 60 * 1000
    );
    expect(await env.DB.prepare("SELECT id FROM guest_submissions").all()).toMatchObject({
      results: [{ id: expect.any(String) }]
    });
    expect(await env.DB.prepare("SELECT id FROM notification_outbox").all()).toMatchObject({
      results: [{ id: expect.any(String) }]
    });
  });

  it("accepts omitted or blank optional organization and title values", async () => {
    const omittedLink = await createGuestLink();
    const withoutOptionalFields = {
      firstName: submission.firstName,
      lastName: submission.lastName,
      email: submission.email,
      street: submission.street,
      city: submission.city,
      postalCode: submission.postalCode,
      country: submission.country,
      birthday: submission.birthday,
      phone: submission.phone
    };
    const omittedResponse = await submit(omittedLink.token, withoutOptionalFields);

    expect(omittedResponse.status).toBe(201);
    const omittedStored = await env.DB.prepare(
      "SELECT org, title FROM guest_submissions WHERE link_id = ?"
    )
      .bind(omittedLink.linkId)
      .first<{ org: string | null; title: string | null }>();
    expect(omittedStored).toEqual({ org: null, title: null });

    const blankLink = await createGuestLink();
    const blankResponse = await submit(blankLink.token, { ...submission, org: "  ", title: "" });
    expect(blankResponse.status).toBe(201);
    const blankStored = await env.DB.prepare(
      "SELECT org, title FROM guest_submissions WHERE link_id = ?"
    )
      .bind(blankLink.linkId)
      .first<{ org: string | null; title: string | null }>();
    expect(blankStored).toEqual({ org: null, title: null });
  });

  it("allows only one of two concurrent submissions", async () => {
    const { token } = await createGuestLink();
    const responses = await Promise.all([submit(token), submit(token)]);

    expect(responses.map((response) => response.status).sort()).toEqual([201, 410]);
    const count = await env.DB.prepare("SELECT COUNT(*) AS count FROM guest_submissions").first<{
      count: number;
    }>();
    expect(count?.count).toBe(1);
  });

  it("keeps the submission lock after guest data expires", async () => {
    const { token, linkId } = await createGuestLink();
    expect((await submit(token)).status).toBe(201);
    await env.DB.prepare("DELETE FROM guest_submissions WHERE link_id = ?").bind(linkId).run();

    const resolution = (await (
      await call(`/api/guest/links/${token}`)
    ).json()) as { submissionComplete: boolean };
    expect(resolution.submissionComplete).toBe(true);
    expect((await submit(token)).status).toBe(410);
  });

  it("rolls back submission and link consumption when persistence fails", async () => {
    const { token } = await createGuestLink();
    await env.DB.prepare(
      `CREATE TRIGGER fail_notification_insert BEFORE INSERT ON notification_outbox
       BEGIN SELECT RAISE(ABORT, 'forced test failure'); END`
    ).run();
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await submit(token);

    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain(submission.email);
    expect((await call(`/api/guest/links/${token}`)).status).toBe(200);
    expect(await env.DB.prepare("SELECT id FROM guest_submissions").first()).toBeNull();
    await env.DB.prepare("DROP TRIGGER fail_notification_insert").run();
  });

  it("sends the fixed Discord mention and retries webhook failures", async () => {
    const { token } = await createGuestLink();
    await submit(token);
    const failedDelivery = vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("offline"));

    await runScheduledTasks(testEnv);

    expect(failedDelivery).toHaveBeenCalledTimes(1);
    const failedBody = JSON.parse(String(failedDelivery.mock.calls[0][1]?.body)) as {
      content: string;
      allowed_mentions: { parse: string[] };
    };
    expect(failedBody).toEqual({
      content: "@everyone A new contact was submitted through ContactSwap.",
      allowed_mentions: { parse: ["everyone"] }
    });
    expect(JSON.stringify(failedBody)).not.toContain(submission.email);
    const retryJob = await env.DB.prepare(
      "SELECT attempts, next_attempt_at FROM notification_outbox"
    ).first<{ attempts: number; next_attempt_at: string }>();
    expect(retryJob?.attempts).toBe(1);
    expect(Date.parse(retryJob!.next_attempt_at)).toBeGreaterThan(Date.now());

    failedDelivery.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await env.DB.prepare("UPDATE notification_outbox SET next_attempt_at = ?")
      .bind(new Date(0).toISOString())
      .run();
    await runScheduledTasks(testEnv);
    expect(failedDelivery).toHaveBeenCalledTimes(2);
    expect(await env.DB.prepare("SELECT id FROM notification_outbox").first()).toBeNull();
  });

  it("deletes expired guest data and its queued notification", async () => {
    const { token, linkId } = await createGuestLink();
    await submit(token);
    await env.DB.prepare("DELETE FROM guest_links WHERE id = ?").bind(linkId).run();
    expect(await env.DB.prepare("SELECT id FROM guest_submissions").first()).not.toBeNull();
    await env.DB.prepare("UPDATE guest_submissions SET expires_at = ?")
      .bind(new Date(0).toISOString())
      .run();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 204 }));

    await runScheduledTasks(testEnv);

    expect(await env.DB.prepare("SELECT id FROM guest_submissions").first()).toBeNull();
    expect(await env.DB.prepare("SELECT id FROM notification_outbox").first()).toBeNull();
  });

  it("returns unavailable for revoked and consumed vCard links", async () => {
    const { token, linkId } = await createGuestLink();
    const resolved = (await (await call(`/api/guest/links/${token}`)).json()) as {
      vcardUrl: string;
    };
    await env.DB.prepare("UPDATE guest_links SET revoked_at = ? WHERE id = ?")
      .bind(new Date().toISOString(), linkId)
      .run();

    const revokedCard = await call(resolved.vcardUrl);
    expect(revokedCard.status).toBe(404);
    expect((await call(`/api/guest/links/${token}`)).status).toBe(410);
    expect((await submit(token)).status).toBe(410);

    const activeLink = await createGuestLink();
    const activeResolved = (await (await call(`/api/guest/links/${activeLink.token}`)).json()) as {
      vcardUrl: string;
    };
    expect((await submit(activeLink.token)).status).toBe(201);
    expect((await call(activeResolved.vcardUrl)).status).toBe(200);
    expect((await call(activeResolved.vcardUrl)).status).toBe(404);
  });
});

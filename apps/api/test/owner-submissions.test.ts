import { createExecutionContext } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import app from "../src/index";

const adminToken = "test-only-admin-token";
const testEnv: Env = { ...env, ADMIN_TOKEN: adminToken };

type Submission = {
  id: string;
  linkId: string;
  name: string;
  email: string;
  address: string;
  birthday: string;
  phone: string;
  org: string | null;
  title: string | null;
  createdAt: string;
  expiresAt: string;
};

async function call(
  path: string,
  secret: string | null = adminToken
): Promise<Response> {
  const headers = new Headers();
  if (secret !== null) {
    headers.set("Authorization", `Bearer ${secret}`);
  }

  return app.fetch(
    new Request(`http://contactswap.local${path}`, { headers }),
    testEnv,
    createExecutionContext()
  );
}

async function insertSubmission(
  name: string,
  createdAt: string,
  expiresAt = "2099-01-01T00:00:00.000Z"
): Promise<Submission> {
  const id = crypto.randomUUID();
  const linkId = crypto.randomUUID();
  const email = `${id}@example.invalid`;
  const address = `${id} Guest Street`;
  const birthday = "1988-06-12";
  const phone = "+31600000001";
  const org = "Example, Inc.; Europe";
  const title = "Product designer";

  await env.DB.prepare(
    `INSERT INTO guest_links (id, token_hash, vcard_signature, created_at)
     VALUES (?, ?, ?, ?)`
  )
    .bind(linkId, `${linkId}-hash`, `${linkId}-signature`, createdAt)
    .run();
  await env.DB.prepare(
    `INSERT INTO guest_submissions
       (id, link_id, name, email, address, birthday, phone, org, title, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(id, linkId, name, email, address, birthday, phone, org, title, createdAt, expiresAt)
    .run();

  return { id, linkId, name, email, address, birthday, phone, org, title, createdAt, expiresAt };
}

describe("owner submissions API", () => {
  beforeEach(async () => {
    await env.DB.prepare("DELETE FROM notification_outbox").run();
    await env.DB.prepare("DELETE FROM guest_submissions").run();
    await env.DB.prepare("DELETE FROM guest_links").run();
  });

  it("requires owner authorization for list, detail, and vCard endpoints", async () => {
    const submission = await insertSubmission("Private Guest", "2026-10-01T12:00:00.000Z");
    const endpoints = [
      "/api/owner/submissions",
      `/api/owner/submissions/${submission.id}`,
      `/api/owner/submissions/${submission.id}/vcard`
    ];

    for (const endpoint of endpoints) {
      const response = await call(endpoint, null);
      expect(response.status).toBe(401);
      expect(response.headers.get("Cache-Control")).toBe("no-store");
      expect(await response.text()).not.toContain(submission.email);
    }
  });

  it("returns only summary fields for unexpired submissions, newest first", async () => {
    const older = await insertSubmission("Older Guest", "2026-10-01T12:00:00.000Z");
    const newer = await insertSubmission("Newer Guest", "2026-10-02T12:00:00.000Z");
    await insertSubmission("Expired Guest", "2026-10-03T12:00:00.000Z", "2026-10-04T00:00:00.000Z");

    const response = await call("/api/owner/submissions");
    const body = (await response.json()) as { submissions: Record<string, unknown>[] };

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(body.submissions).toEqual([
      {
        id: newer.id,
        name: newer.name,
        createdAt: newer.createdAt,
        expiresAt: newer.expiresAt
      },
      {
        id: older.id,
        name: older.name,
        createdAt: older.createdAt,
        expiresAt: older.expiresAt
      }
    ]);
    expect(JSON.stringify(body)).not.toContain(older.email);
    expect(JSON.stringify(body)).not.toContain(older.address);
    expect(JSON.stringify(body)).not.toContain(older.birthday);
    expect(JSON.stringify(body)).not.toContain(older.linkId);
  });

  it("returns an empty list when there are no retained submissions", async () => {
    const response = await call("/api/owner/submissions");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ submissions: [] });
  });

  it("returns full details for an unexpired submission and masks missing or expired IDs", async () => {
    const submission = await insertSubmission("Guest Contact", "2026-10-01T12:00:00.000Z");
    const response = await call(`/api/owner/submissions/${submission.id}`);

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({
      id: submission.id,
      name: submission.name,
      email: submission.email,
      address: submission.address,
      birthday: submission.birthday,
      phone: submission.phone,
      org: submission.org,
      title: submission.title,
      createdAt: submission.createdAt,
      expiresAt: submission.expiresAt
    });

    const expired = await insertSubmission(
      "Expired Contact",
      "2026-10-01T12:00:00.000Z",
      "2026-10-04T00:00:00.000Z"
    );
    const missingResponse = await call("/api/owner/submissions/not-a-real-id");
    const expiredResponse = await call(`/api/owner/submissions/${expired.id}`);

    expect(missingResponse.status).toBe(404);
    expect(await missingResponse.json()).toEqual(await expiredResponse.json());
    expect(expiredResponse.status).toBe(404);
  });

  it("generates an owner-authorized vCard from the stored submission", async () => {
    const submission = await insertSubmission("Guest, Contact", "2026-10-01T12:00:00.000Z");
    const response = await call(`/api/owner/submissions/${submission.id}/vcard`);
    const vcard = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("Content-Type")).toBe("text/vcard; version=3.0; charset=utf-8");
    expect(response.headers.get("Content-Disposition")).toBe(
      'attachment; filename="guest-contact.vcf"'
    );
    expect(response.headers.get("Referrer-Policy")).toBe("no-referrer");
    expect(vcard).toContain("VERSION:3.0\r\n");
    expect(vcard).toContain("FN:Guest\\, Contact\r\n");
    expect(vcard).toContain(`EMAIL:${submission.email}\r\n`);
    expect(vcard).toContain(`BDAY:${submission.birthday}\r\n`);
    expect(vcard).toContain(`TEL;TYPE=CELL,VOICE,PREF:${submission.phone}\r\n`);
    expect(vcard).toContain(`ADR;TYPE=home:;;${submission.address};;;;\r\n`);
    expect(vcard).toContain("ORG:Example\\, Inc.\\; Europe\r\n");
    expect(vcard).toContain("TITLE:Product designer\r\n");
    expect(vcard).not.toContain("PHOTO:");

    const expired = await insertSubmission(
      "Expired Contact",
      "2026-10-01T12:00:00.000Z",
      "2026-10-04T00:00:00.000Z"
    );
    const expiredResponse = await call(`/api/owner/submissions/${expired.id}/vcard`);
    expect(expiredResponse.status).toBe(404);
    expect(await expiredResponse.text()).not.toContain(expired.email);
  });

  it("omits unset organization and title from the guest vCard", async () => {
    const submission = await insertSubmission("Guest Without Optional Fields", "2026-10-01T12:00:00.000Z");
    await env.DB.prepare("UPDATE guest_submissions SET org = NULL, title = NULL WHERE id = ?")
      .bind(submission.id)
      .run();

    const response = await call(`/api/owner/submissions/${submission.id}/vcard`);
    const vcard = await response.text();

    expect(response.status).toBe(200);
    expect(vcard).not.toContain("ORG:");
    expect(vcard).not.toContain("TITLE:");
  });
});
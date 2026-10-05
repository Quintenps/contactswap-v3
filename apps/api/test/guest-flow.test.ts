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
  PUBLIC_APP_ORIGIN: "https://contactswap.pages.dev"
};
const profile = {
  name: "Quinten Example",
  email: "quinten@example.invalid",
  address: "123 Owner Street",
  birthday: "1990-02-28"
};
const submission = {
  name: "Guest Example",
  email: "guest@example.invalid",
  address: "456 Guest Street",
  birthday: "1988-06-12"
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

async function submit(token: string, body: unknown = submission): Promise<Response> {
  return call(`/api/guest/links/${token}/submissions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body)
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

  it("resolves an active token without exposing profile data and rejects unknown tokens", async () => {
    const { token } = await createGuestLink();
    const resolved = await call(`/api/guest/links/${token}`);
    const body = (await resolved.json()) as { vcardUrl: string };

    expect(resolved.status).toBe(200);
    expect(resolved.headers.get("Cache-Control")).toBe("no-store");
    expect(body.vcardUrl).toMatch(/^\/api\/guest\/vcard\/[\da-f-]{36}\/[A-Za-z\d_-]+$/i);
    expect(JSON.stringify(body)).not.toContain(profile.email);

    const unknown = await call("/api/guest/links/unknown-token");
    expect(unknown.status).toBe(404);
    expect(unknown.headers.get("Cache-Control")).toBe("no-store");
    expect(await unknown.json()).toEqual({
      error: { code: "guest_link_not_found", message: "The guest link was not found." }
    });
  });

  it("serves the current owner vCard only with an active link-scoped signature", async () => {
    const { token } = await createGuestLink();
    const resolved = (await (await call(`/api/guest/links/${token}`)).json()) as {
      vcardUrl: string;
    };
    const firstCard = await call(resolved.vcardUrl);

    expect(firstCard.status).toBe(200);
    expect(firstCard.headers.get("Content-Type")).toBe(
      "text/vcard; version=4.0; charset=utf-8"
    );
    expect(firstCard.headers.get("Content-Disposition")).toBe(
      'attachment; filename="contactswap-profile.vcf"'
    );
    expect(firstCard.headers.get("Cache-Control")).toBe("no-store");
    expect(firstCard.headers.get("Referrer-Policy")).toBe("no-referrer");
    expect(await firstCard.text()).toContain("FN:Quinten Example");

    await call("/api/owner/profile", {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${adminToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ ...profile, address: "Updated Owner Street" })
    });
    const currentCard = await call(resolved.vcardUrl);
    expect(await currentCard.text()).toContain("ADR;TYPE=home:;;Updated Owner Street;;;;");

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

  it("rejects missing, blank, malformed, and unsupported submission values without consuming the link", async () => {
    const { token } = await createGuestLink();
    const invalidBodies = [
      { ...submission, name: "   " },
      { ...submission, email: "not-an-email" },
      { ...submission, birthday: "2025-02-30" },
      { ...submission, extra: "unsupported" },
      { name: submission.name, email: submission.email, address: submission.address }
    ];

    for (const body of invalidBodies) {
      const response = await submit(token, body);
      expect(response.status).toBe(400);
      expect(response.headers.get("Cache-Control")).toBe("no-store");
      expect(JSON.stringify(await response.json())).not.toContain(submission.email);
    }

    expect((await submit(token, "{")).status).toBe(400);
    expect((await call(`/api/guest/links/${token}`)).status).toBe(200);
    expect(await env.DB.prepare("SELECT id FROM guest_submissions").first()).toBeNull();
  });

  it("atomically stores one submission, consumes the link, and schedules a private notification", async () => {
    const { token } = await createGuestLink();
    const response = await submit(token);

    expect(response.status).toBe(201);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({ success: true });
    expect((await call(`/api/guest/links/${token}`)).status).toBe(410);
    expect((await submit(token)).status).toBe(410);

    const stored = await env.DB.prepare(
      "SELECT name, email, address, birthday, created_at, expires_at FROM guest_submissions"
    ).first<Record<string, string>>();
    expect(stored).toMatchObject(submission);
    expect(Date.parse(stored!.expires_at) - Date.parse(stored!.created_at)).toBe(
      30 * 24 * 60 * 60 * 1000
    );
    expect(await env.DB.prepare("SELECT id FROM guest_submissions").all()).toMatchObject({
      results: [{ id: expect.any(String) }]
    });
    expect(await env.DB.prepare("SELECT id FROM notification_outbox").all()).toMatchObject({
      results: [{ id: expect.any(String) }]
    });
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

  it("sends only a generic summary and retries webhook failures", async () => {
    const { token } = await createGuestLink();
    await submit(token);
    const failedDelivery = vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("offline"));

    await runScheduledTasks(testEnv);

    expect(failedDelivery).toHaveBeenCalledTimes(1);
    const failedBody = JSON.parse(String(failedDelivery.mock.calls[0][1]?.body)) as {
      content: string;
    };
    expect(failedBody.content).toBe("A guest completed the ContactSwap contact form.");
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
    expect((await call(activeResolved.vcardUrl)).status).toBe(404);
  });
});

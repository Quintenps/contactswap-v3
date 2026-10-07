import { createExecutionContext } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import app from "../src/index";

const adminToken = "test-only-admin-token";
const linkSigningKey = "test-only-link-signing-key-with-32-bytes";
const testEnv: Env = {
  ...env,
  ADMIN_TOKEN: adminToken,
  LINK_SIGNING_KEY: linkSigningKey,
  PUBLIC_APP_ORIGIN: "https://contactswap.pages.dev"
};
const profile = {
  name: "Quinten Example",
  email: "quinten@example.invalid",
  address: "123 Example Street",
  birthday: "1990-02-28",
  phone: "+31600000000"
};

async function call(
  path: string,
  init: RequestInit = {},
  token: string | null = adminToken
): Promise<Response> {
  const headers = new Headers(init.headers);
  if (token !== null) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  return app.fetch(
    new Request(`http://contactswap.local${path}`, { ...init, headers }),
    testEnv,
    createExecutionContext()
  );
}

async function saveProfile(): Promise<void> {
  await call("/api/owner/profile", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(profile)
  });
}

async function createGuestLink(): Promise<{ guestToken: string; id: string }> {
  await saveProfile();
  const response = await call("/api/owner/links", { method: "POST" });
  const body = (await response.json()) as { guestUrl: string };
  const guestToken = new URL(body.guestUrl).pathname.split("/").at(-1) as string;
  const resolved = (await (
    await call(`/api/guest/links/${guestToken}`)
  ).json()) as { vcardUrl: string };
  const id = resolved.vcardUrl.split("/").at(-2) as string;
  return { guestToken, id };
}

async function revokeGuestLink(
  linkId: string,
  token: string | null = adminToken
): Promise<Response> {
  return call(
    `/api/owner/links/${linkId}`,
    { method: "DELETE" },
    token
  );
}

function guestSubmissionForm(): FormData {
  const form = new FormData();
  form.append("name", "Guest Example");
  form.append("email", "guest@example.invalid");
  form.append("address", "456 Guest Street");
  form.append("birthday", "1988-06-12");
  form.append("phone", "+31600000001");
  return form;
}

describe("owner guest-link API", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  beforeEach(async () => {
    await env.DB.prepare("DELETE FROM notification_outbox").run();
    await env.DB.prepare("DELETE FROM guest_submissions").run();
    await env.DB.prepare("DELETE FROM guest_links").run();
    await env.DB.prepare("DELETE FROM owner_profile").run();
  });

  it("requires owner authorization and creates no link when unauthorized", async () => {
    const response = await call("/api/owner/links", { method: "POST" }, null);

    expect(response.status).toBe(401);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await env.DB.prepare("SELECT id FROM guest_links").first()).toBeNull();
  });

  it("requires a saved owner profile before creating a link", async () => {
    const response = await call("/api/owner/links", { method: "POST" });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: {
        code: "profile_not_found",
        message: "No owner profile has been saved."
      }
    });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await env.DB.prepare("SELECT id FROM guest_links").first()).toBeNull();
  });

  it("creates unique guest URLs and link-scoped signatures without returning signatures", async () => {
    await saveProfile();

    const firstResponse = await call("/api/owner/links", { method: "POST" });
    const firstBody = (await firstResponse.json()) as { guestUrl: string };
    const secondResponse = await call("/api/owner/links", { method: "POST" });
    const secondBody = (await secondResponse.json()) as { guestUrl: string };
    const firstUrl = new URL(firstBody.guestUrl);
    const secondUrl = new URL(secondBody.guestUrl);

    expect(firstResponse.status).toBe(201);
    expect(secondResponse.status).toBe(201);
    expect(firstResponse.headers.get("Cache-Control")).toBe("no-store");
    expect(firstResponse.headers.get("Content-Type")).toContain("application/json");
    expect(firstUrl.origin).toBe("https://contactswap.pages.dev");
    expect(firstUrl.pathname).toMatch(/^\/token\/[A-Za-z0-9_-]{43}$/);
    expect(secondUrl.pathname).toMatch(/^\/token\/[A-Za-z0-9_-]{43}$/);
    expect(firstBody.guestUrl).not.toBe(secondBody.guestUrl);
    expect(firstBody.guestUrl).not.toContain("signature");

    const storedLinks = await env.DB.prepare(
      "SELECT token_hash, vcard_signature FROM guest_links ORDER BY created_at, id"
    ).all<{ token_hash: string; vcard_signature: string }>();
    expect(storedLinks.results).toHaveLength(2);
    expect(storedLinks.results[0].token_hash).not.toBe(firstUrl.pathname.split("/").at(-1));
    expect(storedLinks.results[0].vcard_signature).not.toBe(
      storedLinks.results[1].vcard_signature
    );
  });

  it("rejects a signing key shorter than 32 bytes without creating a link", async () => {
    await saveProfile();
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const response = await app.fetch(
      new Request("http://contactswap.local/api/owner/links", {
        method: "POST",
        headers: { Authorization: `Bearer ${adminToken}` }
      }),
      { ...testEnv, LINK_SIGNING_KEY: "short" },
      createExecutionContext()
    );

    expect(response.status).toBe(500);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("X-Request-ID")).toMatch(/^[\da-f-]{36}$/i);
    expect(await response.json()).toEqual({
      error: {
        code: "internal_error",
        message: "An unexpected error occurred."
      }
    });
    expect(errorLog).toHaveBeenCalledTimes(1);
    const logContext = errorLog.mock.calls[0][1] as {
      event: string;
      requestId: string;
      method: string;
      route: string;
      errorName: string;
      stackFrames: string[];
    };
    expect(logContext).toMatchObject({
      event: "api.unhandled_exception",
      requestId: response.headers.get("X-Request-ID"),
      method: "POST",
      route: "/api/owner/links",
      errorName: "Error"
    });
    expect(logContext.stackFrames.length).toBeGreaterThan(0);
    const serializedLogContext = JSON.stringify(logContext);
    expect(serializedLogContext).not.toContain("LINK_SIGNING_KEY");
    expect(serializedLogContext).not.toContain(linkSigningKey);
    expect(serializedLogContext).not.toContain(adminToken);
    expect(serializedLogContext).not.toContain("short");
    expect(await env.DB.prepare("SELECT id FROM guest_links").first()).toBeNull();
  });

  it("requires owner authorization to revoke a link", async () => {
    const { id } = await createGuestLink();

    const response = await revokeGuestLink(id, null);

    expect(response.status).toBe(401);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await env.DB.prepare("SELECT revoked_at FROM guest_links").first()).toEqual({
      revoked_at: null
    });
  });

  it("lists link IDs and states without exposing credentials", async () => {
    const empty = await call("/api/owner/links");
    expect(await empty.json()).toEqual({ links: [] });

    const activeLink = await createGuestLink();
    const consumedLink = await createGuestLink();
    const revokedLink = await createGuestLink();

    await call(`/api/guest/links/${consumedLink.guestToken}/submissions`, {
      method: "POST",
      body: guestSubmissionForm()
    });
    await revokeGuestLink(revokedLink.id);

    const response = await call("/api/owner/links");
    const body = (await response.json()) as {
      links: { id: string; createdAt: string; status: string }[];
    };

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(body.links).toEqual([
      { id: revokedLink.id, createdAt: expect.any(String), status: "revoked" },
      { id: consumedLink.id, createdAt: expect.any(String), status: "consumed" },
      { id: activeLink.id, createdAt: expect.any(String), status: "active" }
    ]);
    expect(JSON.stringify(body)).not.toContain(activeLink.guestToken);
    expect(JSON.stringify(body)).not.toContain(consumedLink.guestToken);
    expect(JSON.stringify(body)).not.toContain(revokedLink.guestToken);
    expect(JSON.stringify(body)).not.toContain("vcard_signature");

    const submissionList = (await (
      await call("/api/owner/submissions")
    ).json()) as { submissions: { id: string }[] };
    expect(submissionList.submissions[0].id).not.toBe(consumedLink.id);
    expect((await revokeGuestLink(submissionList.submissions[0].id)).status).toBe(404);

    const unauthorized = await call("/api/owner/links", {}, null);
    expect(unauthorized.status).toBe(401);
    expect(unauthorized.headers.get("Cache-Control")).toBe("no-store");
  });

  it("revokes a link, blocks its guest flow, and safely handles repeated revocation", async () => {
    const { guestToken, id } = await createGuestLink();
    const resolved = (await (
      await call(`/api/guest/links/${guestToken}`)
    ).json()) as { vcardUrl: string };

    const response = await revokeGuestLink(id);
    const revokedLink = await env.DB.prepare(
      "SELECT revoked_at, consumed_at FROM guest_links"
    ).first<{ revoked_at: string | null; consumed_at: string | null }>();

    expect(response.status).toBe(204);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.text()).toBe("");
    expect(revokedLink?.revoked_at).not.toBeNull();
    expect(revokedLink?.consumed_at).toBeNull();

    const repeatedResponse = await revokeGuestLink(id);
    const repeatedLink = await env.DB.prepare("SELECT revoked_at FROM guest_links").first<{
      revoked_at: string | null;
    }>();
    expect(repeatedResponse.status).toBe(204);
    expect(repeatedLink?.revoked_at).toBe(revokedLink?.revoked_at);

    expect((await call(`/api/guest/links/${guestToken}`)).status).toBe(410);
    expect((await call(resolved.vcardUrl)).status).toBe(404);
    expect(
      (
        await call(`/api/guest/links/${guestToken}/submissions`, {
          method: "POST",
          body: guestSubmissionForm()
        })
      ).status
    ).toBe(410);
    expect(await env.DB.prepare("SELECT id FROM guest_submissions").first()).toBeNull();
    expect(await env.DB.prepare("SELECT id FROM notification_outbox").first()).toBeNull();
  });

  it("rejects malformed and unknown revocation IDs", async () => {
    for (const linkId of ["not-a-uuid", "00000000-0000-0000-0000-00000000000g"]) {
      const response = await revokeGuestLink(linkId);
      expect(response.status).toBe(400);
      expect(response.headers.get("Cache-Control")).toBe("no-store");
    }

    const unknown = await revokeGuestLink("00000000-0000-4000-8000-000000000000");
    expect(unknown.status).toBe(404);
    expect(await unknown.json()).toEqual({
      error: { code: "guest_link_not_found", message: "The guest link was not found." }
    });
  });

  it("does not change a consumed link or its submission and notification", async () => {
    const { guestToken, id } = await createGuestLink();
    const submissionResponse = await call(`/api/guest/links/${guestToken}/submissions`, {
      method: "POST",
      body: guestSubmissionForm()
    });
    const before = await env.DB.prepare(
      "SELECT consumed_at, revoked_at FROM guest_links"
    ).first<{ consumed_at: string | null; revoked_at: string | null }>();

    const response = await revokeGuestLink(id);
    const after = await env.DB.prepare(
      "SELECT consumed_at, revoked_at FROM guest_links"
    ).first<{ consumed_at: string | null; revoked_at: string | null }>();

    expect(submissionResponse.status).toBe(201);
    expect(response.status).toBe(204);
    expect(after).toEqual(before);
    expect(await env.DB.prepare("SELECT id FROM guest_submissions").first()).not.toBeNull();
    expect(await env.DB.prepare("SELECT id FROM notification_outbox").first()).not.toBeNull();
  });

  it("serializes concurrent revocation and submission", async () => {
    const { guestToken, id } = await createGuestLink();
    const [revokeResponse, submissionResponse] = await Promise.all([
      revokeGuestLink(id),
      call(`/api/guest/links/${guestToken}/submissions`, {
        method: "POST",
        body: guestSubmissionForm()
      })
    ]);
    const link = await env.DB.prepare(
      "SELECT consumed_at, revoked_at FROM guest_links"
    ).first<{ consumed_at: string | null; revoked_at: string | null }>();
    const submissionCount = await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM guest_submissions"
    ).first<{ count: number }>();

    expect(revokeResponse.status).toBe(204);
    expect([201, 410]).toContain(submissionResponse.status);
    if (submissionResponse.status === 201) {
      expect(link?.consumed_at).not.toBeNull();
      expect(link?.revoked_at).toBeNull();
      expect(submissionCount?.count).toBe(1);
    } else {
      expect(link?.consumed_at).toBeNull();
      expect(link?.revoked_at).not.toBeNull();
      expect(submissionCount?.count).toBe(0);
    }
  });
});
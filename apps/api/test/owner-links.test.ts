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
  birthday: "1990-02-28"
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
    expect(firstUrl.pathname).toMatch(/^\/guest\/[A-Za-z0-9_-]{43}$/);
    expect(secondUrl.pathname).toMatch(/^\/guest\/[A-Za-z0-9_-]{43}$/);
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
});
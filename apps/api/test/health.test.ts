import { createExecutionContext } from "cloudflare:test";
import { exports } from "cloudflare:workers";
import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import app from "../src/index";

const testEnv: Env = { ...env, ADMIN_TOKEN: "test-only-admin-token" };

async function call(path: string, headers?: HeadersInit): Promise<Response> {
  return app.fetch(
    new Request(`http://contactswap.local${path}`, { headers }),
    testEnv,
    createExecutionContext()
  );
}

describe("GET /api/health", () => {
  it("returns HTTP 200 and a non-cacheable plain-text greeting", async () => {
    const response = await exports.default.fetch(
      "http://contactswap.local/api/health"
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe(
      "text/plain; charset=utf-8"
    );
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.text()).toBe("Hello, world!");
  });

  it("applies prefix middleware before returning not-found responses", async () => {
    const unauthorizedOwner = await call("/api/owner/not-a-route");
    expect(unauthorizedOwner.status).toBe(401);
    expect(unauthorizedOwner.headers.get("Cache-Control")).toBe("no-store");

    const authorizedOwner = await call("/api/owner/not-a-route", {
      Authorization: "Bearer test-only-admin-token"
    });
    expect(authorizedOwner.status).toBe(404);
    expect(authorizedOwner.headers.get("Cache-Control")).toBe("no-store");
    expect(await authorizedOwner.text()).toBe("Not found");

    const unknownGuest = await call("/api/guest/not-a-route");
    expect(unknownGuest.status).toBe(404);
    expect(unknownGuest.headers.get("Cache-Control")).toBe("no-store");
    expect(await unknownGuest.text()).toBe("Not found");
  });
});

describe("API CORS", () => {
  const pagesOrigin = "https://contactswap.quinten.dev";

  it("allows the Pages origin to read API responses and exposed headers", async () => {
    const response = await call("/api/health", { Origin: pagesOrigin });

    expect(response.status).toBe(200);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(pagesOrigin);
    expect(response.headers.get("Access-Control-Expose-Headers")).toContain("Content-Disposition");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("allows HTTPS subdomains matching the configured wildcard", async () => {
    const origin = "https://preview.quinten.dev";
    const response = await call("/api/health", { Origin: origin });

    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(origin);
  });

  it.each([
    "http://preview.quinten.dev",
    "https://quinten.dev",
    "https://notquinten.dev",
    "https://attacker.example"
  ])("does not allow origin %s through the wildcard", async (origin) => {
    const response = await call("/api/health", { Origin: origin });

    expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });

  it("answers the Pages owner's authenticated preflight before authorization", async () => {
    const response = await app.fetch(
      new Request("http://contactswap.local/api/owner/profile", {
        method: "OPTIONS",
        headers: {
          Origin: pagesOrigin,
          "Access-Control-Request-Method": "PUT",
          "Access-Control-Request-Headers": "authorization,content-type"
        }
      }),
      testEnv,
      createExecutionContext()
    );

    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(pagesOrigin);
    expect(response.headers.get("Access-Control-Allow-Methods")).toContain("PUT");
    expect(response.headers.get("Access-Control-Allow-Headers")).toContain("Authorization");
    expect(response.headers.get("Access-Control-Allow-Headers")).toContain("Content-Type");
    expect(response.headers.get("Access-Control-Allow-Credentials")).toBeNull();
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("does not allow any origin other than the configured Pages origin", async () => {
    const response = await call("/api/health", { Origin: "https://attacker.example" });

    expect(response.status).toBe(200);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });
});
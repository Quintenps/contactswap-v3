import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

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
});
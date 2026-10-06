import { createExecutionContext } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import app from "../src/index";

const adminToken = "test-only-admin-token";
const testEnv: Env = { ...env, ADMIN_TOKEN: adminToken };
const baseProfile = {
  name: "Quinten Example",
  email: "quinten@example.invalid",
  address: "12 Main St, Apt 3; East",
  birthday: "1990-02-28"
};

async function call(
  path: string,
  init: RequestInit = {},
  secret: string | null = adminToken
): Promise<Response> {
  const headers = new Headers(init.headers);
  if (secret !== null) {
    headers.set("Authorization", `Bearer ${secret}`);
  }

  return app.fetch(
    new Request(`http://contactswap.local${path}`, { ...init, headers }),
    testEnv,
    createExecutionContext()
  );
}

function profileRequest(profile: unknown): RequestInit {
  return {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(profile)
  };
}

describe("owner profile API", () => {
  beforeEach(async () => {
    await env.DB.prepare("DELETE FROM owner_profile").run();
  });

  it("requires owner authorization on profile and vCard endpoints", async () => {
    const endpoints = [
      ["/api/owner/profile", { method: "GET" }],
      ["/api/owner/profile", profileRequest(baseProfile)],
      ["/api/owner/profile/vcard", { method: "GET" }]
    ] as const;

    for (const [path, init] of endpoints) {
      const response = await call(path, init, null);
      expect(response.status).toBe(401);
      expect(response.headers.get("Cache-Control")).toBe("no-store");
      expect(await response.text()).not.toContain(baseProfile.email);
    }

    const invalidTokenResponse = await call("/api/owner/profile", {}, "incorrect-token");
    expect(invalidTokenResponse.status).toBe(401);
    expect(await env.DB.prepare("SELECT id FROM owner_profile").first()).toBeNull();
  });

  it("returns 404 until a profile has been saved", async () => {
    const response = await call("/api/owner/profile");
    const downloadResponse = await call("/api/owner/profile/vcard");

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: {
        code: "profile_not_found",
        message: "No owner profile has been saved."
      }
    });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(downloadResponse.status).toBe(404);
    expect(downloadResponse.headers.get("Cache-Control")).toBe("no-store");
  });

  it("creates, reads, and updates the single profile with its current vCard", async () => {
    const createResponse = await call(
      "/api/owner/profile",
      profileRequest(baseProfile)
    );
    expect(createResponse.status).toBe(200);
    expect(await createResponse.json()).toEqual({ ...baseProfile, hasPhoto: false });

    const readResponse = await call("/api/owner/profile");
    expect(readResponse.status).toBe(200);
    expect(readResponse.headers.get("Cache-Control")).toBe("no-store");
    expect(await readResponse.json()).toEqual({ ...baseProfile, hasPhoto: false });

    const downloadResponse = await call("/api/owner/profile/vcard");
    const initialVCard = await downloadResponse.text();
    expect(downloadResponse.status).toBe(200);
    expect(downloadResponse.headers.get("Content-Type")).toBe(
      "text/vcard; version=4.0; charset=utf-8"
    );
    expect(downloadResponse.headers.get("Content-Disposition")).toBe(
      'attachment; filename="contactswap-profile.vcf"'
    );
    expect(downloadResponse.headers.get("Cache-Control")).toBe("no-store");
    expect(initialVCard).toContain("VERSION:4.0\r\n");
    expect(initialVCard).toContain("FN:Quinten Example\r\n");
    expect(initialVCard).toContain("EMAIL:quinten@example.invalid\r\n");
    expect(initialVCard).toContain("BDAY:1990-02-28\r\n");
    expect(initialVCard).toContain("ADR;TYPE=home:;;12 Main St\\, Apt 3\\; East;;;;\r\n");

    const updatedProfile = { ...baseProfile, address: "99 New Street" };
    const updateResponse = await call(
      "/api/owner/profile",
      profileRequest(updatedProfile)
    );
    expect(updateResponse.status).toBe(200);
    expect(await updateResponse.json()).toEqual({ ...updatedProfile, hasPhoto: false });

    const updatedCardResponse = await call("/api/owner/profile/vcard");
    const updatedVCard = await updatedCardResponse.text();
    expect(updatedVCard).toContain("ADR;TYPE=home:;;99 New Street;;;;\r\n");
    expect(updatedVCard).not.toBe(initialVCard);

    const count = await env.DB.prepare("SELECT COUNT(*) AS count FROM owner_profile")
      .first<{ count: number }>();
    expect(count?.count).toBe(1);
  });

  it("rejects malformed and invalid profiles without changing saved data", async () => {
    await call("/api/owner/profile", profileRequest(baseProfile));

    const invalidRequests: RequestInit[] = [
      { ...profileRequest({ ...baseProfile, name: "   " }) },
      { ...profileRequest({ ...baseProfile, address: " " }) },
      { ...profileRequest({ name: baseProfile.name, email: baseProfile.email, birthday: baseProfile.birthday }) },
      { ...profileRequest({ ...baseProfile, email: "not-an-email" }) },
      { ...profileRequest({ ...baseProfile, birthday: "1990-02-30" }) },
      { ...profileRequest({ ...baseProfile, picture: "https://example.invalid/picture.jpg" }) },
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: "{"
      }
    ];

    for (const init of invalidRequests) {
      const response = await call("/api/owner/profile", init);
      expect(response.status).toBe(400);
      expect(response.headers.get("Cache-Control")).toBe("no-store");
    }

    const profileResponse = await call("/api/owner/profile");
    expect(await profileResponse.json()).toEqual({ ...baseProfile, hasPhoto: false });

    const stored = await env.DB.prepare("SELECT photo_key FROM owner_profile WHERE id = 1")
      .first<{ photo_key: string | null }>();
    expect(stored?.photo_key).toBeNull();
  });

  it("folds long UTF-8 vCard lines without exceeding 75 octets", async () => {
    const longName = "é".repeat(40);
    const response = await call(
      "/api/owner/profile",
      profileRequest({ ...baseProfile, name: longName })
    );
    expect(response.status).toBe(200);

    const downloadResponse = await call("/api/owner/profile/vcard");
    const lines = (await downloadResponse.text()).split("\r\n").filter(Boolean);
    const encoder = new TextEncoder();
    expect(lines.every((line) => encoder.encode(line).length <= 75)).toBe(true);
    expect(lines.some((line) => line.startsWith(" "))).toBe(true);
  });
});
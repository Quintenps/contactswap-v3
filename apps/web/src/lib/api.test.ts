// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { apiUrl, isGuestProfilePhotoPath, isGuestVCardPath } from "./api";

const workerOrigin = "https://contactswap-api.example.workers.dev";
const linkId = "123e4567-e89b-12d3-a456-426614174000";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("frontend API origin", () => {
  it("keeps relative API paths when no production origin is configured", () => {
    vi.stubEnv("VITE_API_BASE_URL", "");

    expect(apiUrl("/api/owner/profile")).toBe("/api/owner/profile");
    expect(isGuestVCardPath(`/api/guest/vcard/${linkId}/signature`)).toBe(true);
    expect(isGuestProfilePhotoPath(`/api/guest/profile-photo/${linkId}/signature`)).toBe(true);
  });

  it("resolves guest resource paths only against the configured API origin", () => {
    vi.stubEnv("VITE_API_BASE_URL", workerOrigin);
    const vcardPath = `/api/guest/vcard/${linkId}/signature`;
    const photoPath = `/api/guest/profile-photo/${linkId}/signature`;

    expect(apiUrl("/api/owner/profile")).toBe(`${workerOrigin}/api/owner/profile`);
    expect(apiUrl(`${workerOrigin}${vcardPath}`)).toBe(`${workerOrigin}${vcardPath}`);
    expect(isGuestVCardPath(vcardPath)).toBe(true);
    expect(isGuestVCardPath(`${workerOrigin}${vcardPath}`)).toBe(true);
    expect(isGuestVCardPath(`https://attacker.example${vcardPath}`)).toBe(false);
    expect(isGuestProfilePhotoPath(photoPath)).toBe(true);
    expect(isGuestProfilePhotoPath(`https://attacker.example${photoPath}`)).toBe(false);
  });

  it("rejects configured API URLs that are not HTTPS origins", () => {
    vi.stubEnv("VITE_API_BASE_URL", `${workerOrigin}/api`);

    expect(() => apiUrl("/api/owner/profile")).toThrow("VITE_API_BASE_URL must be an HTTPS origin.");
    expect(isGuestVCardPath(`/api/guest/vcard/${linkId}/signature`)).toBe(false);
  });

  it("does not configure an insecure HTTP API origin", () => {
    vi.stubEnv("VITE_API_BASE_URL", "http://contactswap-api.example.workers.dev");

    expect(() => apiUrl("/api/owner/profile")).toThrow("VITE_API_BASE_URL must be an HTTPS origin.");
  });
});

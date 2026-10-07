import type {
  GuestSubmission,
  OwnerProfile
} from "./api-types";

const encoder = new TextEncoder();
export const retentionMilliseconds = 30 * 24 * 60 * 60 * 1000;

export async function getPhoto(
  environment: Env,
  photoKey: string | null
): Promise<Uint8Array | undefined> {
  if (!photoKey) {
    return undefined;
  }

  const photo = await environment.PHOTOS.get(photoKey);
  if (!photo) {
    throw new Error("The photo object is missing.");
  }
  return new Uint8Array(await photo.arrayBuffer());
}

export function encodeBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

export async function hashGuestToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(token));
  return encodeBase64Url(new Uint8Array(digest));
}

export async function signVCardLink(linkId: string, signingKey: string): Promise<string> {
  if (encoder.encode(signingKey).byteLength < 32) {
    throw new Error("LINK_SIGNING_KEY must contain at least 32 bytes.");
  }

  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(signingKey),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(`vcard:${linkId}`));
  return encodeBase64Url(new Uint8Array(signature));
}

export function getPublicAppOrigin(value: string): URL {
  const origin = new URL(value);
  if (
    !["https:", "http:"].includes(origin.protocol) ||
    origin.username ||
    origin.password ||
    origin.pathname !== "/" ||
    origin.search ||
    origin.hash
  ) {
    throw new Error("PUBLIC_APP_ORIGIN must be an HTTP(S) origin.");
  }

  return origin;
}

function isValidBirthday(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number(value.slice(0, 4)) < 1) {
    return false;
  }

  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

export function isValidPhone(value: string): boolean {
  return /^\+[1-9]\d{1,14}$/.test(value);
}

export function parseProfile(value: unknown): OwnerProfile | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }

  const fields = value as Record<string, unknown>;
  if (["name", "email", "address", "birthday", "phone"].some((field) => typeof fields[field] !== "string")) {
    return null;
  }
  if (
    ["org", "title"].some(
      (field) =>
        Object.hasOwn(fields, field) &&
        fields[field] !== null &&
        typeof fields[field] !== "string"
    )
  ) {
    return null;
  }

  const profile = {
    name: (fields.name as string).trim(),
    email: (fields.email as string).trim(),
    address: (fields.address as string).trim(),
    birthday: (fields.birthday as string).trim(),
    phone: (fields.phone as string).trim(),
    org: typeof fields.org === "string" ? fields.org.trim() || null : null,
    title: typeof fields.title === "string" ? fields.title.trim() || null : null
  };

  if (
    !profile.name ||
    !profile.address ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profile.email) ||
    !isValidBirthday(profile.birthday) ||
    !isValidPhone(profile.phone) ||
    Object.hasOwn(fields, "picture")
  ) {
    return null;
  }

  return profile;
}

export function parseGuestSubmission(value: unknown): GuestSubmission | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }

  const fields = value as Record<string, unknown>;
  const allowedFields = new Set(["name", "email", "address", "birthday", "phone", "org", "title"]);
  if (Object.keys(fields).some((field) => !allowedFields.has(field))) {
    return null;
  }

  return parseProfile(fields);
}

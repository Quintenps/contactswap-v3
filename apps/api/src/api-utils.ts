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

const requiredProfileFields = [
  "firstName",
  "lastName",
  "email",
  "street",
  "city",
  "postalCode",
  "country",
  "birthday",
  "phone"
] as const;

const optionalProfileFields = ["org", "title"] as const;

export type ProfileFieldName =
  | (typeof requiredProfileFields)[number]
  | (typeof optionalProfileFields)[number];

export type ProfileValidationCode =
  | "required"
  | "invalid_value"
  | "invalid_email"
  | "invalid_birthday"
  | "future_birthday"
  | "invalid_phone"
  | "too_long"
  | "control_character";

export type ProfileFieldErrors = Partial<Record<ProfileFieldName, ProfileValidationCode>>;

export type ProfileValidationResult = {
  profile: OwnerProfile | null;
  fieldErrors: ProfileFieldErrors;
};

const controlCharacters = /[\u0000-\u001f\u007f-\u009f]/u;
const textFields = new Set<ProfileFieldName>([
  "firstName",
  "lastName",
  "street",
  "city",
  "postalCode",
  "country",
  "org",
  "title"
]);
const controlCharacterFields = new Set<ProfileFieldName>([...textFields, "email"]);
const titleCaseFields = new Set<ProfileFieldName>([
  "firstName",
  "lastName",
  "street",
  "city"
]);

function codePointLength(value: string): number {
  return Array.from(value).length;
}

function titleCaseWords(value: string): string {
  return value
    .split(/(\s+)/u)
    .map((word) =>
      /^\s+$/u.test(word)
        ? word
        : word.toLowerCase().replace(/\p{L}/u, (letter) => letter.toUpperCase())
    )
    .join("");
}

function normalizeProfileField(field: ProfileFieldName, value: string): string {
  if (titleCaseFields.has(field)) {
    return titleCaseWords(value);
  }
  if (field === "postalCode") {
    return value.toUpperCase();
  }
  return value;
}

function currentUtcDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export function formatDisplayName(firstName: string, lastName: string): string {
  return [firstName.trim(), lastName.trim()].filter(Boolean).join(" ");
}

export function validateProfile(value: unknown): ProfileValidationResult {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { profile: null, fieldErrors: {} };
  }

  const fields = value as Record<string, unknown>;
  const fieldErrors: ProfileFieldErrors = {};
  if (Object.hasOwn(fields, "picture")) {
    return { profile: null, fieldErrors };
  }

  const values: Record<ProfileFieldName, string> = {
    firstName: "",
    lastName: "",
    email: "",
    street: "",
    city: "",
    postalCode: "",
    country: "",
    birthday: "",
    phone: "",
    org: "",
    title: ""
  };
  for (const field of requiredProfileFields) {
    const value = fields[field];
    if (typeof value !== "string") {
      fieldErrors[field] = "required";
      values[field] = "";
      continue;
    }
    if (controlCharacterFields.has(field) && controlCharacters.test(value)) {
      fieldErrors[field] = "control_character";
    }
    const trimmed = value.trim();
    if (!trimmed && !fieldErrors[field]) {
      fieldErrors[field] = "required";
    }
    const normalized = normalizeProfileField(field, trimmed);
    if (!fieldErrors[field] && textFields.has(field) && codePointLength(normalized) > 255) {
      fieldErrors[field] = "too_long";
    }
    values[field] = normalized;
  }

  for (const field of optionalProfileFields) {
    const value = fields[field];
    if (value === undefined || value === null) {
      values[field] = "";
      continue;
    }
    if (typeof value !== "string") {
      fieldErrors[field] = "invalid_value";
      values[field] = "";
      continue;
    }
    if (controlCharacters.test(value)) {
      fieldErrors[field] = "control_character";
    }
    const trimmed = value.trim();
    if (!fieldErrors[field] && codePointLength(trimmed) > 255) {
      fieldErrors[field] = "too_long";
    }
    values[field] = trimmed;
  }

  if (!fieldErrors.email && values.email && codePointLength(values.email) > 254) {
    fieldErrors.email = "too_long";
  } else if (!fieldErrors.email && values.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(values.email)) {
    fieldErrors.email = "invalid_email";
  }

  if (!fieldErrors.birthday && values.birthday) {
    if (!isValidBirthday(values.birthday)) {
      fieldErrors.birthday = "invalid_birthday";
    } else if (values.birthday > currentUtcDate()) {
      fieldErrors.birthday = "future_birthday";
    }
  }

  if (!fieldErrors.phone && values.phone && !isValidPhone(values.phone)) {
    fieldErrors.phone = "invalid_phone";
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { profile: null, fieldErrors };
  }

  return {
    profile: {
      firstName: values.firstName,
      lastName: values.lastName,
      email: values.email,
      street: values.street,
      city: values.city,
      postalCode: values.postalCode,
      country: values.country,
      birthday: values.birthday,
      phone: values.phone,
      org: values.org || null,
      title: values.title || null
    },
    fieldErrors
  };
}

export function parseProfile(value: unknown): OwnerProfile | null {
  return validateProfile(value).profile;
}

export function validateGuestSubmission(value: unknown): ProfileValidationResult {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { profile: null, fieldErrors: {} };
  }

  const fields = value as Record<string, unknown>;
  const allowedFields = new Set([
    "firstName",
    "lastName",
    "email",
    "street",
    "city",
    "postalCode",
    "country",
    "birthday",
    "phone",
    "org",
    "title"
  ]);
  if (Object.keys(fields).some((field) => !allowedFields.has(field))) {
    return { profile: null, fieldErrors: {} };
  }

  return validateProfile(fields);
}

export function parseGuestSubmission(value: unknown): GuestSubmission | null {
  return validateGuestSubmission(value).profile;
}

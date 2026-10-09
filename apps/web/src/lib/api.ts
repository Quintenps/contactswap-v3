import type { FieldName, GuestLink, GuestLinkResolution, OwnerSubmission, Profile } from "../types";
import type { Language, MessageKey } from "./i18n";

export const tokenStorageKey = "contactswap-owner-token";

function getApiOrigin(): URL {
  const configuredOrigin = import.meta.env.VITE_API_BASE_URL?.trim();
  if (!configuredOrigin) return new URL(window.location.origin);

  const origin = new URL(configuredOrigin);
  if (
    origin.protocol !== "https:" ||
    origin.username ||
    origin.password ||
    origin.pathname !== "/" ||
    origin.search ||
    origin.hash
  ) {
    throw new Error("VITE_API_BASE_URL must be an HTTPS origin.");
  }

  return origin;
}

export function apiUrl(path: string): string {
  if (!path.startsWith("/api/") && !/^https?:\/\//i.test(path)) {
    throw new Error("API requests must use an /api/ path or an absolute API URL.");
  }

  const configuredOrigin = import.meta.env.VITE_API_BASE_URL?.trim();
  const origin = getApiOrigin();
  const url = new URL(path, origin);
  if (
    url.origin !== origin.origin ||
    !url.pathname.startsWith("/api/") ||
    url.username ||
    url.password
  ) {
    throw new Error("API request paths must stay on the configured API origin.");
  }

  return configuredOrigin ? url.toString() : path;
}

export function ownerAuthorization(token: string): string {
  return `Bearer ${token}`;
}

export class OwnerApiError extends Error {
  constructor(
    readonly status: number,
    readonly code?: string
  ) {
    super("Owner API request failed.");
  }
}

export function isGuestLinkList(value: unknown): value is { links: GuestLink[] } {
  if (typeof value !== "object" || value === null || !("links" in value) || !Array.isArray(value.links)) {
    return false;
  }
  return value.links.every((link: unknown) => {
    if (typeof link !== "object" || link === null) return false;
    const candidate = link as Record<string, unknown>;
    return (
      typeof candidate.id === "string" &&
      typeof candidate.createdAt === "string" &&
      (candidate.status === "active" || candidate.status === "consumed" || candidate.status === "revoked")
    );
  });
}

export function isGuestUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      /^\/token\/[^/]+$/.test(url.pathname) &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash
    );
  } catch {
    return false;
  }
}

export function getPublicGuestUrl(value: unknown): string | null {
  if (!isGuestUrl(value)) return null;

  const guestUrl = new URL(value);
  const configuredOrigin = import.meta.env.VITE_PUBLIC_APP_ORIGIN?.trim();
  if (!configuredOrigin) return guestUrl.toString();

  const publicOrigin = new URL(configuredOrigin);
  if (
    !["http:", "https:"].includes(publicOrigin.protocol) ||
    publicOrigin.username ||
    publicOrigin.password ||
    publicOrigin.pathname !== "/" ||
    publicOrigin.search ||
    publicOrigin.hash
  ) {
    throw new Error("VITE_PUBLIC_APP_ORIGIN must be an HTTP(S) origin.");
  }

  return new URL(guestUrl.pathname, publicOrigin).toString();
}

function isGuestApiPath(value: unknown, expectedPath: RegExp): value is string {
  if (typeof value !== "string" || value.startsWith("//")) return false;
  try {
    const origin = getApiOrigin();
    const url = new URL(value, origin);
    return (
      url.origin === origin.origin &&
      !url.username &&
      !url.password &&
      expectedPath.test(url.pathname) &&
      !url.search &&
      !url.hash
    );
  } catch {
    return false;
  }
}

export function isGuestVCardPath(value: unknown): value is string {
  return isGuestApiPath(value, /^\/api\/guest\/vcard\/[^/]+\/[^/]+$/);
}

export function isGuestProfilePhotoPath(value: unknown): value is string {
  return isGuestApiPath(value, /^\/api\/guest\/profile-photo\/[\da-f-]{36}\/[A-Za-z\d_-]+$/i);
}

export function isGuestLinkResolution(value: unknown): value is GuestLinkResolution {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.ownerName === "string" &&
    candidate.ownerName.trim().length > 0 &&
    (candidate.profilePhotoUrl === null || isGuestProfilePhotoPath(candidate.profilePhotoUrl)) &&
    isGuestVCardPath(candidate.vcardUrl) &&
    typeof candidate.submissionComplete === "boolean"
  );
}

export function isGuestSubmissionSuccess(value: unknown): value is { success: true } {
  return typeof value === "object" && value !== null && "success" in value && value.success === true;
}

export async function fetchOwnerLinks(token: string, signal?: AbortSignal): Promise<GuestLink[]> {
  const response = await fetch(apiUrl("/api/owner/links"), {
    headers: { Authorization: ownerAuthorization(token) },
    cache: "no-store",
    signal
  });
  if (!response.ok) throw new OwnerApiError(response.status, await errorCode(response));
  const payload: unknown = await response.json();
  if (!isGuestLinkList(payload)) throw new Error("Invalid link list response.");
  return payload.links;
}

export function isOwnerSubmissionList(value: unknown): value is { submissions: OwnerSubmission[] } {
  if (typeof value !== "object" || value === null || !("submissions" in value) || !Array.isArray(value.submissions)) {
    return false;
  }
  return value.submissions.every((submission: unknown) => {
    if (typeof submission !== "object" || submission === null) return false;
    const candidate = submission as Record<string, unknown>;
    return (
      typeof candidate.id === "string" &&
      candidate.id.length > 0 &&
      typeof candidate.name === "string" &&
      typeof candidate.createdAt === "string" &&
      typeof candidate.expiresAt === "string"
    );
  });
}

export async function fetchOwnerSubmissions(token: string, signal?: AbortSignal): Promise<OwnerSubmission[]> {
  const response = await fetch(apiUrl("/api/owner/submissions"), {
    headers: { Authorization: ownerAuthorization(token) },
    cache: "no-store",
    signal
  });
  if (!response.ok) throw new OwnerApiError(response.status, await errorCode(response));
  const payload: unknown = await response.json();
  if (!isOwnerSubmissionList(payload)) throw new Error("Invalid submission list response.");
  return payload.submissions;
}

export function isProfile(value: unknown): value is Profile {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.firstName === "string" &&
    typeof candidate.lastName === "string" &&
    typeof candidate.email === "string" &&
    typeof candidate.street === "string" &&
    typeof candidate.city === "string" &&
    typeof candidate.postalCode === "string" &&
    typeof candidate.country === "string" &&
    typeof candidate.birthday === "string" &&
    typeof candidate.phone === "string" &&
    (candidate.org === null || typeof candidate.org === "string") &&
    (candidate.title === null || typeof candidate.title === "string") &&
    typeof candidate.hasPhoto === "boolean"
  );
}

const profileFieldNames: readonly FieldName[] = [
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
];

const requiredFieldMessages: Partial<Record<FieldName, MessageKey>> = {
  firstName: "enterFirstName",
  lastName: "enterLastName",
  email: "enterEmail",
  street: "enterStreet",
  city: "enterCity",
  postalCode: "enterPostalCode",
  country: "enterCountry",
  birthday: "enterBirthday",
  phone: "enterPhone"
};

const validationCodeMessages: Record<string, MessageKey> = {
  invalid_value: "invalidFieldValue",
  invalid_email: "validEmail",
  invalid_birthday: "validBirthday",
  future_birthday: "futureBirthday",
  invalid_phone: "validPhone",
  too_long: "fieldTooLong",
  control_character: "controlCharactersNotAllowed"
};

export type ApiErrorDetails = {
  code?: string;
  fieldErrors: Partial<Record<FieldName, MessageKey>>;
};

export async function readApiError(response: Response): Promise<ApiErrorDetails> {
  const details: ApiErrorDetails = { fieldErrors: {} };
  try {
    const body: unknown = await response.json();
    if (typeof body === "object" && body !== null && "error" in body) {
      const error = body.error;
      if (typeof error === "object" && error !== null) {
        const candidate = error as Record<string, unknown>;
        if (typeof candidate.code === "string") {
          details.code = candidate.code;
        }
        if (typeof candidate.fields === "object" && candidate.fields !== null) {
          for (const [field, code] of Object.entries(candidate.fields)) {
            const name = profileFieldNames.find((profileField) => profileField === field);
            if (!name || typeof code !== "string") continue;
            details.fieldErrors[name] = code === "required"
              ? requiredFieldMessages[name] ?? "invalidFieldValue"
              : validationCodeMessages[code] ?? "invalidFieldValue";
          }
        }
      }
    }
  } catch {
    return details;
  }
  return details;
}

export async function errorCode(response: Response): Promise<string | undefined> {
  return (await readApiError(response)).code;
}

export function vCardFilename(contentDisposition: string | null): string {
  const match = contentDisposition?.match(/filename="([^"]+)"|filename=([^;]+)/i);
  const filename = match?.[1] ?? match?.[2]?.trim();
  return filename && /^[A-Za-z0-9_-][A-Za-z0-9._-]*\.vcf$/i.test(filename) && !filename.includes("..")
    ? filename
    : "contact.vcf";
}

export function guestSubmissionErrorKey(code: string | undefined): MessageKey {
  switch (code) {
    case "invalid_submission":
      return "guestInvalidSubmission";
    case "unsupported_photo_type":
      return "guestPictureTypeError";
    case "photo_too_large":
      return "guestPictureTooLarge";
    case "invalid_photo":
      return "guestInvalidPicture";
    default:
      return "guestSubmissionFallback";
  }
}

export function photoErrorKey(code: string | undefined): MessageKey {
  switch (code) {
    case "unsupported_photo_type":
      return "photoUseTypes";
    case "photo_too_large":
      return "photoTooLarge";
    case "invalid_photo":
      return "invalidPhoto";
    case "photo_changed":
      return "photoChanged";
    case "profile_not_found":
      return "saveProfileFirst";
    default:
      return "photoUpdateFailed";
  }
}

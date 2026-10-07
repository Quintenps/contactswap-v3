import type { GuestLink, OwnerSubmission, Profile } from "../types";

export const tokenStorageKey = "contactswap-owner-token";

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
      /^\/guest\/[^/]+$/.test(url.pathname) &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash
    );
  } catch {
    return false;
  }
}

export function isGuestVCardPath(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value, window.location.origin);
    return (
      url.origin === window.location.origin &&
      /^\/api\/guest\/vcard\/[^/]+\/[^/]+$/.test(url.pathname) &&
      !url.search &&
      !url.hash
    );
  } catch {
    return false;
  }
}

export function isGuestSubmissionSuccess(value: unknown): value is { success: true } {
  return typeof value === "object" && value !== null && "success" in value && value.success === true;
}

export async function fetchOwnerLinks(token: string, signal?: AbortSignal): Promise<GuestLink[]> {
  const response = await fetch("/api/owner/links", {
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
  const response = await fetch("/api/owner/submissions", {
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
    typeof candidate.name === "string" &&
    typeof candidate.email === "string" &&
    typeof candidate.address === "string" &&
    typeof candidate.birthday === "string" &&
    typeof candidate.phone === "string" &&
    typeof candidate.hasPhoto === "boolean"
  );
}

export async function errorCode(response: Response): Promise<string | undefined> {
  try {
    const body: unknown = await response.json();
    if (typeof body === "object" && body !== null && "error" in body) {
      const error = body.error;
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        typeof error.code === "string"
      ) {
        return error.code;
      }
    }
  } catch {
    return undefined;
  }
  return undefined;
}

export function formatCreatedAt(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.valueOf())) return "Date unavailable";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export function submissionVCardFilename(contentDisposition: string | null): string {
  const match = contentDisposition?.match(/filename="([^"]+)"|filename=([^;]+)/i);
  const filename = match?.[1] ?? match?.[2]?.trim();
  return filename && /^[A-Za-z0-9_-][A-Za-z0-9._-]*\.vcf$/i.test(filename) && !filename.includes("..")
    ? filename
    : "contactswap-submission.vcf";
}

export function guestSubmissionErrorMessage(code: string | undefined): string {
  switch (code) {
    case "invalid_submission":
      return "Check the required details and try again.";
    case "unsupported_photo_type":
      return "Use a JPEG, PNG, or WebP picture.";
    case "photo_too_large":
      return "That picture is too large. Choose a smaller one.";
    case "invalid_photo":
      return "That picture could not be used. Choose another image.";
    default:
      return "Your details could not be submitted. Try again.";
  }
}

export function photoErrorMessage(code: string | undefined): string {
  switch (code) {
    case "unsupported_photo_type":
      return "Use JPEG, PNG, or WebP.";
    case "photo_too_large":
      return "Image too large. Choose a smaller one.";
    case "invalid_photo":
      return "Invalid image. Choose JPEG, PNG, or WebP.";
    case "photo_changed":
      return "Photo changed. Reload and retry.";
    case "profile_not_found":
      return "Save profile first.";
    default:
      return "Photo update failed. Try again.";
  }
}

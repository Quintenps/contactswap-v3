import { useEffect, useRef, useState, type FormEvent } from "react";

type ProfileFields = {
  name: string;
  email: string;
  address: string;
  birthday: string;
};

type Profile = ProfileFields & { hasPhoto: boolean };
type FieldName = keyof ProfileFields;
type LinkStatus = "active" | "consumed" | "revoked";
type GuestLink = { id: string; createdAt: string; status: LinkStatus };
type View = "checking" | "login" | "loading" | "profile" | "links";
type GuestPageState = "loading" | "error" | "ready" | "unavailable" | "thank-you";

const tokenStorageKey = "contactswap-owner-token";
const linksPath = "/owner/links";
const fields: { name: FieldName; label: string; type: string; autoComplete: string }[] = [
  { name: "name", label: "Full name", type: "text", autoComplete: "name" },
  { name: "email", label: "Email address", type: "email", autoComplete: "email" },
  { name: "address", label: "Address", type: "text", autoComplete: "street-address" },
  { name: "birthday", label: "Birthday", type: "date", autoComplete: "bday" }
];

const emptyFields: ProfileFields = { name: "", email: "", address: "", birthday: "" };

function ownerAuthorization(token: string): string {
  return `Bearer ${token}`;
}

class OwnerApiError extends Error {
  constructor(
    readonly status: number,
    readonly code?: string
  ) {
    super("Owner API request failed.");
  }
}

function isGuestLinkList(value: unknown): value is { links: GuestLink[] } {
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

function isGuestUrl(value: unknown): value is string {
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

function guestTokenFromPath(pathname: string): string | null {
  return pathname.match(/^\/guest\/([^/]+)$/)?.[1] ?? null;
}

function isGuestVCardPath(value: unknown): value is string {
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

function isGuestSubmissionSuccess(value: unknown): value is { success: true } {
  return typeof value === "object" && value !== null && "success" in value && value.success === true;
}

function guestSubmissionErrorMessage(code: string | undefined): string {
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

async function fetchOwnerLinks(token: string, signal?: AbortSignal): Promise<GuestLink[]> {
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

function formatCreatedAt(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.valueOf())) return "Date unavailable";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function isProfile(value: unknown): value is Profile {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.name === "string" &&
    typeof candidate.email === "string" &&
    typeof candidate.address === "string" &&
    typeof candidate.birthday === "string" &&
    typeof candidate.hasPhoto === "boolean"
  );
}

async function errorCode(response: Response): Promise<string | undefined> {
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

function photoErrorMessage(code: string | undefined): string {
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

function validateProfile(values: ProfileFields): Partial<Record<FieldName, string>> {
  const errors: Partial<Record<FieldName, string>> = {};
  const trimmed = {
    name: values.name.trim(),
    email: values.email.trim(),
    address: values.address.trim(),
    birthday: values.birthday.trim()
  };

  if (!trimmed.name) errors.name = "Enter your name.";
  if (!trimmed.email) errors.email = "Enter your email address.";
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed.email)) {
    errors.email = "Enter a valid email address.";
  }
  if (!trimmed.address) errors.address = "Enter your address.";
  if (!trimmed.birthday) {
    errors.birthday = "Enter your birthday.";
  } else {
    const date = new Date(`${trimmed.birthday}T00:00:00.000Z`);
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(trimmed.birthday) ||
      Number(trimmed.birthday.slice(0, 4)) < 1 ||
      !Number.isFinite(date.valueOf()) ||
      date.toISOString().slice(0, 10) !== trimmed.birthday
    ) {
      errors.birthday = "Enter a valid birthday.";
    }
  }
  return errors;
}

export default function App() {
  const isGuestRoute = window.location.pathname.startsWith("/guest/");
  const guestToken = guestTokenFromPath(window.location.pathname);
  const [view, setView] = useState<View>("checking");
  const [tokenInput, setTokenInput] = useState("");
  const [activeToken, setActiveToken] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [values, setValues] = useState<ProfileFields>(emptyFields);
  const [hasPhoto, setHasPhoto] = useState(false);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoRevision, setPhotoRevision] = useState(0);
  const [message, setMessage] = useState("");
  const [guestLinks, setGuestLinks] = useState<GuestLink[]>([]);
  const [linksLoading, setLinksLoading] = useState(false);
  const [linkActionBusy, setLinkActionBusy] = useState<"create" | string | null>(null);
  const [linkMessage, setLinkMessage] = useState("");
  const [generatedGuestUrl, setGeneratedGuestUrl] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<FieldName, string>>>({});
  const [busy, setBusy] = useState<"save" | "upload" | "remove" | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const guestPictureInput = useRef<HTMLInputElement>(null);
  const guestFormPanel = useRef<HTMLElement>(null);
  const guestFormHeading = useRef<HTMLHeadingElement>(null);
  const [guestPageState, setGuestPageState] = useState<GuestPageState>(() =>
    isGuestRoute ? guestToken ? "loading" : "unavailable" : "loading"
  );
  const [guestRetry, setGuestRetry] = useState(0);
  const [guestVCardUrl, setGuestVCardUrl] = useState<string | null>(null);
  const [guestFormOpen, setGuestFormOpen] = useState(false);
  const [guestValues, setGuestValues] = useState<ProfileFields>(emptyFields);
  const [guestFieldErrors, setGuestFieldErrors] = useState<Partial<Record<FieldName, string>>>({});
  const [guestPictureError, setGuestPictureError] = useState("");
  const [guestMessage, setGuestMessage] = useState("");
  const [guestDownloading, setGuestDownloading] = useState(false);
  const [guestSubmitting, setGuestSubmitting] = useState(false);

  function setUnauthorized() {
    let storageCleared = true;
    try {
      window.localStorage.removeItem(tokenStorageKey);
    } catch {
      storageCleared = false;
    }
    setActiveToken(null);
    setTokenInput("");
    setProfile(null);
    setValues(emptyFields);
    setHasPhoto(false);
    setPhotoUrl(null);
    setGuestLinks([]);
    setLinkActionBusy(null);
    setLinkMessage("");
    setGeneratedGuestUrl(null);
    setView("login");
    setFieldErrors({});
    setBusy(null);
    setMessage(storageCleared
      ? "Unauthorized. Enter token."
      : "Unauthorized. Clear this site's storage, then enter token.");
  }

  function setAuthenticatedProfile(data: Profile | null, token: string) {
    let tokenRemembered = true;
    try {
      window.localStorage.setItem(tokenStorageKey, token);
    } catch {
      tokenRemembered = false;
    }
    setActiveToken(token);
    setTokenInput("");
    setProfile(data);
    setValues(data ? {
      name: data.name,
      email: data.email,
      address: data.address,
      birthday: data.birthday
    } : emptyFields);
    setHasPhoto(data?.hasPhoto ?? false);
    setView(window.location.pathname === linksPath ? "links" : "profile");
    setMessage(tokenRemembered
      ? data ? "" : "No profile yet."
      : "Signed in. Token not remembered.");
  }

  async function authenticate(token: string) {
    setView("loading");
    setMessage("");
    try {
      const response = await fetch("/api/owner/profile", {
        headers: { Authorization: ownerAuthorization(token) },
        cache: "no-store"
      });
      if (response.status === 401) {
        setUnauthorized();
        return;
      }
      if (response.status === 404 && (await errorCode(response)) === "profile_not_found") {
        setAuthenticatedProfile(null, token);
        return;
      }
      if (!response.ok) {
        setView("login");
        setMessage("Profile load failed. Try again.");
        return;
      }
      const data: unknown = await response.json();
      if (!isProfile(data)) {
        setView("login");
        setMessage("Invalid profile response.");
        return;
      }
      setAuthenticatedProfile(data, token);
    } catch {
      setView("login");
      setMessage("Connection failed. Try again.");
    }
  }

  useEffect(() => {
    if (isGuestRoute) return;

    let rememberedToken: string | null = null;
    try {
      rememberedToken = window.localStorage.getItem(tokenStorageKey);
    } catch {
      setView("login");
      setMessage("Browser storage unavailable. Enter token.");
      return;
    }
    if (rememberedToken) void authenticate(rememberedToken);
    else setView("login");
  }, []);

  useEffect(() => {
    if (!isGuestRoute || !guestToken) return;

    const token = guestToken;
    let cancelled = false;
    async function resolveGuestLink() {
      setGuestPageState("loading");
      setGuestMessage("");
      setGuestVCardUrl(null);
      try {
        const response = await fetch(`/api/guest/links/${encodeURIComponent(token)}`, {
          cache: "no-store",
          referrerPolicy: "no-referrer"
        });
        if (cancelled) return;
        if (response.status === 404 || response.status === 410) {
          setGuestPageState("unavailable");
          return;
        }
        if (!response.ok) {
          setGuestMessage("This link could not be loaded. Try again.");
          setGuestPageState("error");
          return;
        }
        const payload: unknown = await response.json();
        if (cancelled) return;
        if (
          typeof payload !== "object" ||
          payload === null ||
          !("vcardUrl" in payload) ||
          !isGuestVCardPath(payload.vcardUrl)
        ) {
          setGuestMessage("This link could not be loaded. Try again.");
          setGuestPageState("error");
          return;
        }
        setGuestVCardUrl(payload.vcardUrl);
        setGuestPageState("ready");
      } catch {
        if (!cancelled) {
          setGuestMessage("Connection failed. Check your connection and try again.");
          setGuestPageState("error");
        }
      }
    }
    void resolveGuestLink();
    return () => {
      cancelled = true;
    };
  }, [isGuestRoute, guestToken, guestRetry]);

  useEffect(() => {
    if (guestPageState === "ready" && guestFormOpen) {
      guestFormPanel.current?.scrollIntoView?.({ block: "start", behavior: "smooth" });
      guestFormHeading.current?.focus({ preventScroll: true });
    }
  }, [guestPageState, guestFormOpen]);

  useEffect(() => {
    if (!activeToken || !hasPhoto || view !== "profile") {
      setPhotoUrl(null);
      return;
    }

    const token = activeToken;
    let cancelled = false;
    let objectUrl: string | undefined;
    async function loadPhoto() {
      try {
        const response = await fetch("/api/owner/profile/photo", {
          headers: { Authorization: ownerAuthorization(token) },
          cache: "no-store"
        });
        if (cancelled) return;
        if (response.status === 401) {
          setUnauthorized();
          return;
        }
        if (response.status === 404) {
          setMessage("Photo unavailable.");
          return;
        }
        if (!response.ok) {
          setMessage("Preview failed.");
          return;
        }
        objectUrl = URL.createObjectURL(await response.blob());
        if (cancelled) {
          URL.revokeObjectURL(objectUrl);
          return;
        }
        setPhotoUrl(objectUrl);
      } catch {
        if (!cancelled) setMessage("Preview failed.");
      }
    }
    void loadPhoto();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [activeToken, hasPhoto, photoRevision, view]);

  useEffect(() => {
    if (!activeToken || view !== "links") return;

    const token = activeToken;
    const controller = new AbortController();
    setLinksLoading(true);
    setLinkMessage("");
    async function loadLinks() {
      try {
        setGuestLinks(await fetchOwnerLinks(token, controller.signal));
      } catch (error) {
        if (controller.signal.aborted) return;
        if (error instanceof OwnerApiError && error.status === 401) {
          setUnauthorized();
          return;
        }
        setLinkMessage("Links could not be loaded. Try again.");
      } finally {
        if (!controller.signal.aborted) setLinksLoading(false);
      }
    }
    void loadLinks();
    return () => controller.abort();
  }, [activeToken, view]);

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const token = tokenInput.trim();
    if (!token) {
      setMessage("Enter token.");
      return;
    }
    await authenticate(token);
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeToken || busy) return;
    const errors = validateProfile(values);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      setMessage("Check required fields.");
      return;
    }

    setBusy("save");
    setMessage("");
    const payload = {
      name: values.name.trim(),
      email: values.email.trim(),
      address: values.address.trim(),
      birthday: values.birthday.trim()
    };
    try {
      const response = await fetch("/api/owner/profile", {
        method: "PUT",
        headers: {
          Authorization: ownerAuthorization(activeToken),
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload),
        cache: "no-store"
      });
      if (response.status === 401) {
        setUnauthorized();
        return;
      }
      if (!response.ok) {
        const code = await errorCode(response);
        setMessage(
          code === "invalid_profile"
            ? "Check required fields, email, and birthday."
            : "Save failed. Changes kept."
        );
        return;
      }
      const data: unknown = await response.json();
      if (!isProfile(data)) {
        setMessage("Save not confirmed. Reload to check.");
        return;
      }
      setProfile(data);
      setValues({
        name: data.name,
        email: data.email,
        address: data.address,
        birthday: data.birthday
      });
      setHasPhoto(data.hasPhoto);
      setFieldErrors({});
      setMessage("Saved.");
    } catch {
      setMessage("Save failed. Changes kept.");
    } finally {
      setBusy(null);
    }
  }

  async function handlePhotoUpload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeToken || !profile || busy) return;
    const file = fileInput.current?.files?.[0];
    if (!file) {
      setMessage("Choose an image.");
      return;
    }
    const supportedTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!supportedTypes.includes(file.type)) {
      setMessage("Use JPEG, PNG, or WebP.");
      return;
    }

    setBusy("upload");
    setMessage("");
    try {
      const response = await fetch("/api/owner/profile/photo", {
        method: "PUT",
        headers: { Authorization: ownerAuthorization(activeToken), "Content-Type": file.type },
        body: file,
        cache: "no-store"
      });
      if (response.status === 401) {
        setUnauthorized();
        return;
      }
      if (!response.ok) {
        setMessage(photoErrorMessage(await errorCode(response)));
        return;
      }
      setHasPhoto(true);
      setPhotoUrl(null);
      setPhotoRevision((current) => current + 1);
      setMessage("Photo saved.");
      if (fileInput.current) fileInput.current.value = "";
    } catch {
      setMessage("Photo upload failed. Try again.");
    } finally {
      setBusy(null);
    }
  }

  async function handlePhotoRemoval() {
    if (!activeToken || !hasPhoto || busy) return;
    if (!window.confirm("Remove photo?")) return;

    setBusy("remove");
    setMessage("");
    try {
      const response = await fetch("/api/owner/profile/photo", {
        method: "DELETE",
        headers: { Authorization: ownerAuthorization(activeToken) },
        cache: "no-store"
      });
      if (response.status === 401) {
        setUnauthorized();
        return;
      }
      if (!response.ok) {
        const code = await errorCode(response);
        setMessage(
          code === "photo_not_found"
            ? "Photo unavailable. Reload."
            : "Photo removal failed. Try again."
        );
        return;
      }
      setHasPhoto(false);
      setProfile((current) => current ? { ...current, hasPhoto: false } : current);
      setMessage("Photo removed.");
    } catch {
      setMessage("Photo removal failed. Try again.");
    } finally {
      setBusy(null);
    }
  }

  async function handleCreateGuestLink() {
    if (!activeToken || linkActionBusy) return;
    if (!profile) {
      setLinkMessage("Save your owner profile before creating a link.");
      return;
    }

    setLinkActionBusy("create");
    setLinkMessage("");
    try {
      const response = await fetch("/api/owner/links", {
        method: "POST",
        headers: { Authorization: ownerAuthorization(activeToken) },
        cache: "no-store"
      });
      if (response.status === 401) {
        setUnauthorized();
        return;
      }
      if (response.status === 404 && (await errorCode(response)) === "profile_not_found") {
        setProfile(null);
        setLinkMessage("Save your owner profile before creating a link.");
        return;
      }
      if (!response.ok) {
        setLinkMessage("Link creation failed. Try again.");
        return;
      }

      const payload: unknown = await response.json();
      if (typeof payload !== "object" || payload === null || !("guestUrl" in payload) || !isGuestUrl(payload.guestUrl)) {
        setLinkMessage("The link was created, but its URL could not be displayed. Check the overview before retrying.");
        return;
      }

      setGeneratedGuestUrl(payload.guestUrl);
      try {
        setGuestLinks(await fetchOwnerLinks(activeToken));
        setLinkMessage("Link created. Copy the URL now; it cannot be retrieved from this overview later.");
      } catch (error) {
        if (error instanceof OwnerApiError && error.status === 401) {
          setUnauthorized();
          return;
        }
        setLinkMessage("Link created, but the overview could not be refreshed. Your URL is still available to copy.");
      }
    } catch {
      setLinkMessage("Link creation failed. Try again.");
    } finally {
      setLinkActionBusy(null);
    }
  }

  async function handleCopyGuestUrl() {
    if (!generatedGuestUrl) return;
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable.");
      await navigator.clipboard.writeText(generatedGuestUrl);
      setLinkMessage("Guest link copied.");
    } catch {
      const input = document.querySelector<HTMLInputElement>("#generated-guest-url");
      input?.focus();
      input?.select();
      setLinkMessage("Copy is unavailable. Select and copy the link below.");
    }
  }

  async function handleRevokeGuestLink(linkId: string) {
    if (!activeToken || linkActionBusy) return;
    if (!window.confirm("Revoke this link? It will stop working for guests, including its vCard link.")) return;

    setLinkActionBusy(linkId);
    setLinkMessage("");
    try {
      const response = await fetch(`/api/owner/links/${encodeURIComponent(linkId)}`, {
        method: "DELETE",
        headers: { Authorization: ownerAuthorization(activeToken) },
        cache: "no-store"
      });
      if (response.status === 401) {
        setUnauthorized();
        return;
      }
      if (!response.ok) {
        setLinkMessage("Link revocation failed. Try again.");
        return;
      }
      try {
        setGuestLinks(await fetchOwnerLinks(activeToken));
        setLinkMessage("Link status updated.");
      } catch (error) {
        if (error instanceof OwnerApiError && error.status === 401) {
          setUnauthorized();
          return;
        }
        setLinkMessage("Revocation request succeeded, but the link status could not be refreshed.");
      }
    } catch {
      setLinkMessage("Link revocation could not be confirmed. Refresh the overview before trying again.");
    } finally {
      setLinkActionBusy(null);
    }
  }

  function logout() {
    let storageCleared = true;
    try {
      window.localStorage.removeItem(tokenStorageKey);
    } catch {
      storageCleared = false;
    }
    setActiveToken(null);
    setTokenInput("");
    setProfile(null);
    setValues(emptyFields);
    setHasPhoto(false);
    setPhotoUrl(null);
    setGuestLinks([]);
    setLinkActionBusy(null);
    setLinkMessage("");
    setGeneratedGuestUrl(null);
    setFieldErrors({});
    setView("login");
    setMessage(storageCleared
      ? "Logged out."
      : "Logged out. Clear this site's storage.");
  }

  function markGuestLinkUnavailable() {
    setGuestPageState("unavailable");
    setGuestVCardUrl(null);
    setGuestFormOpen(false);
    setGuestValues(emptyFields);
    setGuestFieldErrors({});
    setGuestPictureError("");
    if (guestPictureInput.current) guestPictureInput.current.value = "";
  }

  async function handleGuestDownload(openForm: boolean) {
    if (openForm) setGuestFormOpen(true);
    if (!guestVCardUrl || guestDownloading) return;

    setGuestDownloading(true);
    setGuestMessage("");
    let downloadUrl: string | undefined;
    try {
      const response = await fetch(guestVCardUrl, {
        cache: "no-store",
        referrerPolicy: "no-referrer"
      });
      if (response.status === 404 || response.status === 410) {
        markGuestLinkUnavailable();
        return;
      }
      if (!response.ok) {
        setGuestMessage("The contact card could not be downloaded. Try again.");
        return;
      }
      const contentType = response.headers.get("Content-Type")?.toLowerCase() ?? "";
      const blob = await response.blob();
      if (!contentType.startsWith("text/vcard") || blob.size === 0) {
        setGuestMessage("The contact card could not be downloaded. Try again.");
        return;
      }

      downloadUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = downloadUrl;
      anchor.download = "contactswap-profile.vcf";
      anchor.rel = "noreferrer";
      anchor.referrerPolicy = "no-referrer";
      anchor.style.display = "none";
      document.body.append(anchor);
      try {
        anchor.click();
      } finally {
        anchor.remove();
      }
      const completedDownloadUrl = downloadUrl;
      window.setTimeout(() => URL.revokeObjectURL(completedDownloadUrl), 1000);
      downloadUrl = undefined;
    } catch {
      setGuestMessage("The contact card could not be downloaded. Check your connection and try again.");
    } finally {
      if (downloadUrl) URL.revokeObjectURL(downloadUrl);
      setGuestDownloading(false);
    }
  }

  async function handleGuestSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!guestToken || guestSubmitting || guestDownloading) return;

    const errors = validateProfile(guestValues);
    setGuestFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      setGuestMessage("Check the required details.");
      return;
    }

    const picture = guestPictureInput.current?.files?.[0];
    if (picture && !["image/jpeg", "image/png", "image/webp"].includes(picture.type)) {
      setGuestPictureError("Use a JPEG, PNG, or WebP picture.");
      return;
    }

    setGuestSubmitting(true);
    setGuestMessage("");
    const formData = new FormData();
    for (const field of fields) formData.append(field.name, guestValues[field.name].trim());
    if (picture) formData.append("picture", picture);

    try {
      const response = await fetch(
        `/api/guest/links/${encodeURIComponent(guestToken)}/submissions`,
        {
          method: "POST",
          body: formData,
          cache: "no-store",
          referrerPolicy: "no-referrer"
        }
      );
      if (response.status === 404 || response.status === 410) {
        markGuestLinkUnavailable();
        return;
      }
      if (!response.ok) {
        setGuestMessage(guestSubmissionErrorMessage(await errorCode(response)));
        return;
      }
      if (response.status !== 201) {
        setGuestMessage("Your submission could not be confirmed. Check the link before trying again.");
        return;
      }

      const payload: unknown = await response.json();
      if (!isGuestSubmissionSuccess(payload)) {
        setGuestMessage("Your submission could not be confirmed. Check the link before trying again.");
        return;
      }
      setGuestValues(emptyFields);
      setGuestFieldErrors({});
      setGuestPictureError("");
      setGuestFormOpen(false);
      setGuestVCardUrl(null);
      if (guestPictureInput.current) guestPictureInput.current.value = "";
      setGuestPageState("thank-you");
    } catch {
      setGuestMessage("Submission could not be confirmed. Check your connection and try again.");
    } finally {
      setGuestSubmitting(false);
    }
  }

  const hasUnsavedChanges = profile !== null && fields.some(({ name }) => values[name] !== profile[name]);

  if (isGuestRoute) {
    if (guestPageState === "loading") {
      return (
        <main className="shell guest-shell" aria-busy="true">
          <section className="panel guest-panel loading-panel" aria-live="polite">
            <p className="eyebrow">ContactSwap</p>
            <h1>Loading your link…</h1>
          </section>
        </main>
      );
    }

    if (guestPageState === "unavailable") {
      return (
        <main className="shell guest-shell guest-state-shell">
          <section
            className="panel guest-panel guest-state-panel guest-state-unavailable"
            aria-labelledby="guest-unavailable-heading"
            role="status"
          >
            <span className="guest-state-emoji" aria-hidden="true">💌</span>
            <p className="eyebrow">ContactSwap</p>
            <h1 id="guest-unavailable-heading">This link isn't available</h1>
            <p className="section-description">Ask the person who shared it with you for a fresh link.</p>
          </section>
        </main>
      );
    }

    if (guestPageState === "thank-you") {
      return (
        <main className="shell guest-shell guest-state-shell">
          <section className="panel guest-panel guest-state-panel guest-state-thank-you" aria-labelledby="guest-thank-you-heading">
            <span className="guest-state-emoji" aria-hidden="true">🎉</span>
            <p className="eyebrow">ContactSwap</p>
            <h1 id="guest-thank-you-heading">Thanks for sharing!</h1>
            <p className="section-description">You're all set. Your details have been shared.</p>
          </section>
        </main>
      );
    }

    if (guestPageState === "error") {
      return (
        <main className="shell guest-shell guest-state-shell">
          <section className="panel guest-panel guest-state-panel guest-state-error" aria-labelledby="guest-error-heading">
            <span className="guest-state-emoji" aria-hidden="true">🌱</span>
            <p className="eyebrow">ContactSwap</p>
            <h1 id="guest-error-heading">A little hiccup</h1>
            <p className="notice" role="alert">{guestMessage}</p>
            <button
              className="primary-button guest-retry-button"
              type="button"
              onClick={() => setGuestRetry((current) => current + 1)}
            >
              Try again
            </button>
          </section>
        </main>
      );
    }

    return (
      <main className="shell guest-shell">
        <header className="guest-header">
          <p className="eyebrow">ContactSwap</p>
          <h1>Stay in touch</h1>
          <p className="section-description">
            Download Quinten's contact card, and share your details if you'd like to stay in touch.
          </p>
        </header>

        {guestFormOpen && (
          <section
            className="panel guest-panel guest-form-panel"
            aria-labelledby="guest-form-heading"
            ref={guestFormPanel}
          >
            <div className="guest-form-header">
              <div>
                <h2 id="guest-form-heading" ref={guestFormHeading} tabIndex={-1}>Share your details</h2>
                <p className="section-description">All fields are required except your picture.</p>
              </div>
              <button
                className="quiet-button guest-close-button"
                type="button"
                onClick={() => setGuestFormOpen(false)}
                disabled={guestSubmitting}
              >
                Close
              </button>
            </div>

            <form id="guest-details-form" className="guest-form" onSubmit={handleGuestSubmit} noValidate>
              <div className="profile-form guest-profile-form">
                {fields.map(({ name, label, type, autoComplete }) => (
                  <div className="field" key={name}>
                    <label htmlFor={`guest-${name}`}>{label}<span aria-hidden="true"> *</span></label>
                    <input
                      id={`guest-${name}`}
                      name={name}
                      type={type}
                      autoComplete={autoComplete}
                      value={guestValues[name]}
                      required
                      aria-invalid={Boolean(guestFieldErrors[name])}
                      aria-describedby={guestFieldErrors[name] ? `guest-${name}-error` : undefined}
                      onChange={(event) => {
                        setGuestValues((current) => ({ ...current, [name]: event.target.value }));
                        setGuestFieldErrors((current) => ({ ...current, [name]: undefined }));
                        setGuestMessage("");
                      }}
                    />
                    {guestFieldErrors[name] && (
                      <span className="field-error" id={`guest-${name}-error`}>{guestFieldErrors[name]}</span>
                    )}
                  </div>
                ))}
              </div>

              <div className="field guest-picture-field">
                <label htmlFor="guest-picture">Picture <span>(optional)</span></label>
                <input
                  id="guest-picture"
                  ref={guestPictureInput}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  aria-describedby={guestPictureError ? "guest-picture-error" : undefined}
                  onChange={(event) => {
                    const picture = event.currentTarget.files?.[0];
                    if (picture && !["image/jpeg", "image/png", "image/webp"].includes(picture.type)) {
                      event.currentTarget.value = "";
                      setGuestPictureError("Use a JPEG, PNG, or WebP picture.");
                      return;
                    }
                    setGuestPictureError("");
                  }}
                />
                {guestPictureError && (
                  <span className="field-error" id="guest-picture-error">{guestPictureError}</span>
                )}
              </div>

              {guestMessage && <p className="notice" role="alert" aria-live="polite">{guestMessage}</p>}
              <div className="guest-form-actions">
                <button
                  className="primary-button"
                  type="submit"
                  disabled={guestSubmitting || guestDownloading}
                >
                  {guestSubmitting ? "Sending…" : "Share my details"}
                </button>
              </div>
            </form>
          </section>
        )}

        <section className="panel guest-panel" aria-labelledby="guest-actions-heading">
          <h2 id="guest-actions-heading">Choose what works for you</h2>
          <p className="section-description">
            The first option downloads Quinten's card and opens a form. Your details are only sent if you submit it.
          </p>
          {guestMessage && !guestFormOpen && (
            <p className="notice" role="status" aria-live="polite">{guestMessage}</p>
          )}
          <div className="guest-actions">
            <button
              className="primary-button guest-primary-action"
              type="button"
              onClick={() => void handleGuestDownload(true)}
              disabled={!guestVCardUrl || guestDownloading}
            >
              {guestDownloading && guestFormOpen ? "Preparing your download…" : "Download and share your details"}
            </button>
            <button
              className="secondary-button guest-secondary-action"
              type="button"
              onClick={() => void handleGuestDownload(false)}
              disabled={!guestVCardUrl || guestDownloading}
            >
              {guestDownloading && !guestFormOpen ? "Preparing your download…" : "Download Quinten's contact card only"}
            </button>
          </div>
        </section>
      </main>
    );
  }

  if (view === "checking" || view === "loading") {
    return (
      <main className="shell" aria-busy="true">
        <section className="panel loading-panel" aria-live="polite">
          <p className="eyebrow">ContactSwap</p>
          <h1>Loading…</h1>
        </section>
      </main>
    );
  }

  if (view === "login") {
    return (
      <main className="shell">
        <section className="panel login-panel" aria-labelledby="login-title">
          <p className="eyebrow">ContactSwap</p>
          <h1 id="login-title">Owner</h1>
          <form onSubmit={handleLogin} className="stack">
            <label htmlFor="owner-token">Token</label>
            <input
              id="owner-token"
              type="password"
              autoComplete="current-password"
              value={tokenInput}
              onChange={(event) => setTokenInput(event.target.value)}
              required
            />
            <button className="primary-button" type="submit">
              Continue
            </button>
          </form>
          {message && <p className="notice" role="alert">{message}</p>}
        </section>
      </main>
    );
  }

  if (view === "links") {
    return (
      <main className="shell profile-shell">
        <header className="page-header">
          <div>
            <p className="eyebrow">ContactSwap</p>
            <h1>Guest links</h1>
          </div>
          <div className="page-actions">
            <nav className="owner-navigation" aria-label="Owner navigation">
              <a className="nav-button" href="/">Profile</a>
              <a className="nav-button nav-button-active" href={linksPath} aria-current="page">Guest links</a>
              <button className="nav-button owner-nav-logout" type="button" onClick={logout}>Log out</button>
            </nav>
          </div>
        </header>

        {linkMessage && <p className="notice page-notice" role="status" aria-live="polite">{linkMessage}</p>}

        <section className="panel links-panel" aria-labelledby="links-heading">
          <div className="section-heading">
            <div>
              <h2 id="links-heading">Your links</h2>
              <p className="section-description">Active links do not expire by age. Each link can be used for one successful submission.</p>
            </div>
          </div>
          {!profile && (
            <p className="notice" role="status">
              Save your owner profile before creating a guest link. <a href="/">Go to your profile</a>
            </p>
          )}
          <button
            className="primary-button create-link-button"
            type="button"
            onClick={() => void handleCreateGuestLink()}
            disabled={!profile || linkActionBusy !== null}
          >
            {linkActionBusy === "create" ? "Creating…" : "Generate new link"}
          </button>

          {generatedGuestUrl && (
            <div className="generated-link" aria-labelledby="generated-link-heading">
              <h3 id="generated-link-heading">Your new guest link</h3>
              <p>Copy and share this URL now. It will not be available from the overview later.</p>
              <label className="visually-hidden" htmlFor="generated-guest-url">New guest link URL</label>
              <input id="generated-guest-url" type="text" value={generatedGuestUrl} readOnly />
              <button className="secondary-button" type="button" onClick={() => void handleCopyGuestUrl()}>
                Copy link
              </button>
            </div>
          )}

          <h3 className="links-subheading">Overview</h3>
          {linksLoading ? (
            <p aria-live="polite">Loading links…</p>
          ) : guestLinks.length === 0 ? (
            <p>No guest links yet. Generate one when you are ready to share your contact card.</p>
          ) : (
            <ul className="link-list">
              {guestLinks.map((link) => (
                <li className="link-card" key={link.id}>
                  <div className="link-card-content">
                    <p><span className="link-label">Created</span> {formatCreatedAt(link.createdAt)}</p>
                    <p><span className="link-label">Link ID</span> <code>{link.id}</code></p>
                    <span className={`state-pill link-status status-${link.status}`}>{link.status}</span>
                  </div>
                  {link.status === "active" && (
                    <button
                      className="danger-button"
                      type="button"
                      onClick={() => void handleRevokeGuestLink(link.id)}
                      disabled={linkActionBusy !== null}
                    >
                      {linkActionBusy === link.id ? "Revoking…" : "Revoke"}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    );
  }

  return (
    <main className="shell profile-shell">
      <header className="page-header">
        <div>
          <p className="eyebrow">ContactSwap</p>
          <h1>Profile</h1>
        </div>
        <div className="page-actions">
          <nav className="owner-navigation" aria-label="Owner navigation">
            <a className="nav-button nav-button-active" href="/" aria-current="page">Profile</a>
            <a className="nav-button" href={linksPath}>Guest links</a>
            <button className="nav-button owner-nav-logout" type="button" onClick={logout}>Log out</button>
          </nav>
        </div>
      </header>

      {message && <p className="notice page-notice" role="status" aria-live="polite">{message}</p>}

      <section className="panel photo-panel" aria-labelledby="photo-heading">
        <div className="section-heading">
          <div>
            <h2 id="photo-heading">Photo</h2>
          </div>
          <span className="state-pill">{hasPhoto ? "Added" : "None"}</span>
        </div>
        {hasPhoto && (
          <div className="photo-preview">
            {photoUrl
              ? <img src={photoUrl} alt="Profile photo" />
              : <span className="preview-placeholder" aria-live="polite">Loading…</span>}
          </div>
        )}
        <form className="photo-form" onSubmit={handlePhotoUpload}>
          <input
            id="profile-photo"
            ref={fileInput}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            aria-label="Profile photo"
            disabled={!profile || busy !== null}
          />
          <div className="photo-actions">
            <button className="secondary-button" type="submit" disabled={!profile || busy !== null}>
              {busy === "upload" ? "Uploading…" : hasPhoto ? "Replace" : "Upload"}
            </button>
            {hasPhoto && (
              <button
                className="danger-button"
                type="button"
                onClick={handlePhotoRemoval}
                disabled={busy !== null}
              >
                {busy === "remove" ? "Removing…" : "Remove"}
              </button>
            )}
          </div>
        </form>
      </section>

      <section className="panel profile-panel" aria-labelledby="profile-heading">
        <div className="section-heading">
          <div>
            <h2 id="profile-heading">Contact details</h2>
          </div>
          <span className={`state-pill ${hasUnsavedChanges ? "state-unsaved" : ""}`}>
            {!profile ? "New" : hasUnsavedChanges ? "Unsaved" : "Saved"}
          </span>
        </div>

        <form onSubmit={handleSave} className="profile-form" noValidate>
          {fields.map(({ name, label, type, autoComplete }) => (
            <div className="field" key={name}>
              <label htmlFor={name}>{label}<span aria-hidden="true"> *</span></label>
              <input
                id={name}
                name={name}
                type={type}
                autoComplete={autoComplete}
                value={values[name]}
                required
                aria-invalid={Boolean(fieldErrors[name])}
                aria-describedby={fieldErrors[name] ? `${name}-error` : undefined}
                onChange={(event) => {
                  setValues((current) => ({ ...current, [name]: event.target.value }));
                  setFieldErrors((current) => ({ ...current, [name]: undefined }));
                  setMessage("");
                }}
              />
              {fieldErrors[name] && <span className="field-error" id={`${name}-error`}>{fieldErrors[name]}</span>}
            </div>
          ))}
          <div className="form-actions">
            <button className="primary-button" type="submit" disabled={busy === "save" || busy !== null}>
              {busy === "save" ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}

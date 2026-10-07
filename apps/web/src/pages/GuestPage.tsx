import { useEffect, useRef, useState, type FormEvent } from "react";
import { useParams } from "react-router-dom";
import {
  errorCode,
  guestSubmissionErrorMessage,
  isGuestSubmissionSuccess,
  isGuestVCardPath
} from "../lib/api";
import { emptyFields, fields, validateProfile } from "../lib/forms";
import type { FieldName, GuestPageState, ProfileFields } from "../types";

export default function GuestPage() {
  const { token = "" } = useParams();
  const [guestPageState, setGuestPageState] = useState<GuestPageState>("loading");
  const [guestRetry, setGuestRetry] = useState(0);
  const [guestVCardUrl, setGuestVCardUrl] = useState<string | null>(null);
  const [guestFormOpen, setGuestFormOpen] = useState(false);
  const [guestValues, setGuestValues] = useState<ProfileFields>(emptyFields);
  const [guestFieldErrors, setGuestFieldErrors] = useState<Partial<Record<FieldName, string>>>({});
  const [guestPictureError, setGuestPictureError] = useState("");
  const [guestMessage, setGuestMessage] = useState("");
  const [guestDownloading, setGuestDownloading] = useState(false);
  const [guestSubmitting, setGuestSubmitting] = useState(false);
  const guestPictureInput = useRef<HTMLInputElement>(null);
  const guestFormPanel = useRef<HTMLElement>(null);
  const guestFormHeading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (!token) {
      setGuestPageState("unavailable");
      return;
    }

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
  }, [token, guestRetry]);

  useEffect(() => {
    if (guestPageState === "ready" && guestFormOpen) {
      guestFormPanel.current?.scrollIntoView?.({ block: "start", behavior: "smooth" });
      guestFormHeading.current?.focus({ preventScroll: true });
    }
  }, [guestPageState, guestFormOpen]);

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
    if (!token || guestSubmitting || guestDownloading) return;

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
        `/api/guest/links/${encodeURIComponent(token)}/submissions`,
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
        <section className="panel guest-panel guest-form-panel" aria-labelledby="guest-form-heading" ref={guestFormPanel}>
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
              {fields.map(({ name, label, type, autoComplete, hint, placeholder }) => (
                <div className="field" key={name}>
                  <label htmlFor={`guest-${name}`}>{label}<span aria-hidden="true"> *</span></label>
                  <input
                    id={`guest-${name}`}
                    name={name}
                    type={type}
                    autoComplete={autoComplete}
                    placeholder={placeholder}
                    inputMode={name === "phone" ? "tel" : undefined}
                    value={guestValues[name]}
                    required
                    aria-invalid={Boolean(guestFieldErrors[name])}
                    aria-describedby={[
                      hint ? `guest-${name}-hint` : undefined,
                      guestFieldErrors[name] ? `guest-${name}-error` : undefined
                    ].filter(Boolean).join(" ") || undefined}
                    onChange={(event) => {
                      setGuestValues((current) => ({ ...current, [name]: event.target.value }));
                      setGuestFieldErrors((current) => ({ ...current, [name]: undefined }));
                      setGuestMessage("");
                    }}
                  />
                  {hint && <span className="field-hint" id={`guest-${name}-hint`}>{hint} Example: {placeholder}</span>}
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
              <button className="primary-button" type="submit" disabled={guestSubmitting || guestDownloading}>
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

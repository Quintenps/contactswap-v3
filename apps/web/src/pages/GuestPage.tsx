import { useEffect, useRef, useState, type FormEvent } from "react";
import { useParams } from "react-router-dom";
import {
  errorCode,
  guestSubmissionErrorKey,
  isGuestLinkResolution,
  isGuestSubmissionSuccess
} from "../lib/api";
import { emptyFields, fields, validateProfile } from "../lib/forms";
import { vCardFilename } from "../lib/api";
import { useLanguage, type MessageKey } from "../lib/i18n";
import type { FieldName, GuestPageState, ProfileFields } from "../types";

const guestExampleKeys: Record<FieldName, MessageKey> = {
  name: "guestExampleName",
  email: "guestExampleEmail",
  address: "guestExampleAddress",
  birthday: "guestExampleBirthday",
  phone: "guestExamplePhone"
};

export default function GuestPage() {
  const { token = "" } = useParams();
  const { t } = useLanguage();
  const [guestPageState, setGuestPageState] = useState<GuestPageState>("loading");
  const [guestRetry, setGuestRetry] = useState(0);
  const [ownerName, setOwnerName] = useState("");
  const [ownerProfilePhotoUrl, setOwnerProfilePhotoUrl] = useState<string | null>(null);
  const [ownerProfilePhotoFailed, setOwnerProfilePhotoFailed] = useState(false);
  const [guestVCardUrl, setGuestVCardUrl] = useState<string | null>(null);
  const [guestFormOpen, setGuestFormOpen] = useState(false);
  const [guestValues, setGuestValues] = useState<ProfileFields>(emptyFields);
  const [guestFieldErrors, setGuestFieldErrors] = useState<Partial<Record<FieldName, MessageKey>>>({});
  const [guestPictureError, setGuestPictureError] = useState<MessageKey | "">("");
  const [guestMessage, setGuestMessage] = useState<MessageKey | "">("");
  const [guestDownloading, setGuestDownloading] = useState(false);
  const [guestDownloadMode, setGuestDownloadMode] = useState<"share" | "card-only" | null>(null);
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
      setOwnerName("");
      setOwnerProfilePhotoUrl(null);
      setOwnerProfilePhotoFailed(false);
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
          setGuestMessage("linkCouldNotLoad");
          setGuestPageState("error");
          return;
        }
        const payload: unknown = await response.json();
        if (cancelled) return;
        if (!isGuestLinkResolution(payload)) {
          setGuestMessage("linkCouldNotLoad");
          setGuestPageState("error");
          return;
        }
        setOwnerName(payload.ownerName);
        setOwnerProfilePhotoUrl(payload.profilePhotoUrl);
        setGuestVCardUrl(payload.vcardUrl);
        setGuestPageState("ready");
      } catch {
        if (!cancelled) {
          setGuestMessage("guestConnectionFailed");
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
    setGuestDownloadMode(openForm ? "share" : "card-only");
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
        setGuestMessage("guestCardCouldNotDownload");
        return;
      }
      const contentType = response.headers.get("Content-Type")?.toLowerCase() ?? "";
      const blob = await response.blob();
      if (!contentType.startsWith("text/vcard") || blob.size === 0) {
        setGuestMessage("guestCardCouldNotDownload");
        return;
      }

      downloadUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = downloadUrl;
      anchor.download = vCardFilename(response.headers.get("Content-Disposition"));
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
      setGuestMessage("guestCardDownloadConnectionFailed");
    } finally {
      if (downloadUrl) URL.revokeObjectURL(downloadUrl);
      setGuestDownloading(false);
      setGuestDownloadMode(null);
    }
  }

  async function handleGuestSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || guestSubmitting || guestDownloading) return;

    const errors = validateProfile(guestValues);
    setGuestFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      setGuestMessage("checkRequiredDetails");
      return;
    }

    const picture = guestPictureInput.current?.files?.[0];
    if (picture && !["image/jpeg", "image/png", "image/webp"].includes(picture.type)) {
      setGuestPictureError("guestPictureTypeError");
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
        setGuestMessage(guestSubmissionErrorKey(await errorCode(response)));
        return;
      }
      if (response.status !== 201) {
        setGuestMessage("guestSubmissionCouldNotConfirm");
        return;
      }

      const payload: unknown = await response.json();
      if (!isGuestSubmissionSuccess(payload)) {
        setGuestMessage("guestSubmissionCouldNotConfirm");
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
      setGuestMessage("guestSubmissionConnectionFailed");
    } finally {
      setGuestSubmitting(false);
    }
  }

  if (guestPageState === "loading") {
    return (
      <main className="shell guest-shell" aria-busy="true">
        <section className="panel guest-panel loading-panel" aria-live="polite">
          <p className="eyebrow">ContactSwap</p>
          <h1>{t("linkLoading")}</h1>
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
          <h1 id="guest-unavailable-heading">{t("linkUnavailable")}</h1>
          <p className="section-description">{t("requestFreshLink")}</p>
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
          <h1 id="guest-thank-you-heading">{t("thanksForSharing")}</h1>
          <p className="section-description">{t("detailsShared")}</p>
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
          <h1 id="guest-error-heading">{t("guestErrorTitle")}</h1>
          <p className="notice" role="alert">{t(guestMessage || "linkCouldNotLoad")}</p>
          <button
            className="primary-button guest-retry-button"
            type="button"
            onClick={() => setGuestRetry((current) => current + 1)}
          >
            {t("retry")}
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="shell guest-shell">
      {!guestFormOpen && (
        <>
          <header className="guest-header">
            <p className="eyebrow">ContactSwap</p>
            <h1>{t("guestCardHeading")}</h1>
            <p className="section-description">{t("guestCardDescription")}</p>
          </header>

          <section className="panel guest-panel guest-owner-card" aria-labelledby="guest-owner-name">
            <div className="guest-owner-avatar" aria-hidden="true">
              {ownerProfilePhotoUrl && !ownerProfilePhotoFailed ? (
                <img
                  src={ownerProfilePhotoUrl}
                  alt=""
                  referrerPolicy="no-referrer"
                  onError={() => setOwnerProfilePhotoFailed(true)}
                />
              ) : (
                ownerName
                  .trim()
                  .split(/\s+/)
                  .map((part) => part.charAt(0))
                  .slice(0, 2)
                  .join("")
                  .toUpperCase()
              )}
            </div>
            <div className="guest-owner-card-copy">
              <p className="guest-owner-card-label">{t("upToDateCard")}</p>
              <h2 id="guest-owner-name" className="guest-owner-name">{ownerName}</h2>
            </div>
          </section>
        </>
      )}

      {guestFormOpen && (
        <section className="panel guest-panel guest-form-panel" aria-labelledby="guest-form-heading" ref={guestFormPanel}>
          <div className="guest-form-header">
            <div>
              <p className="eyebrow">ContactSwap</p>
              <h1 id="guest-form-heading" ref={guestFormHeading} tabIndex={-1}>
                {t("shareDetailsHeading", { ownerName })}
              </h1>
              <p className="section-description">
                {t("guestFormPrivacy")}
              </p>
            </div>
            <button
              className="quiet-button guest-close-button"
              type="button"
              onClick={() => setGuestFormOpen(false)}
              disabled={guestSubmitting}
            >
              {t("close")}
            </button>
          </div>

          <form id="guest-details-form" className="guest-form" onSubmit={handleGuestSubmit} noValidate>
            <div className="profile-form guest-profile-form">
              {fields.map(({ name, labelKey, type, autoComplete, hintKey }) => {
                const example = t(guestExampleKeys[name]);
                return (
                  <div className="field" key={name}>
                    <label htmlFor={`guest-${name}`}>{t(labelKey)}<span aria-hidden="true"> *</span></label>
                    <input
                      id={`guest-${name}`}
                      name={name}
                      type={type}
                      autoComplete={autoComplete}
                      placeholder={example}
                      inputMode={name === "phone" ? "tel" : undefined}
                      value={guestValues[name]}
                      required
                      aria-invalid={Boolean(guestFieldErrors[name])}
                      aria-describedby={[
                        hintKey ? `guest-${name}-hint` : undefined,
                        guestFieldErrors[name] ? `guest-${name}-error` : undefined
                      ].filter(Boolean).join(" ") || undefined}
                      onChange={(event) => {
                        setGuestValues((current) => ({ ...current, [name]: event.target.value }));
                        setGuestFieldErrors((current) => ({ ...current, [name]: undefined }));
                        setGuestMessage("");
                      }}
                    />
                    {hintKey && <span className="field-hint" id={`guest-${name}-hint`}>{t("guestPhoneHint", { example })}</span>}
                    {guestFieldErrors[name] && (
                      <span className="field-error" id={`guest-${name}-error`}>{t(guestFieldErrors[name])}</span>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="field guest-picture-field">
              <label htmlFor="guest-picture">{t("guestPicture")} <span>({t("optional")})</span></label>
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
                    setGuestPictureError("guestPictureTypeError");
                    return;
                  }
                  setGuestPictureError("");
                }}
              />
              {guestPictureError && (
                <span className="field-error" id="guest-picture-error">{t(guestPictureError)}</span>
              )}
            </div>

            {guestMessage && <p className="notice" role="alert" aria-live="polite">{t(guestMessage)}</p>}
            <div className="guest-form-actions">
              <button className="primary-button" type="submit" disabled={guestSubmitting || guestDownloading}>
                {guestSubmitting ? t("sending") : t("shareMyDetails")}
              </button>
            </div>
          </form>
        </section>
      )}

      {!guestFormOpen && (
        <section className="panel guest-panel guest-download-panel" aria-labelledby="guest-actions-heading">
          <h2 id="guest-actions-heading">{t("takeDetailsWithYou")}</h2>
          <p className="section-description">
            {t("guestDownloadDescription")}
          </p>
          {guestMessage && (
            <p className="notice" role="status" aria-live="polite">{t(guestMessage)}</p>
          )}
          <div className="guest-actions">
            <button
              className="primary-button guest-primary-action"
              type="button"
              onClick={() => void handleGuestDownload(true)}
              disabled={!guestVCardUrl || guestDownloading}
            >
              {guestDownloading && guestDownloadMode === "share"
                ? t("preparingDownload")
                : t("downloadAndShare")}
            </button>
            <button
              className="secondary-button guest-secondary-action"
              type="button"
              onClick={() => void handleGuestDownload(false)}
              disabled={!guestVCardUrl || guestDownloading}
            >
              {guestDownloading && guestDownloadMode === "card-only"
                ? t("preparingDownload")
                : t("downloadCardOnly")}
            </button>
          </div>
        </section>
      )}
    </main>
  );
}

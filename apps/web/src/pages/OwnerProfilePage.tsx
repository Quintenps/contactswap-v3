import { useEffect, useRef, useState, type FormEvent } from "react";
import { OwnerPageHeader, useOwnerSession } from "../app/OwnerSession";
import { errorCode, isProfile, ownerAuthorization, photoErrorKey } from "../lib/api";
import { emptyFields, fields, validateProfile } from "../lib/forms";
import { useLanguage, type MessageKey } from "../lib/i18n";
import type { FieldName, ProfileFields } from "../types";

export default function OwnerProfilePage() {
  const { token, profile, setProfile, unauthorized } = useOwnerSession();
  const { t } = useLanguage();
  const [values, setValues] = useState<ProfileFields>(() => profile
    ? {
        name: profile.name,
        email: profile.email,
        address: profile.address,
        birthday: profile.birthday,
        phone: profile.phone,
        org: profile.org ?? "",
        title: profile.title ?? ""
      }
    : emptyFields);
  const [hasPhoto, setHasPhoto] = useState(profile?.hasPhoto ?? false);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoRevision, setPhotoRevision] = useState(0);
  const [message, setMessage] = useState<MessageKey | "">(profile ? "" : "noProfileYet");
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<FieldName, MessageKey>>>({});
  const [busy, setBusy] = useState<"save" | "upload" | "remove" | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (profile) {
      setValues({
        name: profile.name,
        email: profile.email,
        address: profile.address,
        birthday: profile.birthday,
        phone: profile.phone,
        org: profile.org ?? "",
        title: profile.title ?? ""
      });
      setHasPhoto(profile.hasPhoto);
    } else {
      setValues(emptyFields);
      setHasPhoto(false);
    }
  }, [profile]);

  useEffect(() => {
    if (!token || !hasPhoto) {
      setPhotoUrl(null);
      return;
    }

    const activeToken = token;
    let cancelled = false;
    let objectUrl: string | undefined;
    async function loadPhoto() {
      try {
        const response = await fetch("/api/owner/profile/photo", {
          headers: { Authorization: ownerAuthorization(activeToken) },
          cache: "no-store"
        });
        if (cancelled) return;
        if (response.status === 401) {
          unauthorized();
          return;
        }
        if (response.status === 404) {
          setMessage("photoUnavailable");
          return;
        }
        if (!response.ok) {
          setMessage("previewFailed");
          return;
        }
        objectUrl = URL.createObjectURL(await response.blob());
        if (cancelled) {
          URL.revokeObjectURL(objectUrl);
          return;
        }
        setPhotoUrl(objectUrl);
      } catch {
        if (!cancelled) setMessage("previewFailed");
      }
    }
    void loadPhoto();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [token, hasPhoto, photoRevision]);

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || busy) return;
    const errors = validateProfile(values);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      setMessage("checkRequiredFields");
      return;
    }

    setBusy("save");
    setMessage("");
    const payload = {
      name: values.name.trim(),
      email: values.email.trim(),
      address: values.address.trim(),
      birthday: values.birthday.trim(),
      phone: values.phone.trim(),
      org: values.org.trim() || null,
      title: values.title.trim() || null
    };
    try {
      const response = await fetch("/api/owner/profile", {
        method: "PUT",
        headers: {
          Authorization: ownerAuthorization(token),
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload),
        cache: "no-store"
      });
      if (response.status === 401) {
        unauthorized();
        return;
      }
      if (!response.ok) {
        const code = await errorCode(response);
        setMessage(
          code === "invalid_profile"
            ? "invalidProfileFields"
            : "saveFailedChangesKept"
        );
        return;
      }
      const data: unknown = await response.json();
      if (!isProfile(data)) {
        setMessage("saveNotConfirmed");
        return;
      }
      setProfile(data);
      setFieldErrors({});
      setMessage("saved");
    } catch {
      setMessage("saveFailedChangesKept");
    } finally {
      setBusy(null);
    }
  }

  async function handlePhotoUpload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !profile || busy) return;
    const file = fileInput.current?.files?.[0];
    if (!file) {
      setMessage("chooseImage");
      return;
    }
    const supportedTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!supportedTypes.includes(file.type)) {
      setMessage("useImageTypes");
      return;
    }

    setBusy("upload");
    setMessage("");
    try {
      const response = await fetch("/api/owner/profile/photo", {
        method: "PUT",
        headers: { Authorization: ownerAuthorization(token), "Content-Type": file.type },
        body: file,
        cache: "no-store"
      });
      if (response.status === 401) {
        unauthorized();
        return;
      }
      if (!response.ok) {
        setMessage(photoErrorKey(await errorCode(response)));
        return;
      }
      setProfile((current) => current ? { ...current, hasPhoto: true } : current);
      setHasPhoto(true);
      setPhotoUrl(null);
      setPhotoRevision((current) => current + 1);
      setMessage("photoSaved");
      if (fileInput.current) fileInput.current.value = "";
    } catch {
      setMessage("photoUploadFailed");
    } finally {
      setBusy(null);
    }
  }

  async function handlePhotoRemoval() {
    if (!token || !hasPhoto || busy) return;
    if (!window.confirm(t("removePhotoConfirmation"))) return;

    setBusy("remove");
    setMessage("");
    try {
      const response = await fetch("/api/owner/profile/photo", {
        method: "DELETE",
        headers: { Authorization: ownerAuthorization(token) },
        cache: "no-store"
      });
      if (response.status === 401) {
        unauthorized();
        return;
      }
      if (!response.ok) {
        const code = await errorCode(response);
        setMessage(code === "photo_not_found" ? "photoNotFoundReload" : "photoRemovalFailed");
        return;
      }
      setHasPhoto(false);
      setProfile((current) => current ? { ...current, hasPhoto: false } : current);
      setMessage("photoRemoved");
    } catch {
      setMessage("photoRemovalFailed");
    } finally {
      setBusy(null);
    }
  }

  const hasUnsavedChanges = profile !== null && fields.some(
    ({ name }) => values[name] !== (profile[name] ?? "")
  );

  const renderField = ({ name, labelKey, type, autoComplete, hintKey, placeholder, placeholderKey, optional }: (typeof fields)[number]) => (
    <div className={`field ${name === "address" ? "profile-field-wide" : ""}`} key={name}>
      <label htmlFor={name}>
        {t(labelKey)}{" "}
        {optional ? <span>({t("optional")})</span> : <span aria-hidden="true"> *</span>}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        autoComplete={autoComplete}
        placeholder={placeholderKey ? t(placeholderKey) : placeholder}
        inputMode={name === "phone" ? "tel" : undefined}
        value={values[name] ?? ""}
        required={!optional}
        aria-invalid={Boolean(fieldErrors[name])}
        aria-describedby={[
          hintKey ? `${name}-hint` : undefined,
          fieldErrors[name] ? `${name}-error` : undefined
        ].filter(Boolean).join(" ") || undefined}
        onChange={(event) => {
          setValues((current) => ({ ...current, [name]: event.target.value }));
          setFieldErrors((current) => ({ ...current, [name]: undefined }));
          setMessage("");
        }}
      />
      {hintKey && <span className="field-hint" id={`${name}-hint`}>{t(hintKey)} {t("exampleWithValue", { example: placeholder ?? "" })}</span>}
      {fieldErrors[name] && <span className="field-error" id={`${name}-error`}>{t(fieldErrors[name])}</span>}
    </div>
  );

  return (
    <main className="shell profile-shell">
      <OwnerPageHeader title={t("profile")} />
      {message && <p className="notice page-notice" role="status" aria-live="polite">{t(message)}</p>}

      <section className="panel photo-panel" aria-labelledby="photo-heading">
        <div className="section-heading">
          <div><h2 id="photo-heading">{t("photo")}</h2></div>
          <span className="state-pill">{hasPhoto ? t("photoAdded") : t("photoNone")}</span>
        </div>
        {hasPhoto && (
          <div className="photo-preview">
            {photoUrl
              ? <img src={photoUrl} alt={t("profilePhotoAlt")} />
              : <span className="preview-placeholder" aria-live="polite">{t("uploadingPreview")}</span>}
          </div>
        )}
        <form className="photo-form" onSubmit={handlePhotoUpload}>
          <input
            id="profile-photo"
            ref={fileInput}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            aria-label={t("profilePhotoAlt")}
            disabled={!profile || busy !== null}
          />
          <div className="photo-actions">
            <button className="secondary-button" type="submit" disabled={!profile || busy !== null}>
              {busy === "upload" ? t("uploading") : hasPhoto ? t("replacing") : t("upload")}
            </button>
            {hasPhoto && (
              <button className="danger-button" type="button" onClick={handlePhotoRemoval} disabled={busy !== null}>
                {busy === "remove" ? t("removing") : t("remove")}
              </button>
            )}
          </div>
        </form>
      </section>

      <section className="panel profile-panel" aria-labelledby="profile-heading">
        <div className="section-heading">
          <div><h2 id="profile-heading">{t("contactDetails")}</h2></div>
          <span className={`state-pill ${hasUnsavedChanges ? "state-unsaved" : ""}`}>
            {!profile ? t("new") : hasUnsavedChanges ? t("unsaved") : t("saved")}
          </span>
        </div>
        <form onSubmit={handleSave} className="profile-form" noValidate>
          <fieldset className="profile-form-section">
            <legend>{t("profileContactSection")}</legend>
            <div className="profile-form-fields">
              {fields.filter(({ optional }) => !optional).map(renderField)}
            </div>
          </fieldset>
          <fieldset className="profile-form-section">
            <legend>{t("profileWorkSection")}</legend>
            <div className="profile-form-fields">
              {fields.filter(({ optional }) => optional).map(renderField)}
            </div>
          </fieldset>
          <div className="form-actions">
            <button className="primary-button" type="submit" disabled={busy !== null}>
              {busy === "save" ? t("saving") : t("save")}
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}

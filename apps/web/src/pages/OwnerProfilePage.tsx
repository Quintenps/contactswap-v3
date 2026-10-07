import { useEffect, useRef, useState, type FormEvent } from "react";
import { OwnerPageHeader, useOwnerSession } from "../app/OwnerSession";
import { errorCode, isProfile, ownerAuthorization, photoErrorMessage } from "../lib/api";
import { emptyFields, fields, validateProfile } from "../lib/forms";
import type { FieldName, ProfileFields } from "../types";

export default function OwnerProfilePage() {
  const { token, profile, setProfile, unauthorized } = useOwnerSession();
  const [values, setValues] = useState<ProfileFields>(() => profile
    ? { name: profile.name, email: profile.email, address: profile.address, birthday: profile.birthday, phone: profile.phone }
    : emptyFields);
  const [hasPhoto, setHasPhoto] = useState(profile?.hasPhoto ?? false);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoRevision, setPhotoRevision] = useState(0);
  const [message, setMessage] = useState(profile ? "" : "No profile yet.");
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<FieldName, string>>>({});
  const [busy, setBusy] = useState<"save" | "upload" | "remove" | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (profile) {
      setValues({
        name: profile.name,
        email: profile.email,
        address: profile.address,
        birthday: profile.birthday,
        phone: profile.phone
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
  }, [token, hasPhoto, photoRevision]);

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || busy) return;
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
      birthday: values.birthday.trim(),
      phone: values.phone.trim()
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
            ? "Check required fields, email, birthday, and phone number."
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
    if (!token || !profile || busy) return;
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
        headers: { Authorization: ownerAuthorization(token), "Content-Type": file.type },
        body: file,
        cache: "no-store"
      });
      if (response.status === 401) {
        unauthorized();
        return;
      }
      if (!response.ok) {
        setMessage(photoErrorMessage(await errorCode(response)));
        return;
      }
      setProfile((current) => current ? { ...current, hasPhoto: true } : current);
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
    if (!token || !hasPhoto || busy) return;
    if (!window.confirm("Remove photo?")) return;

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
        setMessage(code === "photo_not_found" ? "Photo unavailable. Reload." : "Photo removal failed. Try again.");
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

  const hasUnsavedChanges = profile !== null && fields.some(({ name }) => values[name] !== profile[name]);

  return (
    <main className="shell profile-shell">
      <OwnerPageHeader title="Profile" />
      {message && <p className="notice page-notice" role="status" aria-live="polite">{message}</p>}

      <section className="panel photo-panel" aria-labelledby="photo-heading">
        <div className="section-heading">
          <div><h2 id="photo-heading">Photo</h2></div>
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
              <button className="danger-button" type="button" onClick={handlePhotoRemoval} disabled={busy !== null}>
                {busy === "remove" ? "Removing…" : "Remove"}
              </button>
            )}
          </div>
        </form>
      </section>

      <section className="panel profile-panel" aria-labelledby="profile-heading">
        <div className="section-heading">
          <div><h2 id="profile-heading">Contact details</h2></div>
          <span className={`state-pill ${hasUnsavedChanges ? "state-unsaved" : ""}`}>
            {!profile ? "New" : hasUnsavedChanges ? "Unsaved" : "Saved"}
          </span>
        </div>
        <form onSubmit={handleSave} className="profile-form" noValidate>
          {fields.map(({ name, label, type, autoComplete, hint, placeholder }) => (
            <div className="field" key={name}>
              <label htmlFor={name}>{label}<span aria-hidden="true"> *</span></label>
              <input
                id={name}
                name={name}
                type={type}
                autoComplete={autoComplete}
                placeholder={placeholder}
                inputMode={name === "phone" ? "tel" : undefined}
                value={values[name]}
                required
                aria-invalid={Boolean(fieldErrors[name])}
                aria-describedby={[
                  hint ? `${name}-hint` : undefined,
                  fieldErrors[name] ? `${name}-error` : undefined
                ].filter(Boolean).join(" ") || undefined}
                onChange={(event) => {
                  setValues((current) => ({ ...current, [name]: event.target.value }));
                  setFieldErrors((current) => ({ ...current, [name]: undefined }));
                  setMessage("");
                }}
              />
              {hint && <span className="field-hint" id={`${name}-hint`}>{hint} Example: {placeholder}</span>}
              {fieldErrors[name] && <span className="field-error" id={`${name}-error`}>{fieldErrors[name]}</span>}
            </div>
          ))}
          <div className="form-actions">
            <button className="primary-button" type="submit" disabled={busy !== null}>
              {busy === "save" ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}

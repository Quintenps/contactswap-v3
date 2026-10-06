import { useEffect, useRef, useState, type FormEvent } from "react";

type ProfileFields = {
  name: string;
  email: string;
  address: string;
  birthday: string;
};

type Profile = ProfileFields & { hasPhoto: boolean };
type FieldName = keyof ProfileFields;
type View = "checking" | "login" | "loading" | "profile";

const tokenStorageKey = "contactswap-owner-token";
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
  const [view, setView] = useState<View>("checking");
  const [tokenInput, setTokenInput] = useState("");
  const [activeToken, setActiveToken] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [values, setValues] = useState<ProfileFields>(emptyFields);
  const [hasPhoto, setHasPhoto] = useState(false);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoRevision, setPhotoRevision] = useState(0);
  const [message, setMessage] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<FieldName, string>>>({});
  const [busy, setBusy] = useState<"save" | "upload" | "remove" | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

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
    setView("profile");
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
    if (!activeToken || !hasPhoto) {
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
  }, [activeToken, hasPhoto, photoRevision]);

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
    setFieldErrors({});
    setView("login");
    setMessage(storageCleared
      ? "Logged out."
      : "Logged out. Clear this site's storage.");
  }

  const hasUnsavedChanges = profile !== null && fields.some(({ name }) => values[name] !== profile[name]);

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

  return (
    <main className="shell profile-shell">
      <header className="page-header">
        <div>
          <p className="eyebrow">ContactSwap</p>
          <h1>Profile</h1>
        </div>
        <button className="quiet-button logout-button" type="button" onClick={logout}>Log out</button>
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

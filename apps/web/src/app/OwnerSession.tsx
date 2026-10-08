import { createContext, useContext, useEffect, useState, type Dispatch, type FormEvent, type ReactNode, type SetStateAction } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { apiUrl, errorCode, isProfile, ownerAuthorization, tokenStorageKey } from "../lib/api";
import { useLanguage, type MessageKey } from "../lib/i18n";
import type { Profile } from "../types";

type OwnerSession = {
  status: "checking" | "unauthenticated" | "authenticated";
  token: string | null;
  profile: Profile | null;
  setProfile: Dispatch<SetStateAction<Profile | null>>;
  authenticate: (token: string) => Promise<void>;
  unauthorized: () => void;
  logout: () => void;
  loginMessage: MessageKey | "";
};

const OwnerSessionContext = createContext<OwnerSession | null>(null);

export function useOwnerSession(): OwnerSession {
  const session = useContext(OwnerSessionContext);
  if (!session) throw new Error("Owner session is unavailable.");
  return session;
}

export function OwnerSessionProvider() {
  const [status, setStatus] = useState<OwnerSession["status"]>("checking");
  const [token, setToken] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loginMessage, setLoginMessage] = useState<MessageKey | "">("");

  function clearSession(message: MessageKey) {
    let storageCleared = true;
    try {
      window.localStorage.removeItem(tokenStorageKey);
    } catch {
      storageCleared = false;
    }
    setToken(null);
    setProfile(null);
    setStatus("unauthenticated");
    setLoginMessage(
      storageCleared
        ? message
        : message === "loggedOut"
          ? "logoutStorageFailure"
          : "unauthorizedStorageFailure"
    );
  }

  function unauthorized() {
    clearSession("unauthorizedEnterToken");
  }

  async function authenticate(value: string) {
    setStatus("checking");
    setLoginMessage("");
    try {
      const response = await fetch(apiUrl("/api/owner/profile"), {
        headers: { Authorization: ownerAuthorization(value) },
        cache: "no-store"
      });
      if (response.status === 401) {
        clearSession("unauthorizedEnterToken");
        return;
      }
      if (response.status === 404 && (await errorCode(response)) === "profile_not_found") {
        acceptSession(null, value);
        return;
      }
      if (!response.ok) {
        setStatus("unauthenticated");
        setLoginMessage("profileLoadFailed");
        return;
      }
      const data: unknown = await response.json();
      if (!isProfile(data)) {
        setStatus("unauthenticated");
        setLoginMessage("invalidProfileResponse");
        return;
      }
      acceptSession(data, value);
    } catch {
      setStatus("unauthenticated");
      setLoginMessage("connectionFailed");
    }
  }

  function acceptSession(data: Profile | null, value: string) {
    let tokenRemembered = true;
    try {
      window.localStorage.setItem(tokenStorageKey, value);
    } catch {
      tokenRemembered = false;
    }
    setToken(value);
    setProfile(data);
    setStatus("authenticated");
    setLoginMessage(tokenRemembered ? "" : "signedInTokenNotRemembered");
  }

  function logout() {
    clearSession("loggedOut");
  }

  useEffect(() => {
    let rememberedToken: string | null = null;
    try {
      rememberedToken = window.localStorage.getItem(tokenStorageKey);
    } catch {
      setStatus("unauthenticated");
      setLoginMessage("browserStorageUnavailable");
      return;
    }
    if (rememberedToken) void authenticate(rememberedToken);
    else setStatus("unauthenticated");
  }, []);

  return (
    <OwnerSessionContext.Provider
      value={{ status, token, profile, setProfile, authenticate, unauthorized, logout, loginMessage }}
    >
      <Outlet />
    </OwnerSessionContext.Provider>
  );
}

export function OwnerSessionGate() {
  const session = useOwnerSession();
  const { t } = useLanguage();

  if (session.status === "checking") {
    return (
      <main className="shell" aria-busy="true">
        <section className="panel loading-panel" aria-live="polite">
          <p className="eyebrow">ContactSwap</p>
          <h1>{t("loading")}</h1>
        </section>
      </main>
    );
  }

  if (session.status === "unauthenticated") {
    return <OwnerLoginPage />;
  }

  return <Outlet />;
}

function OwnerLoginPage() {
  const { authenticate, loginMessage } = useOwnerSession();
  const { t } = useLanguage();
  const [tokenInput, setTokenInput] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const token = tokenInput.trim();
    if (!token) return;
    await authenticate(token);
    setTokenInput("");
  }

  return (
    <main className="shell">
      <section className="panel login-panel">
        <form onSubmit={handleSubmit} className="stack">
          <input
            id="owner-token"
            type="password"
            aria-label={t("passwordPlaceholder")}
            placeholder={t("passwordPlaceholder")}
            autoComplete="current-password"
            value={tokenInput}
            onChange={(event) => setTokenInput(event.target.value)}
            required
          />
          <button className="primary-button" type="submit">
            {t("continue")}
          </button>
        </form>
        {loginMessage && <p className="notice" role="alert">{t(loginMessage)}</p>}
      </section>
    </main>
  );
}

export function OwnerPageHeader({ title }: { title: string }) {
  const { logout } = useOwnerSession();
  const { t } = useLanguage();
  return (
    <header className="page-header">
      <div>
        <p className="eyebrow">ContactSwap</p>
        <h1>{title}</h1>
      </div>
      <div className="page-actions">
        <nav className="owner-navigation" aria-label={t("navLabel")}>
          <OwnerNavLink to="/quinten" end>{t("profile")}</OwnerNavLink>
          <OwnerNavLink to="/quinten/links">{t("guestLinks")}</OwnerNavLink>
          <OwnerNavLink to="/quinten/submissions">{t("submissions")}</OwnerNavLink>
          <button className="nav-button owner-nav-logout" type="button" onClick={logout}>{t("logOut")}</button>
        </nav>
      </div>
    </header>
  );
}

function OwnerNavLink({ to, end, children }: { to: string; end?: boolean; children: ReactNode }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) => `nav-button${isActive ? " nav-button-active" : ""}`}
    >
      {children}
    </NavLink>
  );
}

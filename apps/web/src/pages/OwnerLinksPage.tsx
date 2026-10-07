import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { OwnerPageHeader, useOwnerSession } from "../app/OwnerSession";
import {
  errorCode,
  fetchOwnerLinks,
  isGuestUrl,
  OwnerApiError,
  ownerAuthorization
} from "../lib/api";
import { formatDateTime, useLanguage, type MessageKey } from "../lib/i18n";
import type { GuestLink } from "../types";

export default function OwnerLinksPage() {
  const { token, profile, unauthorized } = useOwnerSession();
  const { language, t } = useLanguage();
  const [guestLinks, setGuestLinks] = useState<GuestLink[]>([]);
  const [linksLoading, setLinksLoading] = useState(false);
  const [linkActionBusy, setLinkActionBusy] = useState<"create" | string | null>(null);
  const [linkMessage, setLinkMessage] = useState<MessageKey | "">("");
  const [generatedGuestUrl, setGeneratedGuestUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;

    const activeToken = token;
    const controller = new AbortController();
    setLinksLoading(true);
    setLinkMessage("");
    async function loadLinks() {
      try {
        setGuestLinks(await fetchOwnerLinks(activeToken, controller.signal));
      } catch (error) {
        if (controller.signal.aborted) return;
        if (error instanceof OwnerApiError && error.status === 401) {
          unauthorized();
          return;
        }
        setLinkMessage("linksCouldNotLoad");
      } finally {
        if (!controller.signal.aborted) setLinksLoading(false);
      }
    }
    void loadLinks();
    return () => controller.abort();
  }, [token]);

  async function handleCreateGuestLink() {
    if (!token || linkActionBusy) return;
    if (!profile) {
      setLinkMessage("saveProfileBeforeLinkAction");
      return;
    }

    setLinkActionBusy("create");
    setLinkMessage("");
    try {
      const response = await fetch("/api/owner/links", {
        method: "POST",
        headers: { Authorization: ownerAuthorization(token) },
        cache: "no-store"
      });
      if (response.status === 401) {
        unauthorized();
        return;
      }
      if (response.status === 404 && (await errorCode(response)) === "profile_not_found") {
        setLinkMessage("saveProfileBeforeLinkAction");
        return;
      }
      if (!response.ok) {
        setLinkMessage("linkCreationFailed");
        return;
      }

      const payload: unknown = await response.json();
      if (typeof payload !== "object" || payload === null || !("guestUrl" in payload) || !isGuestUrl(payload.guestUrl)) {
        setLinkMessage("createdUrlCouldNotDisplay");
        return;
      }

      setGeneratedGuestUrl(payload.guestUrl);
      try {
        setGuestLinks(await fetchOwnerLinks(token));
        setLinkMessage("linkCreatedCopyNow");
      } catch (error) {
        if (error instanceof OwnerApiError && error.status === 401) {
          unauthorized();
          return;
        }
        setLinkMessage("linkOverviewRefreshFailed");
      }
    } catch {
      setLinkMessage("linkCreationFailed");
    } finally {
      setLinkActionBusy(null);
    }
  }

  async function handleCopyGuestUrl() {
    if (!generatedGuestUrl) return;
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable.");
      await navigator.clipboard.writeText(generatedGuestUrl);
      setLinkMessage("guestLinkCopied");
    } catch {
      const input = document.querySelector<HTMLInputElement>("#generated-guest-url");
      input?.focus();
      input?.select();
      setLinkMessage("clipboardUnavailable");
    }
  }

  async function handleRevokeGuestLink(linkId: string) {
    if (!token || linkActionBusy) return;
    if (!window.confirm(t("revokeLinkConfirmation"))) return;

    setLinkActionBusy(linkId);
    setLinkMessage("");
    try {
      const response = await fetch(`/api/owner/links/${encodeURIComponent(linkId)}`, {
        method: "DELETE",
        headers: { Authorization: ownerAuthorization(token) },
        cache: "no-store"
      });
      if (response.status === 401) {
        unauthorized();
        return;
      }
      if (!response.ok) {
        setLinkMessage("linkRevocationFailed");
        return;
      }
      try {
        setGuestLinks(await fetchOwnerLinks(token));
        setLinkMessage("linkStatusUpdated");
      } catch (error) {
        if (error instanceof OwnerApiError && error.status === 401) {
          unauthorized();
          return;
        }
        setLinkMessage("revocationRefreshFailed");
      }
    } catch {
      setLinkMessage("revocationNotConfirmed");
    } finally {
      setLinkActionBusy(null);
    }
  }

  return (
    <main className="shell profile-shell">
      <OwnerPageHeader title={t("guestLinks")} />
      {linkMessage && <p className="notice page-notice" role="status" aria-live="polite">{t(linkMessage)}</p>}
      <section className="panel links-panel" aria-labelledby="links-heading">
        <div className="section-heading">
          <div>
            <h2 id="links-heading">{t("yourLinks")}</h2>
            <p className="section-description">{t("linksDescription")}</p>
          </div>
        </div>
        {!profile && (
          <p className="notice" role="status">
            {t("saveProfileBeforeLink")} <Link to="/">{t("goToProfile")}</Link>
          </p>
        )}
        <button
          className="primary-button create-link-button"
          type="button"
          onClick={() => void handleCreateGuestLink()}
          disabled={!profile || linkActionBusy !== null}
        >
          {linkActionBusy === "create" ? t("creating") : t("generateNewLink")}
        </button>

        {generatedGuestUrl && (
          <div className="generated-link" aria-labelledby="generated-link-heading">
            <h3 id="generated-link-heading">{t("newGuestLink")}</h3>
            <p>{t("guestLinkCopyDescription")}</p>
            <label className="visually-hidden" htmlFor="generated-guest-url">{t("newGuestLinkUrl")}</label>
            <input id="generated-guest-url" type="text" value={generatedGuestUrl} readOnly />
            <button className="secondary-button" type="button" onClick={() => void handleCopyGuestUrl()}>
              {t("copyLink")}
            </button>
          </div>
        )}

        <h3 className="links-subheading">{t("overview")}</h3>
        {linksLoading ? (
          <p aria-live="polite">{t("loadingLinks")}</p>
        ) : guestLinks.length === 0 ? (
          <p>{t("noGuestLinks")}</p>
        ) : (
          <ul className="link-list">
            {guestLinks.map((link) => (
              <li className="link-card" key={link.id}>
                <div className="link-card-content">
                  <p><span className="link-label">{t("created")}</span> {formatDateTime(link.createdAt, language, t("dateUnavailable"))}</p>
                  <p><span className="link-label">{t("linkId")}</span> <code>{link.id}</code></p>
                  <span className={`state-pill link-status status-${link.status}`}>{t(link.status)}</span>
                </div>
                {link.status === "active" && (
                  <button
                    className="danger-button"
                    type="button"
                    onClick={() => void handleRevokeGuestLink(link.id)}
                    disabled={linkActionBusy !== null}
                  >
                    {linkActionBusy === link.id ? t("revoking") : t("revoke")}
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

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { OwnerPageHeader, useOwnerSession } from "../app/OwnerSession";
import {
  errorCode,
  fetchOwnerLinks,
  formatCreatedAt,
  isGuestUrl,
  OwnerApiError,
  ownerAuthorization
} from "../lib/api";
import type { GuestLink } from "../types";

export default function OwnerLinksPage() {
  const { token, profile, unauthorized } = useOwnerSession();
  const [guestLinks, setGuestLinks] = useState<GuestLink[]>([]);
  const [linksLoading, setLinksLoading] = useState(false);
  const [linkActionBusy, setLinkActionBusy] = useState<"create" | string | null>(null);
  const [linkMessage, setLinkMessage] = useState("");
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
        setLinkMessage("Links could not be loaded. Try again.");
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
      setLinkMessage("Save your owner profile before creating a link.");
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
        setGuestLinks(await fetchOwnerLinks(token));
        setLinkMessage("Link created. Copy the URL now; it cannot be retrieved from this overview later.");
      } catch (error) {
        if (error instanceof OwnerApiError && error.status === 401) {
          unauthorized();
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
    if (!token || linkActionBusy) return;
    if (!window.confirm("Revoke this link? It will stop working for guests, including its vCard link.")) return;

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
        setLinkMessage("Link revocation failed. Try again.");
        return;
      }
      try {
        setGuestLinks(await fetchOwnerLinks(token));
        setLinkMessage("Link status updated.");
      } catch (error) {
        if (error instanceof OwnerApiError && error.status === 401) {
          unauthorized();
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

  return (
    <main className="shell profile-shell">
      <OwnerPageHeader title="Guest links" />
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
            Save your owner profile before creating a guest link. <Link to="/">Go to your profile</Link>
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

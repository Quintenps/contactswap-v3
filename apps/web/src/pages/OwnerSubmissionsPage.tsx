import { useEffect, useState } from "react";
import { OwnerPageHeader, useOwnerSession } from "../app/OwnerSession";
import {
  fetchOwnerSubmissions,
  formatCreatedAt,
  OwnerApiError,
  ownerAuthorization,
  submissionVCardFilename
} from "../lib/api";
import type { OwnerSubmission } from "../types";

export default function OwnerSubmissionsPage() {
  const { token, unauthorized } = useOwnerSession();
  const [submissions, setSubmissions] = useState<OwnerSubmission[]>([]);
  const [submissionsLoading, setSubmissionsLoading] = useState(false);
  const [submissionBusy, setSubmissionBusy] = useState<string[]>([]);
  const [submissionMessage, setSubmissionMessage] = useState("");
  const [submissionRetry, setSubmissionRetry] = useState(0);

  useEffect(() => {
    if (!token) return;

    const activeToken = token;
    const controller = new AbortController();
    setSubmissionsLoading(true);
    setSubmissionMessage("");
    async function loadSubmissions() {
      try {
        setSubmissions(await fetchOwnerSubmissions(activeToken, controller.signal));
      } catch (error) {
        if (controller.signal.aborted) return;
        if (error instanceof OwnerApiError && error.status === 401) {
          unauthorized();
          return;
        }
        setSubmissionMessage("Submissions could not be loaded. Try again.");
      } finally {
        if (!controller.signal.aborted) setSubmissionsLoading(false);
      }
    }
    void loadSubmissions();
    return () => controller.abort();
  }, [token, submissionRetry]);

  async function handleDownloadSubmission(submission: OwnerSubmission) {
    if (!token || submissionBusy.includes(submission.id)) return;

    setSubmissionBusy((current) => [...current, submission.id]);
    setSubmissionMessage("");
    let downloadUrl: string | undefined;
    try {
      const response = await fetch(
        `/api/owner/submissions/${encodeURIComponent(submission.id)}/vcard`,
        {
          headers: { Authorization: ownerAuthorization(token) },
          cache: "no-store"
        }
      );
      if (response.status === 401) {
        unauthorized();
        return;
      }
      if (response.status === 404) {
        try {
          setSubmissions(await fetchOwnerSubmissions(token));
          setSubmissionMessage("This submission is no longer available.");
        } catch (error) {
          if (error instanceof OwnerApiError && error.status === 401) {
            unauthorized();
            return;
          }
          setSubmissionMessage("This submission is no longer available. The list could not be refreshed.");
        }
        return;
      }
      if (!response.ok) {
        setSubmissionMessage("The contact card could not be downloaded. Try again.");
        return;
      }

      const contentType = response.headers.get("Content-Type")?.toLowerCase() ?? "";
      const blob = await response.blob();
      if (!/^text\/vcard(?:\s*;|$)/.test(contentType) || blob.size === 0) {
        setSubmissionMessage("The contact card could not be downloaded. Try again.");
        return;
      }

      downloadUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = downloadUrl;
      anchor.download = submissionVCardFilename(response.headers.get("Content-Disposition"));
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
      setSubmissionMessage("Contact card downloaded.");
    } catch {
      setSubmissionMessage("The contact card could not be downloaded. Check your connection and try again.");
    } finally {
      if (downloadUrl) URL.revokeObjectURL(downloadUrl);
      setSubmissionBusy((current) => current.filter((id) => id !== submission.id));
    }
  }

  return (
    <main className="shell profile-shell">
      <OwnerPageHeader title="Submitted contacts" />
      {submissionMessage && <p className="notice page-notice" role="status" aria-live="polite">{submissionMessage}</p>}
      <section className="panel links-panel" aria-labelledby="submissions-heading" aria-busy={submissionsLoading}>
        <div className="section-heading">
          <div>
            <h2 id="submissions-heading">Guest submissions</h2>
            <p className="section-description">Download each guest's contact card as a vCard.</p>
          </div>
        </div>
        {submissionsLoading ? (
          <p aria-live="polite">Loading submissions…</p>
        ) : submissionMessage.startsWith("Submissions could not be loaded") ? (
          <button className="secondary-button" type="button" onClick={() => setSubmissionRetry((current) => current + 1)}>
            Try again
          </button>
        ) : submissions.length === 0 ? (
          <p>No guest submissions yet.</p>
        ) : (
          <ul className="link-list">
            {submissions.map((submission) => (
              <li className="link-card submission-card" key={submission.id}>
                <div className="link-card-content">
                  <p>{submission.name}</p>
                  <p><span className="link-label">Submitted</span> {formatCreatedAt(submission.createdAt)}</p>
                </div>
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => void handleDownloadSubmission(submission)}
                  disabled={submissionBusy.includes(submission.id)}
                >
                  {submissionBusy.includes(submission.id) ? "Downloading…" : "Download"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

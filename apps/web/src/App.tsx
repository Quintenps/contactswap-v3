import { BrowserRouter, Route, Routes } from "react-router-dom";
import {
  OwnerSessionGate,
  OwnerSessionProvider
} from "./app/OwnerSession";
import GuestPage from "./pages/GuestPage";
import OwnerLinksPage from "./pages/OwnerLinksPage";
import OwnerProfilePage from "./pages/OwnerProfilePage";
import OwnerSubmissionsPage from "./pages/OwnerSubmissionsPage";
import { LanguageProvider, LanguageSwitcher, useLanguage } from "./lib/i18n";

function NotFoundPage() {
  const { t } = useLanguage();
  return (
    <main className="shell guest-shell guest-state-shell">
      <section className="panel guest-panel guest-state-panel" role="status">
        <p className="eyebrow">ContactSwap</p>
        <h1>{t("notFoundTitle")}</h1>
        <p className="section-description">{t("notFoundDescription")}</p>
      </section>
    </main>
  );
}

function WelcomePage() {
  const { t } = useLanguage();
  return (
    <main className="welcome-shell">
      <section className="welcome-hero">
        <div className="welcome-copy">
          <h1>{t("welcomeTitle")}</h1>
          <p className="welcome-description">{t("welcomeDescription")}</p>
        </div>
        <div className="welcome-illustration" aria-hidden="true">
          <div className="welcome-phone">
            <span className="welcome-phone-speaker" />
            <div className="welcome-phone-screen">
              <div className="welcome-contact-card">
                <span className="welcome-avatar" />
                <span className="welcome-card-lines">
                  <span />
                  <span />
                </span>
              </div>
              <span className="welcome-save-action">{t("welcomeSaveContact")}</span>
            </div>
            <span className="welcome-phone-home" />
          </div>
          <div className="welcome-link-badge">
            <svg viewBox="0 0 24 24">
              <path d="M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.72m2.72 6.35a5 5 0 0 0-7.07 0l-3 3a5 5 0 0 0 7.07 7.07l1.72-1.72" />
            </svg>
          </div>
        </div>
      </section>
    </main>
  );
}

export default function App() {
  return (
    <LanguageProvider>
      <BrowserRouter>
        <LanguageSwitcher />
        <Routes>
          <Route element={<OwnerSessionProvider />}>
            <Route element={<OwnerSessionGate />}>
              <Route path="/quinten" element={<OwnerProfilePage />} />
              <Route path="/quinten/links" element={<OwnerLinksPage />} />
              <Route path="/quinten/submissions" element={<OwnerSubmissionsPage />} />
            </Route>
          </Route>
          <Route path="/" element={<WelcomePage />} />
          <Route path="/token/:token" element={<GuestPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </BrowserRouter>
    </LanguageProvider>
  );
}

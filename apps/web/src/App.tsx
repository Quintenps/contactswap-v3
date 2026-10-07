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
          <span className="welcome-sparkle welcome-sparkle-one">✦</span>
          <span className="welcome-sparkle welcome-sparkle-two">✦</span>
          <span className="welcome-sparkle welcome-sparkle-three">✧</span>
          <div className="welcome-card welcome-card-back welcome-card-back-one" />
          <div className="welcome-card welcome-card-back welcome-card-back-two" />
          <div className="welcome-card welcome-card-front">
            <span className="welcome-avatar">♡</span>
            <span className="welcome-card-lines">
              <span />
              <span />
              <span />
            </span>
            <span className="welcome-card-heart">♥</span>
          </div>
          <span className="welcome-orbit welcome-orbit-one" />
          <span className="welcome-orbit welcome-orbit-two" />
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

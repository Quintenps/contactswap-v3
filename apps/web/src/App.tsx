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

export default function App() {
  return (
    <LanguageProvider>
      <BrowserRouter>
        <LanguageSwitcher />
        <Routes>
          <Route element={<OwnerSessionProvider />}>
            <Route element={<OwnerSessionGate />}>
              <Route path="/" element={<OwnerProfilePage />} />
              <Route path="/owner/links" element={<OwnerLinksPage />} />
              <Route path="/owner/submissions" element={<OwnerSubmissionsPage />} />
            </Route>
          </Route>
          <Route path="/guest/:token" element={<GuestPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </BrowserRouter>
    </LanguageProvider>
  );
}

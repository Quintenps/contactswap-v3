import { BrowserRouter, Route, Routes } from "react-router-dom";
import {
  OwnerSessionGate,
  OwnerSessionProvider
} from "./app/OwnerSession";
import GuestPage from "./pages/GuestPage";
import OwnerLinksPage from "./pages/OwnerLinksPage";
import OwnerProfilePage from "./pages/OwnerProfilePage";
import OwnerSubmissionsPage from "./pages/OwnerSubmissionsPage";

function NotFoundPage() {
  return (
    <main className="shell guest-shell guest-state-shell">
      <section className="panel guest-panel guest-state-panel" role="status">
        <p className="eyebrow">ContactSwap</p>
        <h1>Page not found</h1>
        <p className="section-description">Check the link and try again.</p>
      </section>
    </main>
  );
}

export default function App() {
  return (
    <BrowserRouter>
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
  );
}

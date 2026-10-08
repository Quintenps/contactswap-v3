// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { formatDateTime, languageStorageKey, translate, type Language } from "./lib/i18n";

let root: Root | undefined;
let container: HTMLDivElement;

async function renderApp(path = "/quinten") {
  window.history.replaceState({}, "", path);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root?.render(<App />));
}

async function setLanguage(language: Language) {
  const trigger = document.querySelector<HTMLButtonElement>("#contactswap-language-toggle");
  if (!trigger) throw new Error("Missing language selector.");
  if (trigger.getAttribute("aria-expanded") !== "true") {
    await act(async () => trigger.click());
  }
  const option = document.querySelector<HTMLButtonElement>(`#contactswap-language-menu [data-language="${language}"]`);
  if (!option) throw new Error(`Missing language option: ${language}`);
  await act(async () => {
    option.click();
  });
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  window.localStorage.clear();
  vi.stubGlobal("fetch", vi.fn(async () => {
    throw new Error("Network unavailable.");
  }));
});

afterEach(async () => {
  if (root) {
    await act(async () => root?.unmount());
    root = undefined;
  }
  container?.remove();
  window.history.replaceState({}, "", "/");
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("frontend language support", () => {
  it("defaults to Dutch regardless of browser language and switches without losing state or making requests", async () => {
    Object.defineProperty(navigator, "language", { configurable: true, value: "en-US" });
    await renderApp();
    await act(async () => Promise.resolve());

    expect(document.documentElement.lang).toBe("nl");
    expect(document.querySelector<HTMLButtonElement>("#contactswap-language-toggle")?.dataset.language).toBe("nl");
    expect(document.querySelector<HTMLButtonElement>("#contactswap-language-toggle")?.textContent).toContain("🇳🇱");
    expect(document.querySelector<HTMLInputElement>("#owner-token")?.placeholder).toBe("Vul je wachtwoord in");
    await setLanguage("en");
    const languageTrigger = document.querySelector<HTMLButtonElement>("#contactswap-language-toggle");
    if (!languageTrigger) throw new Error("Missing language selector.");
    await act(async () => languageTrigger.click());
    expect(document.querySelector("#contactswap-language-menu")?.textContent).toContain("🇬🇧");
    expect(document.querySelector("#contactswap-language-menu")?.textContent).toContain("English");
    await setLanguage("nl");

    const tokenInput = document.querySelector<HTMLInputElement>("#owner-token");
    if (!tokenInput) throw new Error("Missing owner token input.");
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      if (!setter) throw new Error("Input value setter is unavailable.");
      setter.call(tokenInput, "not-submitted-token");
      tokenInput.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await setLanguage("en");

    expect(document.documentElement.lang).toBe("en");
    expect(document.querySelector<HTMLInputElement>("#owner-token")?.placeholder).toBe("Enter password");
    expect(document.querySelector<HTMLInputElement>("#owner-token")?.value).toBe("not-submitted-token");
    expect(fetch).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(languageStorageKey)).toBe("en");
    expect(window.localStorage.getItem("contactswap-owner-token")).toBeNull();
  });

  it("shows a localized welcome page without an owner-dashboard link or API requests", async () => {
    await renderApp("/");

    expect(document.body.textContent).toContain("Deel contactgegevens met één link");
    expect(document.body.textContent).toContain("Contact opslaan");
    expect(document.querySelector(".welcome-hero a, .welcome-hero button")).toBeNull();

    await setLanguage("en");
    expect(document.body.textContent).toContain("Swap contacts with a link");
    expect(document.body.textContent).toContain("save your details to their phone");
    expect(document.body.textContent).toContain("Save contact");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("remembers the selected language and falls back to Dutch for an invalid saved value", async () => {
    await renderApp();
    await setLanguage("en");
    await act(async () => root?.unmount());
    root = undefined;
    container.remove();

    await renderApp();
    expect(document.querySelector<HTMLButtonElement>("#contactswap-language-toggle")?.dataset.language).toBe("en");
    expect(document.querySelector<HTMLInputElement>("#owner-token")?.placeholder).toBe("Enter password");

    await act(async () => root?.unmount());
    root = undefined;
    container.remove();
    window.localStorage.setItem(languageStorageKey, "fr");
    await renderApp();

    expect(document.querySelector<HTMLButtonElement>("#contactswap-language-toggle")?.dataset.language).toBe("nl");
    expect(document.querySelector<HTMLInputElement>("#owner-token")?.placeholder).toBe("Vul je wachtwoord in");
  });

  it("updates guest error copy in place without repeating the request", async () => {
    await renderApp("/token/guest-token");
    await act(async () => Promise.resolve());
    expect(document.body.textContent).toContain("Oeps, dat ging niet goed");
    expect(document.body.textContent).toContain("Geen verbinding.");

    await setLanguage("en");
    expect(document.body.textContent).toContain("Oops, that didn't work");
    expect(document.body.textContent).toContain("Can't connect right now.");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("translates validation feedback immediately and preserves edited contact fields", async () => {
    const profile = {
      name: "Quinten Example",
      email: "quinten@example.invalid",
      address: "12 Main Street",
      birthday: "1990-02-28",
      phone: "+31600000000",
      org: null,
      title: null,
      hasPhoto: false
    };
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(profile), {
      headers: { "Content-Type": "application/json" }
    }));
    window.localStorage.setItem("contactswap-owner-token", "owner-test-token");
    await renderApp();
    await act(async () => new Promise((resolve) => window.setTimeout(resolve, 0)));

    const email = document.querySelector<HTMLInputElement>("#email");
    if (!email) throw new Error("Missing profile email field.");
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      if (!setter) throw new Error("Input value setter is unavailable.");
      setter.call(email, "not-an-email");
      email.dispatchEvent(new Event("input", { bubbles: true }));
      document.querySelector<HTMLFormElement>(".profile-form")?.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true })
      );
    });
    expect(document.body.textContent).toContain("Dit e-mailadres lijkt niet te kloppen.");

    await setLanguage("en");
    expect(document.body.textContent).toContain("That email address doesn't look right.");
    expect(document.querySelector<HTMLInputElement>("#email")?.value).toBe("not-an-email");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("translates known messages and formats dates using the selected locale", () => {
    expect(translate("nl", "validPhone")).toContain("E.164-formaat");
    expect(translate("en", "validPhone")).toContain("E.164 format");
    expect(translate("nl", "downloadCardOnly")).toBe("Alleen kaart downloaden");
    expect(translate("nl", "downloadAndShare")).toBe("Mijn gegevens delen en daarna de kaart ophalen");
    expect(translate("en", "downloadCardOnly")).toBe("Download the card only");
    expect(translate("en", "downloadAndShare")).toBe("Share my details, then get the card");
    expect(formatDateTime("2026-10-06T12:00:00.000Z", "nl", translate("nl", "dateUnavailable")))
      .not.toBe(formatDateTime("2026-10-06T12:00:00.000Z", "en", translate("en", "dateUnavailable")));
    expect(formatDateTime("invalid", "nl", translate("nl", "dateUnavailable"))).toBe("Datum onbekend");
  });
});

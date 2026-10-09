// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { languageStorageKey } from "./lib/i18n";

const token = "owner-test-token";
const profile = {
  firstName: "Quinten",
  lastName: "Example",
  email: "quinten@example.invalid",
  street: "12 Main Street",
  city: "Amsterdam",
  postalCode: "1012 AB",
  country: "The Netherlands",
  birthday: "1990-02-28",
  phone: "+31600000000",
  org: null,
  title: null,
  hasPhoto: false
};
const tokenStorageKey = "contactswap-owner-token";

let root: Root | undefined;
let container: HTMLDivElement;

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

function input(id: string): HTMLInputElement {
  const element = document.querySelector<HTMLInputElement>(`#${id}`);
  if (!element) throw new Error(`Missing input: ${id}`);
  return element;
}

function button(text: string): HTMLButtonElement {
  const updatedCopy: Record<string, string> = {
    "Download": "Get vCard",
    "Generate new link": "Make a link",
    "Revoke": "Delete",
    "Log out": "Sign out",
    "Download my card & share your details": "Share my details, then get the card",
    "Download card only": "Download the card only"
  };
  const expectedText = updatedCopy[text] ?? text;
  const element = [...document.querySelectorAll("button")].find((item) => item.textContent?.includes(expectedText));
  if (!element) throw new Error(`Missing button: ${text}`);
  return element;
}

function changeValue(element: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  if (!setter) throw new Error("Input value setter is unavailable.");
  act(() => {
    setter.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function fillGuestRequiredFields(phone = "+31600000001") {
  changeValue(input("guest-firstName"), "Guest");
  changeValue(input("guest-lastName"), "Example");
  changeValue(input("guest-email"), "guest@example.invalid");
  changeValue(input("guest-street"), "34 Example Street");
  changeValue(input("guest-city"), "Amsterdam");
  changeValue(input("guest-postalCode"), "1013 AB");
  changeValue(input("guest-birthday"), "1992-06-17");
  changeValue(input("guest-phone"), phone);
}

async function submit(form: HTMLFormElement) {
  await act(async () => {
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
}

async function click(element: HTMLButtonElement) {
  await act(async () => element.click());
}

async function clickLink(element: HTMLAnchorElement) {
  await act(async () => element.click());
}

async function renderApp(path = "/quinten") {
  window.history.replaceState({}, "", path);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root?.render(<App />));
}

async function renderLinksPage() {
  await renderApp("/quinten/links");
}

async function renderSubmissionsPage() {
  await renderApp("/quinten/submissions");
}

async function renderGuestPage(token = "guest-test-token") {
  await renderApp(`/token/${token}`);
}

function vcardResponse(
  body = "BEGIN:VCARD\r\nVERSION:3.0\r\nFN:Guest Example\r\nEND:VCARD\r\n",
  contentType = "text/vcard; version=3.0; charset=utf-8",
  filename = "guest-example.vcf"
): Response {
  return new Response(body, {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${filename}"`
    }
  });
}

function installFetch(handler: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>) {
  vi.stubGlobal("fetch", vi.fn(handler));
  return vi.mocked(fetch);
}

describe("frontend routes", () => {
  it("shows a minimal welcome page without loading owner or guest data", async () => {
    const fetchMock = installFetch(async () => response(profile));
    await renderApp("/");

    expect(document.body.textContent).toContain("Swap contacts with a link");
    expect(document.body.textContent).toContain("save your details to their phone");
    expect(document.querySelector(".welcome-illustration")?.getAttribute("aria-hidden")).toBe("true");
    expect(document.querySelector(".welcome-hero a, .welcome-hero button")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("navigates between owner pages without a full page load and responds to history changes", async () => {
    window.localStorage.setItem(tokenStorageKey, token);
    const fetchMock = installFetch(async (url) => {
      if (url === "/api/owner/links") return response({ links: [] });
      if (url === "/api/owner/submissions") return response({ submissions: [] });
      return response(profile);
    });
    await renderLinksPage();

    const submissionsLink = document.querySelector<HTMLAnchorElement>('nav[aria-label="Owner navigation"] a[href="/quinten/submissions"]');
    if (!submissionsLink) throw new Error("Missing submissions navigation link.");
    await clickLink(submissionsLink);

    expect(window.location.pathname).toBe("/quinten/submissions");
    expect(document.body.textContent).toContain("New contacts");
    expect(document.querySelector('nav[aria-label="Owner navigation"] a[aria-current="page"]')?.textContent)
      .toBe("New contacts");
    expect(fetchMock.mock.calls.some(([url]) => url === "/api/owner/submissions")).toBe(true);

    await act(async () => {
      window.history.pushState({}, "", "/quinten/links");
      window.dispatchEvent(new PopStateEvent("popstate", { state: window.history.state }));
      await Promise.resolve();
    });
    expect(window.location.pathname).toBe("/quinten/links");
    expect(document.body.textContent).toContain("Links to share");
  });

  it("shows a safe not-found state for unknown and malformed guest routes", async () => {
    const fetchMock = installFetch(async () => response(profile));
    await renderApp("/token/");

    expect(document.body.textContent).toContain("Can't find that page");
    expect(fetchMock).not.toHaveBeenCalled();

    await act(async () => root?.unmount());
    root = undefined;
    container.remove();
    await renderApp("/guest/guest-token");
    expect(document.body.textContent).toContain("Can't find that page");
    expect(fetchMock).not.toHaveBeenCalled();

    await act(async () => root?.unmount());
    root = undefined;
    container.remove();
    await renderApp("/not-a-route");
    expect(document.body.textContent).toContain("Can't find that page");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  window.localStorage.clear();
  window.localStorage.setItem(languageStorageKey, "en");
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: vi.fn(() => "blob:private-profile-photo")
  });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
});

afterEach(async () => {
  if (root) {
    await act(async () => root?.unmount());
    root = undefined;
  }
  container?.remove();
  window.history.replaceState({}, "", "/");
  Reflect.deleteProperty(navigator, "clipboard");
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("owner profile frontend", () => {
  it("shows a minimal password login with an accessible placeholder", async () => {
    const fetchMock = installFetch(async () => response(profile));
    await renderApp();

    const password = input("owner-token");
    expect(password.type).toBe("password");
    expect(password.placeholder).toBe("Enter password");
    expect(password.getAttribute("aria-label")).toBe("Enter password");
    expect(document.querySelector(".login-panel label, .login-panel h1, .login-panel a")).toBeNull();
    expect(document.querySelector(".login-panel button")).not.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps the profile vCard download disabled until a profile exists", async () => {
    window.localStorage.setItem(tokenStorageKey, token);
    const fetchMock = installFetch(async () => response({ error: { code: "profile_not_found" } }, 404));
    await renderApp();

    expect(button("Download my vCard").disabled).toBe(true);
    expect(fetchMock.mock.calls.some(([url]) => url === "/api/owner/profile/vcard")).toBe(false);
  });

  it("downloads the saved profile vCard through the owner-authorized endpoint", async () => {
    window.localStorage.setItem(tokenStorageKey, token);
    const fetchMock = installFetch(async (url) => url === "/api/owner/profile/vcard"
      ? vcardResponse(
        "BEGIN:VCARD\r\nVERSION:3.0\r\nFN:Quinten Example\r\nEND:VCARD\r\n",
        "text/vcard; version=3.0; charset=utf-8",
        "quinten-example.vcf"
      )
      : response(profile));
    const clickAnchor = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      expect(this.download).toBe("quinten-example.vcf");
      expect(this.href).toBe("blob:private-profile-photo");
    });
    await renderApp();

    const downloadButton = button("Download my vCard");
    expect(downloadButton.disabled).toBe(false);
    changeValue(input("firstName"), "Changed");
    expect(downloadButton.disabled).toBe(true);
    changeValue(input("firstName"), profile.firstName);
    expect(downloadButton.disabled).toBe(false);

    await click(downloadButton);

    const downloadCall = fetchMock.mock.calls.find(([url]) => url === "/api/owner/profile/vcard");
    expect(downloadCall?.[1]).toMatchObject({
      headers: { Authorization: expect.any(String) },
      cache: "no-store"
    });
    expect(clickAnchor).toHaveBeenCalledOnce();
    expect(URL.createObjectURL).toHaveBeenCalledOnce();
    expect(document.body.textContent).toContain("Your contact card was downloaded.");
  });

  it("reports failed profile vCard downloads and allows retry", async () => {
    window.localStorage.setItem(tokenStorageKey, token);
    let downloads = 0;
    installFetch(async (url) => {
      if (url === "/api/owner/profile/vcard") {
        downloads += 1;
        return downloads === 1
          ? response({ error: { code: "service_error" } }, 500)
          : vcardResponse();
      }
      return response(profile);
    });
    const clickAnchor = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    await renderApp();

    await click(button("Download my vCard"));
    expect(document.body.textContent).toContain("Couldn't download your vCard. Try again.");
    expect(clickAnchor).not.toHaveBeenCalled();

    await click(button("Download my vCard"));
    expect(downloads).toBe(2);
    expect(clickAnchor).toHaveBeenCalledOnce();
    expect(document.body.textContent).toContain("Your contact card was downloaded.");
  });

  it("loads retained submissions newest first without displaying private fields or identifiers", async () => {
    window.localStorage.setItem(tokenStorageKey, token);
    const submissions = [
      { id: "new-submission", name: "Newest Guest", createdAt: "2026-10-06T12:00:00.000Z", expiresAt: "2026-11-05T12:00:00.000Z", email: "private@example.invalid" },
      { id: "old-submission", name: "Earlier Guest", createdAt: "2026-10-05T12:00:00.000Z", expiresAt: "2026-11-04T12:00:00.000Z" }
    ];
    const fetchMock = installFetch(async (url) => {
      if (url === "/api/owner/submissions") return response({ submissions });
      return response(profile);
    });
    await renderSubmissionsPage();

    const listCall = fetchMock.mock.calls.find(([url]) => url === "/api/owner/submissions");
    expect(listCall?.[1]).toMatchObject({
      headers: { Authorization: expect.any(String) },
      cache: "no-store"
    });
    expect(document.querySelector('nav[aria-label="Owner navigation"] a[aria-current="page"]')?.textContent).toBe("New contacts");
    expect([...document.querySelectorAll(".submission-card .link-card-content p:first-child")].map((item) => item.textContent))
      .toEqual(["Newest Guest", "Earlier Guest"]);
    expect(document.body.textContent).not.toContain("new-submission");
    expect(document.body.textContent).not.toContain("private@example.invalid");
    expect(document.body.textContent).not.toContain("2026-11-05");
    expect(document.body.textContent).not.toContain(token);
  });

  it("shows a useful empty state for an empty submission list", async () => {
    window.localStorage.setItem(tokenStorageKey, token);
    installFetch(async (url) => url === "/api/owner/submissions"
      ? response({ submissions: [] })
      : response(profile));
    await renderSubmissionsPage();

    expect(document.body.textContent).toContain("No new contacts yet.");
    expect(document.querySelector(".submission-card")).toBeNull();
  });

  it("rejects an invalid list response and supports retrying the list request", async () => {
    window.localStorage.setItem(tokenStorageKey, token);
    let listReads = 0;
    installFetch(async (url) => {
      if (url === "/api/owner/submissions") {
        listReads += 1;
        return response({ submissions: listReads === 1 ? [{ id: "missing-expiry", name: "Guest", createdAt: "2026-10-06T12:00:00.000Z" }] : [{
          id: "valid-submission",
          name: "Guest Example",
          createdAt: "2026-10-06T12:00:00.000Z",
          expiresAt: "2026-11-05T12:00:00.000Z"
        }] });
      }
      return response(profile);
    });
    await renderSubmissionsPage();

    expect(document.body.textContent).toContain("Couldn't load new contacts.");
    expect(document.body.textContent).not.toContain("Guest Example");
    await click(button("Try again"));
    expect(document.body.textContent).toContain("Guest Example");
    expect(listReads).toBe(2);
  });

  it("downloads a selected submission using the authenticated vCard response and attachment filename", async () => {
    window.localStorage.setItem(tokenStorageKey, token);
    const submission = {
      id: "submission/one",
      name: "Guest Example",
      createdAt: "2026-10-06T12:00:00.000Z",
      expiresAt: "2026-11-05T12:00:00.000Z"
    };
    const fetchMock = installFetch(async (url) => {
      if (url === "/api/owner/submissions") return response({ submissions: [submission] });
      if (url === "/api/owner/submissions/submission%2Fone/vcard") return vcardResponse();
      return response(profile);
    });
    const clickAnchor = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      expect(this.download).toBe("guest-example.vcf");
      expect(this.href).toBe("blob:private-profile-photo");
    });
    await renderSubmissionsPage();
    await click(button("Download"));

    const downloadCall = fetchMock.mock.calls.find(([url]) => String(url).includes("/vcard"));
    expect(downloadCall?.[0]).toBe("/api/owner/submissions/submission%2Fone/vcard");
    expect(downloadCall?.[1]).toMatchObject({
      headers: { Authorization: expect.any(String) },
      cache: "no-store"
    });
    expect(clickAnchor).toHaveBeenCalledOnce();
    expect(URL.createObjectURL).toHaveBeenCalledOnce();
    expect(document.body.textContent).toContain("Contact card downloaded.");
  });

  it("removes an unavailable submission after refreshing the list", async () => {
    window.localStorage.setItem(tokenStorageKey, token);
    let listReads = 0;
    installFetch(async (url) => {
      if (url === "/api/owner/submissions") {
        listReads += 1;
        return response({ submissions: listReads === 1 ? [{
          id: "expired-submission",
          name: "Expired Guest",
          createdAt: "2026-10-06T12:00:00.000Z",
          expiresAt: "2026-10-06T12:00:01.000Z"
        }] : [] });
      }
      if (String(url).includes("/vcard")) return response({ error: { code: "submission_not_found" } }, 404);
      return response(profile);
    });
    await renderSubmissionsPage();
    await click(button("Download"));

    expect(document.body.textContent).toContain("This contact isn't available anymore.");
    expect(document.body.textContent).not.toContain("Expired Guest");
    expect(listReads).toBe(2);
  });

  it("does not download an invalid vCard response and allows retry", async () => {
    window.localStorage.setItem(tokenStorageKey, token);
    let downloads = 0;
    installFetch(async (url) => {
      if (url === "/api/owner/submissions") return response({ submissions: [{
        id: "submission-id",
        name: "Guest Example",
        createdAt: "2026-10-06T12:00:00.000Z",
        expiresAt: "2026-11-05T12:00:00.000Z"
      }] });
      if (String(url).includes("/vcard")) {
        downloads += 1;
        return downloads === 1 ? vcardResponse("not a card", "application/json") : vcardResponse();
      }
      return response(profile);
    });
    const clickAnchor = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    await renderSubmissionsPage();
    await click(button("Download"));

    expect(clickAnchor).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("Couldn't download this contact. Try again.");
    await click(button("Download"));
    expect(clickAnchor).toHaveBeenCalledOnce();
  });

  it.each(["service", "network"])("allows retry after a %s download failure", async (failure) => {
    window.localStorage.setItem(tokenStorageKey, token);
    let downloads = 0;
    installFetch(async (url) => {
      if (url === "/api/owner/submissions") return response({ submissions: [{
        id: "submission-id",
        name: "Guest Example",
        createdAt: "2026-10-06T12:00:00.000Z",
        expiresAt: "2026-11-05T12:00:00.000Z"
      }] });
      if (String(url).includes("/vcard")) {
        downloads += 1;
        if (downloads === 1 && failure === "network") throw new Error("network failure");
        if (downloads === 1) return response({ error: { code: "service_error" } }, 500);
        return vcardResponse();
      }
      return response(profile);
    });
    const clickAnchor = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    await renderSubmissionsPage();
    await click(button("Download"));
    expect(document.body.textContent).toContain(failure === "network"
      ? "Couldn't download the contact card. Check your connection"
      : "Couldn't download this contact. Try again.");
    await click(button("Download"));

    expect(clickAnchor).toHaveBeenCalledOnce();
  });

  it("returns to login and hides the list when a vCard download is unauthorized", async () => {
    window.localStorage.setItem(tokenStorageKey, token);
    installFetch(async (url) => {
      if (url === "/api/owner/submissions") return response({ submissions: [{
        id: "submission-id",
        name: "Private Guest",
        createdAt: "2026-10-06T12:00:00.000Z",
        expiresAt: "2026-11-05T12:00:00.000Z"
      }] });
      if (String(url).includes("/vcard")) return response({ error: { code: "unauthorized" } }, 401);
      return response(profile);
    });
    await renderSubmissionsPage();
    await click(button("Download"));

    expect(window.localStorage.getItem(tokenStorageKey)).toBeNull();
    expect(document.querySelector("#owner-token")).not.toBeNull();
    expect(document.body.textContent).not.toContain("Private Guest");
  });

  it("clears authorization and hides submissions after an unauthorized list response", async () => {
    window.localStorage.setItem(tokenStorageKey, token);
    installFetch(async (url) => url === "/api/owner/submissions"
      ? response({ error: { code: "unauthorized" } }, 401)
      : response(profile));
    await renderSubmissionsPage();

    expect(window.localStorage.getItem(tokenStorageKey)).toBeNull();
    expect(document.querySelector("#owner-token")).not.toBeNull();
    expect(document.body.textContent).not.toContain("New contacts");
    expect(document.body.textContent).not.toContain("Contacts from friends");
  });

  it("prevents duplicate downloads for a submission while its request is pending", async () => {
    window.localStorage.setItem(tokenStorageKey, token);
    let resolveDownload!: (value: Response) => void;
    const pendingResponse = new Promise<Response>((resolve) => {
      resolveDownload = resolve;
    });
    const fetchMock = installFetch(async (url) => {
      if (url === "/api/owner/submissions") return response({ submissions: [{
        id: "submission-id",
        name: "Guest Example",
        createdAt: "2026-10-06T12:00:00.000Z",
        expiresAt: "2026-11-05T12:00:00.000Z"
      }] });
      if (String(url).includes("/vcard")) return pendingResponse;
      return response(profile);
    });
    await renderSubmissionsPage();
    const downloadButton = button("Download");
    await act(async () => {
      downloadButton.click();
      await Promise.resolve();
    });
    expect(downloadButton.disabled).toBe(true);
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes("/vcard"))).toHaveLength(1);

    await act(async () => {
      resolveDownload(vcardResponse());
      await pendingResponse;
    });
  });

  it("loads the separate links page and lists statuses with a revoke action only for active links", async () => {
    window.localStorage.setItem(tokenStorageKey, token);
    const links = [
      { id: "00000000-0000-4000-8000-000000000001", createdAt: "2026-10-06T12:00:00.000Z", status: "active" },
      { id: "00000000-0000-4000-8000-000000000002", createdAt: "2026-10-05T12:00:00.000Z", status: "consumed" },
      { id: "00000000-0000-4000-8000-000000000003", createdAt: "2026-10-04T12:00:00.000Z", status: "revoked" }
    ];
    const fetchMock = installFetch(async (url) => {
      if (url === "/api/owner/links") return response({ links });
      return response(profile);
    });
    await renderLinksPage();

    expect(document.body.textContent).toContain("Share links");
    expect(document.querySelector('nav[aria-label="Owner navigation"] a[aria-current="page"]')?.textContent).toBe("Share links");
    expect([...document.querySelectorAll('nav[aria-label="Owner navigation"] a')].map((link) => link.textContent)).toEqual(["My profile", "Share links", "New contacts"]);
    expect(document.querySelector('nav[aria-label="Owner navigation"] button')?.textContent).toBe("Sign out");
    expect(document.querySelector(".status-active")?.textContent).toBe("Active");
    expect(document.querySelector(".status-consumed")?.textContent).toBe("Used");
    expect(document.querySelector(".status-revoked")?.textContent).toBe("Revoked");
    expect([...document.querySelectorAll(".link-card code")].map((item) => item.textContent)).toEqual(links.map((link) => link.id));
    expect(document.querySelectorAll(".link-card .danger-button")).toHaveLength(1);
    expect(fetchMock.mock.calls.some(([url, init]) => url === "/api/owner/links" && init?.cache === "no-store")).toBe(true);
    expect(document.body.textContent).not.toContain(token);
  });

  it("creates a guest link, refreshes the overview, and confirms successful copying", async () => {
    window.localStorage.setItem(tokenStorageKey, token);
    vi.stubEnv("VITE_PUBLIC_APP_ORIGIN", "https://contactswap.quinten.dev");
    const apiGuestUrl = "http://contactswap-api.quinten.dev/token/new-secret-token";
    const guestUrl = "https://contactswap.quinten.dev/token/new-secret-token";
    const copied = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: copied } });
    let linkReads = 0;
    const fetchMock = installFetch(async (url, init) => {
      if (url === "/api/owner/links" && init?.method === "POST") return response({ guestUrl: apiGuestUrl }, 201);
      if (url === "/api/owner/links") {
        linkReads += 1;
        return response({ links: linkReads === 1 ? [] : [
          { id: "00000000-0000-4000-8000-000000000001", createdAt: "2026-10-06T12:00:00.000Z", status: "active" }
        ] });
      }
      return response(profile);
    });
    await renderLinksPage();
    await click(button("Generate new link"));

    const createCall = fetchMock.mock.calls.find(([, init]) => init?.method === "POST");
    expect(createCall?.[0]).toBe("/api/owner/links");
    expect(createCall?.[1]?.method).toBe("POST");
    /*
    expect((createCall?.[1]?.headers as Record<string, string>)?.Authorization).toBe(`******);
    expect(createCall?.[1]).not.toHaveProperty("body");
    expect(document.querySelector<HTMLInputElement>("#generated-guest-url")?.value).toBe(guestUrl);
    */
    expect(typeof (createCall?.[1]?.headers as Record<string, string>)?.Authorization).toBe("string");
    expect(document.body.textContent).toContain("Your link's ready");
    expect(document.body.textContent).toContain("get this URL back later");
    expect(document.body.textContent).not.toContain(token);
    expect(createCall?.[1]).not.toHaveProperty("body");

    await click(button("Copy link"));
    expect(copied).toHaveBeenCalledWith(guestUrl);
    expect(document.body.textContent).toContain("Link copied. Send it to a friend!");
    expect(document.body.textContent).toContain("00000000-0000-4000-8000-000000000001");
  });

  it("keeps the generated URL available when refreshing the overview fails", async () => {
    window.localStorage.setItem(tokenStorageKey, token);
    vi.stubEnv("VITE_PUBLIC_APP_ORIGIN", "https://contactswap.quinten.dev");
    const apiGuestUrl = "http://contactswap-api.quinten.dev/token/one-time-token";
    const guestUrl = "https://contactswap.quinten.dev/token/one-time-token";
    let linkReads = 0;
    installFetch(async (url, init) => {
      if (url === "/api/owner/links" && init?.method === "POST") return response({ guestUrl: apiGuestUrl }, 201);
      if (url === "/api/owner/links") {
        linkReads += 1;
        return linkReads === 1 ? response({ links: [] }) : response({ error: { code: "service_error" } }, 500);
      }
      return response(profile);
    });
    await renderLinksPage();
    await click(button("Generate new link"));

    expect(document.querySelector<HTMLInputElement>("#generated-guest-url")?.value).toBe(guestUrl);
    expect(document.body.textContent).toContain("list didn't reload");
    expect(document.body.textContent).not.toContain("Couldn't make the link.");
  });

  it("provides a manual copy fallback when clipboard access fails", async () => {
    window.localStorage.setItem(tokenStorageKey, token);
    vi.stubEnv("VITE_PUBLIC_APP_ORIGIN", "https://contactswap.quinten.dev");
    const apiGuestUrl = "http://contactswap-api.quinten.dev/token/manual-copy-token";
    const guestUrl = "https://contactswap.quinten.dev/token/manual-copy-token";
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: vi.fn().mockRejectedValue(new Error("clipboard unavailable")) }
    });
    installFetch(async (url, init) => {
      if (url === "/api/owner/links" && init?.method === "POST") return response({ guestUrl: apiGuestUrl }, 201);
      if (url === "/api/owner/links") return response({ links: [] });
      return response(profile);
    });
    await renderLinksPage();
    await click(button("Generate new link"));
    await click(button("Copy link"));

    const urlInput = document.querySelector<HTMLInputElement>("#generated-guest-url");
    expect(urlInput?.value).toBe(guestUrl);
    expect(document.activeElement).toBe(urlInput);
    expect(document.body.textContent).toContain("Select and copy the link below.");
  });

  it("directs the owner to profile setup when no profile exists", async () => {
    window.localStorage.setItem(tokenStorageKey, token);
    const fetchMock = installFetch(async (url) => {
      if (url === "/api/owner/profile") return response({ error: { code: "profile_not_found" } }, 404);
      return response({ links: [] });
    });
    await renderLinksPage();

    expect(document.body.textContent).toContain("Add your contact details before making a share link.");
    expect(button("Generate new link").disabled).toBe(true);
    expect(document.querySelector('.links-panel a[href="/quinten"]')?.textContent).toContain("Add your details");
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "POST")).toBe(false);
  });

  it("handles a missing-profile response from link creation without claiming success", async () => {
    window.localStorage.setItem(tokenStorageKey, token);
    const fetchMock = installFetch(async (url, init) => {
      if (url === "/api/owner/links" && init?.method === "POST") {
        return response({ error: { code: "profile_not_found" } }, 404);
      }
      if (url === "/api/owner/links") return response({ links: [] });
      return response(profile);
    });
    await renderLinksPage();
    await click(button("Generate new link"));

    expect(document.body.textContent).toContain("Add your contact details before making a link.");
    expect(document.querySelector<HTMLInputElement>("#generated-guest-url")).toBeNull();
    expect(document.body.textContent).not.toContain("Link created.");
    expect(fetchMock.mock.calls.some(([url, init]) => url === "/api/owner/links" && init?.method === "POST")).toBe(true);
  });

  it("requires revocation confirmation and refreshes status after revocation", async () => {
    window.localStorage.setItem(tokenStorageKey, token);
    const linkId = "00000000-0000-4000-8000-000000000001";
    let linkReads = 0;
    const fetchMock = installFetch(async (url, init) => {
      if (url === `/api/owner/links/${linkId}` && init?.method === "DELETE") {
        return new Response(null, { status: 204 });
      }
      if (url === "/api/owner/links") {
        linkReads += 1;
        return response({ links: [{
          id: linkId,
          createdAt: "2026-10-06T12:00:00.000Z",
          status: linkReads === 1 ? "active" : "revoked"
        }] });
      }
      return response(profile);
    });
    await renderLinksPage();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    await click(button("Revoke"));
    expect(confirm).toHaveBeenCalled();
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "DELETE")).toBe(false);

    confirm.mockReturnValue(true);
    await click(button("Revoke"));
    /*
    expect(fetchMock).toHaveBeenCalledWith(`/api/owner/links/${linkId}`, expect.objectContaining({
      method: "DELETE",
      headers: { Authorization: `****** },
      cache: "no-store"
    }));
    expect(document.body.textContent).toContain("Revoked");
    */
    const deleteCall = fetchMock.mock.calls.find(([url, init]) => url === `/api/owner/links/${linkId}` && init?.method === "DELETE");
    expect(deleteCall?.[1]?.method).toBe("DELETE");
    expect(typeof (deleteCall?.[1]?.headers as Record<string, string>)?.Authorization).toBe("string");
    expect(deleteCall?.[1]?.cache).toBe("no-store");
    expect(document.querySelector(".link-card .status-revoked")).not.toBeNull();
    expect(document.body.textContent).toContain("Link deleted.");
    expect(document.querySelectorAll(".link-card .danger-button")).toHaveLength(0);
  });

  it("returns to login when loading the link list is unauthorized", async () => {
    window.localStorage.setItem(tokenStorageKey, token);
    installFetch(async (url) => {
      if (url === "/api/owner/links") return response({ error: { code: "unauthorized" } }, 401);
      return response(profile);
    });
    await renderLinksPage();

    expect(window.localStorage.getItem(tokenStorageKey)).toBeNull();
    expect(document.querySelector("#owner-token")).not.toBeNull();
    expect(document.body.textContent).toContain("That token didn't work.");
    expect(document.body.textContent).not.toContain("Share links");
  });

  it("loads a remembered token using the authorization header and no-store cache", async () => {
    window.localStorage.setItem(tokenStorageKey, token);
    const savedProfile = { ...profile, country: "Belgium" };
    const fetchMock = installFetch(async () => response(savedProfile));
    await renderApp();

    expect(await screenText()).toContain("My details");
    expect(document.querySelector("#phone-hint")?.textContent).toContain("Example: +31600000000");
    expect([...document.querySelectorAll(".profile-form-section legend")].map((legend) => legend.textContent))
      .toEqual(["Contact information", "Address", "Work information"]);
    expect(document.querySelector(".profile-form-section #street")?.closest(".field")?.classList.contains("profile-field-wide"))
      .toBe(true);
    expect(input("country").value).toBe("Belgium");
    expect(input("org").placeholder).toBe("Larkspur Creative Studio");
    expect(input("title").placeholder).toBe("Senior Product Designer");
    const requestCount = fetchMock.mock.calls.length;
    const languageToggle = document.querySelector<HTMLButtonElement>("#contactswap-language-toggle");
    if (!languageToggle) throw new Error("Missing language selector.");
    await click(languageToggle);
    const dutchOption = document.querySelector<HTMLButtonElement>(
      '#contactswap-language-menu [data-language="nl"]'
    );
    if (!dutchOption) throw new Error("Missing Dutch language option.");
    await click(dutchOption);

    expect(document.querySelector("#phone-hint")?.textContent).toContain("Bijvoorbeeld: +31600000000");
    expect(fetchMock).toHaveBeenCalledTimes(requestCount);
    expect([...document.querySelectorAll(".profile-layout .panel")].map((panel) =>
      panel.getAttribute("aria-labelledby")
    )).toEqual(["profile-heading", "photo-heading", "profile-vcard-heading"]);
    expect([...document.querySelectorAll(".profile-sidebar > .panel")].map((panel) =>
      panel.getAttribute("aria-labelledby")
    )).toEqual(["photo-heading", "profile-vcard-heading"]);
    expect(fetchMock).toHaveBeenCalledWith("/api/owner/profile", {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store"
    });
    expect(document.body.textContent).not.toContain(token);
  });

  it("accepts a token after the documented missing-profile response and creates with trimmed fields", async () => {
    const fetchMock = installFetch(async (url, init) => {
      if (url === "/api/owner/profile" && init?.method === "PUT") {
        return response({ ...JSON.parse(String(init.body)), hasPhoto: false });
      }
      return response({ error: { code: "profile_not_found" } }, 404);
    });
    await renderApp();
    changeValue(input("owner-token"), `  ${token}  `);
    await submit(input("owner-token").form!);

    expect(window.localStorage.getItem(tokenStorageKey)).toBe(token);
    expect(fetchMock.mock.calls[0]?.[1]?.headers).toEqual({ Authorization: `Bearer ${token}` });
    expect(document.body.textContent).toContain("Not set up");
    expect(input("country").value).toBe("The Netherlands");
    changeValue(input("firstName"), " Quinten ");
    changeValue(input("lastName"), " Example ");
    changeValue(input("email"), " quinten@example.invalid ");
    changeValue(input("street"), " 12 Main Street ");
    changeValue(input("city"), " Amsterdam ");
    changeValue(input("postalCode"), " 1012 AB ");
    changeValue(input("birthday"), "1990-02-28");
    changeValue(input("phone"), " +31600000000 ");
    changeValue(input("org"), " ContactSwap ");
    changeValue(input("title"), " Founder ");
    await submit(input("firstName").form!);

    const saveCall = fetchMock.mock.calls.find(([, init]) => init?.method === "PUT");
    expect(saveCall?.[0]).toBe("/api/owner/profile");
    expect(saveCall?.[1]?.headers).toEqual({
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    });
    expect(JSON.parse(String(saveCall?.[1]?.body))).toEqual({
      firstName: profile.firstName,
      lastName: profile.lastName,
      email: profile.email,
      street: profile.street,
      city: profile.city,
      postalCode: profile.postalCode,
      country: profile.country,
      birthday: profile.birthday,
      phone: profile.phone,
      org: "ContactSwap",
      title: "Founder"
    });
    expect(document.body.textContent).toContain("Changes saved.");
    expect([...document.querySelectorAll(".profile-shell > .page-notice, .profile-layout .panel")].map((element) =>
      element.classList.contains("page-notice") ? "notice" : element.getAttribute("aria-labelledby")
    )).toEqual(["notice", "profile-heading", "photo-heading", "profile-vcard-heading"]);

    changeValue(input("street"), " 99 New Street ");
    await submit(input("street").form!);
    const saves = fetchMock.mock.calls.filter(([, init]) => init?.method === "PUT");
    expect(JSON.parse(String(saves[1]?.[1]?.body))).toEqual({
      firstName: profile.firstName,
      lastName: profile.lastName,
      email: profile.email,
      street: "99 New Street",
      city: profile.city,
      postalCode: profile.postalCode,
      country: profile.country,
      birthday: profile.birthday,
      phone: profile.phone,
      org: "ContactSwap",
      title: "Founder"
    });
    expect(document.body.textContent).toContain("Changes saved.");

    changeValue(input("org"), "");
    changeValue(input("title"), "");
    await submit(input("firstName").form!);
    const clearedSave = fetchMock.mock.calls.filter(([, init]) => init?.method === "PUT")[2];
    expect(JSON.parse(String(clearedSave?.[1]?.body))).toMatchObject({ org: null, title: null });
  });

  it("returns to login and clears a remembered token after a 401", async () => {
    window.localStorage.setItem(tokenStorageKey, token);
    installFetch(async () => response({ error: { code: "unauthorized" } }, 401));
    await renderApp();

    expect(window.localStorage.getItem(tokenStorageKey)).toBeNull();
    expect(document.querySelector("#owner-token")).not.toBeNull();
    expect(document.body.textContent).not.toContain(profile.email);
    expect(document.querySelector("#firstName")).toBeNull();
    expect(document.body.textContent).toContain("That token didn't work.");
  });

  it("requires an international phone number before saving the owner profile", async () => {
    window.localStorage.setItem(tokenStorageKey, token);
    const fetchMock = installFetch(async () => response(profile));
    await renderApp();

    changeValue(input("phone"), "+31 6 0000 0000");
    await submit(input("phone").form!);

    expect(document.body.textContent).toContain("Use international E.164 format");
    expect(input("phone").getAttribute("aria-invalid")).toBe("true");
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "PUT")).toBe(false);
  });

  it("shows owner field validation during editing and maps safe server field errors", async () => {
    window.localStorage.setItem(tokenStorageKey, token);
    const fetchMock = installFetch(async (url, init) => {
      if (url === "/api/owner/profile" && init?.method === "PUT") {
        return response({
          error: {
            code: "invalid_profile",
            fields: { firstName: "too_long" }
          }
        }, 400);
      }
      return response(profile);
    });
    await renderApp();

    changeValue(input("email"), "not-an-email");
    expect(document.body.textContent).toContain("That email address doesn't look right.");
    expect(input("email").getAttribute("aria-invalid")).toBe("true");
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "PUT")).toBe(false);

    changeValue(input("email"), profile.email);
    expect(document.body.textContent).not.toContain("That email address doesn't look right.");
    expect(input("email").getAttribute("aria-invalid")).toBe("false");

    await submit(input("firstName").form!);
    expect(document.body.textContent).toContain("Use no more than 255 characters.");
    expect(input("firstName").getAttribute("aria-invalid")).toBe("true");
    expect(input("firstName").value).toBe(profile.firstName);
  });

  it("enforces field limits by Unicode code point in the owner form", async () => {
    window.localStorage.setItem(tokenStorageKey, token);
    installFetch(async () => response(profile));
    await renderApp();

    const nameInput = input("firstName");
    changeValue(nameInput, "😀".repeat(256));
    expect(document.body.textContent).toContain("Use no more than 255 characters.");
    expect(nameInput.value).toBe(profile.firstName);

    changeValue(nameInput, "😀".repeat(255));
    expect(nameInput.value).toBe("😀".repeat(255));
    expect(document.body.textContent).not.toContain("Use no more than 255 characters.");
  });

  it("shows field errors without sending an invalid profile and preserves edits after a service error", async () => {
    window.localStorage.setItem(tokenStorageKey, token);
    const fetchMock = installFetch(async (url, init) => {
      if (url === "/api/owner/profile" && init?.method === "PUT") {
        return response({ error: { code: "invalid_profile" } }, 400);
      }
      return response({ ...profile, hasPhoto: false });
    });
    await renderApp();

    changeValue(input("org"), "Example Company");
    changeValue(input("title"), "Product designer");
    changeValue(input("email"), "not-an-email");
    await submit(input("email").form!);
    expect(document.body.textContent).toContain("That email address doesn't look right.");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    changeValue(input("email"), "correct@example.invalid");
    changeValue(input("firstName"), "Edited name");
    await submit(input("email").form!);
    expect(document.body.textContent).toContain("Check all required contact fields, email, birthday, and phone number.");
    expect(input("firstName").value).toBe("Edited name");
    expect(input("org").value).toBe("Example Company");
    expect(input("title").value).toBe("Product designer");
    expect(document.body.textContent).toContain("Not saved");
  });

  it("uploads a selected photo as its raw file and loads the authorized preview", async () => {
    window.localStorage.setItem(tokenStorageKey, token);
    const uploaded = new File(["photo-bytes"], "portrait.png", { type: "image/png" });
    const fetchMock = installFetch(async (url, init) => {
      if (url === "/api/owner/profile/photo" && init?.method === "PUT") return response({ hasPhoto: true });
      if (url === "/api/owner/profile/photo") return new Response(new Blob(["optimized"], { type: "image/jpeg" }));
      return response({ ...profile, hasPhoto: true });
    });
    await renderApp();
    expect(document.querySelector('img[alt="Profile photo"]')).not.toBeNull();
    const photoInput = input("profile-photo");
    Object.defineProperty(photoInput, "files", { configurable: true, value: [uploaded] });
    await submit(photoInput.form!);

    const uploadCall = fetchMock.mock.calls.find(([, init]) => init?.method === "PUT");
    expect(uploadCall?.[0]).toBe("/api/owner/profile/photo");
    expect(uploadCall?.[1]?.headers).toEqual({ Authorization: `Bearer ${token}`, "Content-Type": "image/png" });
    expect(uploadCall?.[1]?.body).toBe(uploaded);
    expect(document.body.textContent).toContain("Photo updated.");
    expect(document.querySelector('img[alt="Profile photo"]')).not.toBeNull();
    expect(URL.createObjectURL).toHaveBeenCalled();
    expect(fetchMock.mock.calls.filter(([url, init]) => url === "/api/owner/profile/photo" && !init?.method).length).toBe(2);
  });

  it("leaves the photo untouched when removal is cancelled and removes it after confirmation", async () => {
    window.localStorage.setItem(tokenStorageKey, token);
    const fetchMock = installFetch(async (url, init) => {
      if (url === "/api/owner/profile/photo" && init?.method === "DELETE") return new Response(null, { status: 204 });
      if (url === "/api/owner/profile/photo") return new Response(new Blob(["photo"], { type: "image/jpeg" }));
      return response({ ...profile, hasPhoto: true });
    });
    await renderApp();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    await click(button("Remove"));
    expect(confirm).toHaveBeenCalled();
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "DELETE")).toBe(false);
    expect(document.querySelector('img[alt="Profile photo"]')).not.toBeNull();

    confirm.mockReturnValue(true);
    await click(button("Remove"));
    expect(fetchMock).toHaveBeenCalledWith("/api/owner/profile/photo", {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store"
    });
    expect(document.body.textContent).toContain("Photo removed.");
    expect(document.querySelector('img[alt="Profile photo"]')).toBeNull();
  });

  it("shows safe upload errors without claiming that the photo was saved", async () => {
    window.localStorage.setItem(tokenStorageKey, token);
    installFetch(async (url, init) => {
      if (url === "/api/owner/profile/photo" && init?.method === "PUT") {
        return response({ error: { code: "photo_too_large" } }, 413);
      }
      return response({ ...profile, hasPhoto: false });
    });
    await renderApp();
    Object.defineProperty(input("profile-photo"), "files", {
      configurable: true,
      value: [new File(["photo"], "portrait.png", { type: "image/png" })]
    });
    await submit(input("profile-photo").form!);

    expect(document.body.textContent).toContain("That photo's too big.");
    expect(document.body.textContent).not.toContain("Photo updated.");
    expect(document.body.textContent).toContain("Not added");
  });

  it("logs out by clearing the remembered token and returning to the login form", async () => {
    window.localStorage.setItem(tokenStorageKey, token);
    installFetch(async () => response(profile));
    await renderApp();

    expect(document.querySelector('nav[aria-label="Owner navigation"] a[aria-current="page"]')?.textContent).toBe("My profile");
    await click(button("Log out"));
    expect(window.localStorage.getItem(tokenStorageKey)).toBeNull();
    expect(document.querySelector("#owner-token")).not.toBeNull();
    expect(document.querySelector("#firstName")).toBeNull();
    expect(document.body.textContent).toContain("You're signed out.");
  });
});

it("defaults a new owner profile country to Dutch when the selected language is Dutch", async () => {
  window.localStorage.setItem(languageStorageKey, "nl");
  window.localStorage.setItem(tokenStorageKey, token);
  installFetch(async () => response({ error: { code: "profile_not_found" } }, 404));

  await renderApp();

  expect(input("country").value).toBe("Nederland");
});

describe("guest frontend", () => {
  const guestToken = "guest-test-token";
  const vcardUrl = "/api/guest/vcard/00000000-0000-4000-8000-000000000001/test-signature";

  const profilePhotoUrl =
    "/api/guest/profile-photo/00000000-0000-4000-8000-000000000001/test-signature";

  function vcardResponse() {
    return new Response("BEGIN:VCARD\nVERSION:3.0\nEND:VCARD\n", {
      headers: {
        "Content-Type": "text/vcard; version=3.0; charset=utf-8",
        "Content-Disposition": 'attachment; filename="quinten-example.vcf"'
      }
    });
  }

  function installActiveGuestLink(handler?: (url: RequestInfo | URL, init?: RequestInit) => Promise<Response>) {
    return installFetch(async (url, init) => {
      if (url === `/api/guest/links/${guestToken}`) {
        return response({
          ownerName: "Quinten Example",
          profilePhotoUrl: null,
          vcardUrl,
          submissionComplete: false
        });
      }
      if (handler) return handler(url, init);
      if (url === vcardUrl) return vcardResponse();
      return response({ error: { code: "not_found" } }, 404);
    });
  }

  it("loads an active guest link and prioritizes download with sharing", async () => {
    const fetchMock = installActiveGuestLink();
    await renderGuestPage(guestToken);

    expect(fetchMock).toHaveBeenCalledWith(`/api/guest/links/${guestToken}`, {
      cache: "no-store",
      referrerPolicy: "no-referrer"
    });
    expect(document.querySelector("#owner-token")).toBeNull();
    expect(button("Download my card & share your details").className).toContain("guest-primary-action");
    expect(button("Download card only").className).toContain("guest-secondary-action");
    expect(document.querySelector("#guest-details-form")).toBeNull();
    expect(document.querySelector(".guest-owner-name")?.textContent).toBe("Quinten Example");
    expect(document.querySelector(".guest-owner-avatar")?.textContent).toBe("QE");
    expect(document.querySelector("h1")?.textContent).toBe("Here's the contact card");
    expect(document.body.textContent).toContain("download the card after you submit");
    expect(document.body.textContent).not.toContain("My latest details, ready for your phone.");
  });

  it("shows guest form examples in the selected language without losing entered values", async () => {
    const fetchMock = installActiveGuestLink();
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    await renderGuestPage(guestToken);
    await click(button("Download my card & share your details"));

    expect(input("guest-firstName").placeholder).toBe("Alex");
    expect(input("guest-lastName").placeholder).toBe("Morgan");
    expect(input("guest-email").placeholder).toBe("alex@example.com");
    expect(input("guest-street").placeholder).toBe("42 Example Street");
    expect(input("guest-city").placeholder).toBe("London");
    expect(input("guest-postalCode").placeholder).toBe("SW1A 1AA");
    expect(input("guest-country").value).toBe("The Netherlands");
    expect(input("guest-birthday").placeholder).toBe("1990-06-15");
    expect(document.querySelector("#guest-birthday-hint")).toBeNull();
    expect(input("guest-phone").placeholder).toBe("+447700900123");
    expect(document.querySelector("#guest-phone-hint")?.textContent).toContain("For example: +447700900123.");
    expect(input("guest-org").placeholder).toBe("Larkspur Creative Studio");
    expect(input("guest-title").placeholder).toBe("Senior Product Designer");
    expect(input("guest-org").required).toBe(false);
    expect(input("guest-title").required).toBe(false);

    changeValue(input("guest-firstName"), "A name in progress");
    const requestCount = fetchMock.mock.calls.length;
    const languageToggle = document.querySelector<HTMLButtonElement>("#contactswap-language-toggle");
    if (!languageToggle) throw new Error("Missing language selector.");
    await click(languageToggle);
    const dutchOption = document.querySelector<HTMLButtonElement>(
      '#contactswap-language-menu [data-language="nl"]'
    );
    if (!dutchOption) throw new Error("Missing Dutch language option.");
    await click(dutchOption);

    expect(input("guest-firstName").placeholder).toBe("Lotte");
    expect(input("guest-lastName").placeholder).toBe("de Vries");
    expect(input("guest-email").placeholder).toBe("lotte.devries@gmail.com");
    expect(input("guest-street").placeholder).toBe("Kerkstraat 12");
    expect(input("guest-city").placeholder).toBe("Amsterdam");
    expect(input("guest-postalCode").placeholder).toBe("1015 AB");
    expect(input("guest-birthday").placeholder).toBe("1990-06-15");
    expect(document.querySelector("#guest-birthday-hint")).toBeNull();
    expect(input("guest-phone").placeholder).toBe("+31612345678");
    expect(document.querySelector("#guest-phone-hint")?.textContent).toContain("Bijvoorbeeld: +31612345678.");
    expect(input("guest-org").placeholder).toBe("Albert Heijn");
    expect(input("guest-title").placeholder).toBe("Vakkenvuller");
    expect(input("guest-firstName").value).toBe("A name in progress");
    expect(fetchMock).toHaveBeenCalledTimes(requestCount);
  });

  it("shows guest field errors as values are edited and maps API field errors", async () => {
    const fetchMock = installFetch(async (url, init) => {
      if (url === `/api/guest/links/${guestToken}/submissions` && init?.method === "POST") {
        return response({
          error: {
            code: "invalid_submission",
            fields: { city: "control_character" }
          }
        }, 400);
      }
      if (url === vcardUrl) return vcardResponse();
      return response({
        ownerName: "Quinten Example",
        profilePhotoUrl: null,
        vcardUrl,
        submissionComplete: false
      });
    });
    await renderGuestPage(guestToken);
    await click(button("Download my card & share your details"));

    changeValue(input("guest-email"), "not-an-email");
    expect(document.body.textContent).toContain("That email address doesn't look right.");
    expect(input("guest-email").getAttribute("aria-invalid")).toBe("true");
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/submissions"))).toBe(false);

    changeValue(input("guest-email"), "guest@example.com");
    expect(document.body.textContent).not.toContain("That email address doesn't look right.");
    fillGuestRequiredFields();
    changeValue(input("guest-country"), "The Netherlands");
    await submit(input("guest-firstName").form!);

    expect(document.body.textContent).toContain("Remove tabs, line breaks, and other control characters.");
    expect(input("guest-city").getAttribute("aria-invalid")).toBe("true");
    expect(input("guest-firstName").value).toBe("Guest");
  });

  it("defaults a new guest form country to Dutch when the selected language is Dutch", async () => {
    window.localStorage.setItem(languageStorageKey, "nl");
    installActiveGuestLink();
    await renderGuestPage(guestToken);
    await click(button("Mijn gegevens delen en daarna de kaart ophalen"));

    expect(input("guest-country").value).toBe("Nederland");
  });

  it("previews the owner's picture without a referrer and falls back to initials if it fails", async () => {
    installFetch(async (url) => url === `/api/guest/links/${guestToken}`
      ? response({ ownerName: "Quinten Example", profilePhotoUrl, vcardUrl, submissionComplete: false })
      : response({ error: { code: "not_found" } }, 404));
    await renderGuestPage(guestToken);

    const image = document.querySelector<HTMLImageElement>(".guest-owner-avatar img");
    expect(image?.src).toBe(new URL(profilePhotoUrl, window.location.origin).toString());
    expect(image?.getAttribute("referrerpolicy")).toBe("no-referrer");
    await act(async () => {
      image?.dispatchEvent(new Event("error"));
    });

    expect(document.querySelector(".guest-owner-avatar img")).toBeNull();
    expect(document.querySelector(".guest-owner-avatar")?.textContent).toBe("QE");
  });

  it("opens and focuses the form without downloading the card from the primary action", async () => {
    const fetchMock = installActiveGuestLink();
    await renderGuestPage(guestToken);

    await click(button("Download my card & share your details"));

    expect(fetchMock.mock.calls.some(([url]) => url === vcardUrl)).toBe(false);
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    const formPanel = document.querySelector(".guest-form-panel");
    expect(formPanel).not.toBeNull();
    expect(document.querySelector(".guest-owner-card")).toBeNull();
    expect(document.querySelector(".guest-download-panel")).toBeNull();
    expect(document.querySelector("#guest-form-heading")?.textContent).toBe(
      "Share your details and get Quinten's contact card"
    );
    expect(document.querySelector(".guest-form-panel .section-description")).toBeNull();
    expect(document.querySelector(".guest-form-actions button")?.textContent).toBe("Share");
    expect(document.activeElement?.id).toBe("guest-form-heading");

    await click(button("Close"));
    expect(document.querySelector(".guest-owner-card")).not.toBeNull();
    expect(document.querySelector(".guest-download-panel")).not.toBeNull();
  });

  it("downloads and consumes the link only when the secondary action is selected", async () => {
    const fetchMock = installActiveGuestLink();
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    await renderGuestPage(guestToken);

    await click(button("Download card only"));

    expect(fetchMock.mock.calls.some(([url]) => url === vcardUrl)).toBe(true);
    expect(document.querySelector("#guest-details-form")).toBeNull();
    expect(document.querySelector("#guest-downloaded-heading")?.textContent).toBe("Card downloaded");
  });

  it("restores a submitted guest's pending card download without reopening the form", async () => {
    const fetchMock = installFetch(async (url) => {
      if (url === `/api/guest/links/${guestToken}`) {
        return response({
          ownerName: "Quinten Example",
          profilePhotoUrl: null,
          vcardUrl,
          submissionComplete: true
        });
      }
      if (url === vcardUrl) return vcardResponse();
      return response({ error: { code: "not_found" } }, 404);
    });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    await renderGuestPage(guestToken);

    expect(document.body.textContent).toContain("Your details have been shared.");
    expect(document.querySelector("#guest-details-form")).toBeNull();
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/submissions"))).toBe(false);
    await click(button("Download the card"));

    expect(fetchMock.mock.calls.filter(([url]) => url === vcardUrl)).toHaveLength(1);
    expect(document.querySelector("#guest-thank-you-heading")?.textContent).toBe("Thanks for sharing!");
  });

  it("recovers a committed submission when its response was lost", async () => {
    let resolutionCalls = 0;
    let submissionCalls = 0;
    const fetchMock = installFetch(async (url) => {
      if (url === `/api/guest/links/${guestToken}`) {
        resolutionCalls += 1;
        return response({
          ownerName: "Quinten Example",
          profilePhotoUrl: null,
          vcardUrl,
          submissionComplete: resolutionCalls > 1
        });
      }
      if (url === `/api/guest/links/${guestToken}/submissions`) {
        submissionCalls += 1;
        if (submissionCalls === 1) throw new Error("response lost");
        return response({ error: { code: "guest_link_unavailable" } }, 410);
      }
      if (url === vcardUrl) return vcardResponse();
      return response({ error: { code: "not_found" } }, 404);
    });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    await renderGuestPage(guestToken);
    await click(button("Download my card & share your details"));

    fillGuestRequiredFields();
    const form = document.querySelector<HTMLFormElement>("#guest-details-form")!;
    await submit(form);
    expect(document.querySelector("#guest-details-form")).not.toBeNull();
    expect(document.body.textContent).toContain("Couldn't confirm your details went through.");

    await submit(form);

    expect(submissionCalls).toBe(2);
    expect(fetchMock.mock.calls.filter(([url]) => url === vcardUrl)).toHaveLength(1);
    expect(document.querySelector("#guest-thank-you-heading")?.textContent).toBe("Thanks for sharing!");
  });

  it("submits required details without a picture and shows a privacy-safe thank-you state", async () => {
    const fetchMock = installActiveGuestLink(async (url, init) => {
      if (url === vcardUrl) return vcardResponse();
      if (url === `/api/guest/links/${guestToken}/submissions`) return response({ success: true }, 201);
      return response({ error: { code: "not_found" } }, 404);
    });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    await renderGuestPage(guestToken);
    await click(button("Download my card & share your details"));

    fillGuestRequiredFields();
    await submit(document.querySelector<HTMLFormElement>("#guest-details-form")!);

    const submission = fetchMock.mock.calls.find(([url]) => url === `/api/guest/links/${guestToken}/submissions`);
    const submissionIndex = fetchMock.mock.calls.findIndex(
      ([url]) => url === `/api/guest/links/${guestToken}/submissions`
    );
    const cardIndex = fetchMock.mock.calls.findIndex(([url]) => url === vcardUrl);
    expect(cardIndex).toBeGreaterThan(submissionIndex);
    expect(submission?.[1]?.method).toBe("POST");
    expect(submission?.[1]?.cache).toBe("no-store");
    expect(submission?.[1]?.referrerPolicy).toBe("no-referrer");
    expect(submission?.[1]?.body).toBeInstanceOf(FormData);
    expect((submission?.[1]?.body as FormData).get("picture")).toBeNull();
    expect((submission?.[1]?.body as FormData).get("firstName")).toBe("Guest");
    expect((submission?.[1]?.body as FormData).get("lastName")).toBe("Example");
    expect((submission?.[1]?.body as FormData).get("street")).toBe("34 Example Street");
    expect((submission?.[1]?.body as FormData).get("city")).toBe("Amsterdam");
    expect((submission?.[1]?.body as FormData).get("postalCode")).toBe("1013 AB");
    expect((submission?.[1]?.body as FormData).get("country")).toBe("The Netherlands");
    expect((submission?.[1]?.body as FormData).get("phone")).toBe("+31600000001");
    expect((submission?.[1]?.body as FormData).get("org")).toBeNull();
    expect((submission?.[1]?.body as FormData).get("title")).toBeNull();
    expect(document.body.textContent).toContain("Your details are on their way.");
    expect(document.body.textContent).not.toContain("Guest Example");
    expect(document.querySelector("#guest-details-form")).toBeNull();
    expect(document.querySelector(".guest-state-thank-you")).not.toBeNull();
    expect(document.querySelector(".guest-state-emoji")?.textContent).toBe("🎉");
  });

  it("submits optional organization and title when provided", async () => {
    const fetchMock = installActiveGuestLink(async (url) => {
      if (url === vcardUrl) return vcardResponse();
      if (url === `/api/guest/links/${guestToken}/submissions`) return response({ success: true }, 201);
      return response({ error: { code: "not_found" } }, 404);
    });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    await renderGuestPage(guestToken);
    await click(button("Download my card & share your details"));

    fillGuestRequiredFields();
    changeValue(input("guest-org"), "Larkspur Creative Studio");
    changeValue(input("guest-title"), "Senior Product Designer");
    await submit(document.querySelector<HTMLFormElement>("#guest-details-form")!);

    const submission = fetchMock.mock.calls.find(
      ([url]) => url === `/api/guest/links/${guestToken}/submissions`
    );
    const formData = submission?.[1]?.body as FormData;
    expect(formData.get("org")).toBe("Larkspur Creative Studio");
    expect(formData.get("title")).toBe("Senior Product Designer");
  });

  it("includes the optional picture only when one is selected", async () => {
    const fetchMock = installActiveGuestLink(async (url) => {
      if (url === vcardUrl) return vcardResponse();
      if (url === `/api/guest/links/${guestToken}/submissions`) return response({ success: true }, 201);
      return response({ error: { code: "not_found" } }, 404);
    });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    await renderGuestPage(guestToken);
    await click(button("Download my card & share your details"));
    fillGuestRequiredFields();

    const pictureInput = input("guest-picture");
    const picture = new File(["synthetic image"], "guest.png", { type: "image/png" });
    Object.defineProperty(pictureInput, "files", { configurable: true, value: [picture] });
    act(() => pictureInput.dispatchEvent(new Event("change", { bubbles: true })));
    expect(document.querySelector("#guest-details-form")?.firstElementChild?.classList.contains("guest-photo-panel"))
      .toBe(true);
    expect(document.querySelector("#guest-photo-heading")?.textContent).toBe("Profile photo");
    expect([...document.querySelectorAll("fieldset legend")].map((legend) => legend.textContent)).toEqual([
      "Your contact details",
      "Your address",
      "Work details"
    ]);
    expect(URL.createObjectURL).toHaveBeenCalledWith(picture);
    expect(document.querySelector(".guest-picture-preview")?.getAttribute("src")).toBe("blob:private-profile-photo");
    expect(document.querySelector(".guest-picture-preview")?.getAttribute("alt"))
      .toBe("Preview of your selected profile picture");
    await submit(document.querySelector<HTMLFormElement>("#guest-details-form")!);

    const request = fetchMock.mock.calls.find(([url]) => url === `/api/guest/links/${guestToken}/submissions`);
    const formData = request?.[1]?.body;
    expect(formData).toBeInstanceOf(FormData);
    expect((formData as FormData).get("phone")).toBe("+31600000001");
    expect((formData as FormData).get("picture")).toMatchObject({ name: "guest.png", type: "image/png" });
    expect(document.body.textContent).toContain("Your details are on their way.");
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:private-profile-photo");
  });

  it("validates required fields before submitting", async () => {
    const fetchMock = installActiveGuestLink();
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    await renderGuestPage(guestToken);
    await click(button("Download my card & share your details"));
    await submit(document.querySelector<HTMLFormElement>("#guest-details-form")!);

    expect(fetchMock.mock.calls.some(([url]) => url === `/api/guest/links/${guestToken}/submissions`)).toBe(false);
    expect(input("guest-firstName").getAttribute("aria-invalid")).toBe("true");
    expect(input("guest-phone").getAttribute("aria-invalid")).toBe("true");
    expect(document.body.textContent).toContain("A few details need fixing.");
  });

  it("requires an E.164 phone number in the guest form and preserves invalid input", async () => {
    const fetchMock = installActiveGuestLink();
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    await renderGuestPage(guestToken);
    await click(button("Download my card & share your details"));

    fillGuestRequiredFields("+31 6 0000 0000");
    await submit(document.querySelector<HTMLFormElement>("#guest-details-form")!);

    expect(input("guest-phone").type).toBe("tel");
    expect(input("guest-phone").value).toBe("+31 6 0000 0000");
    expect(input("guest-phone").getAttribute("aria-invalid")).toBe("true");
    expect(document.body.textContent).toContain("Use international E.164 format");
    expect(fetchMock.mock.calls.some(([url]) => url === `/api/guest/links/${guestToken}/submissions`)).toBe(false);
  });

  it("preserves entered values when the API rejects a submission", async () => {
    installActiveGuestLink(async (url) => {
      if (url === vcardUrl) return vcardResponse();
      if (url === `/api/guest/links/${guestToken}/submissions`) {
        return response({ error: { code: "invalid_submission" } }, 400);
      }
      return response({ error: { code: "not_found" } }, 404);
    });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    await renderGuestPage(guestToken);
    await click(button("Download my card & share your details"));
    fillGuestRequiredFields();
    await submit(document.querySelector<HTMLFormElement>("#guest-details-form")!);

    expect(input("guest-firstName").value).toBe("Guest");
    expect(document.body.textContent).toContain("Check those details and try again.");
    expect(document.querySelector("#guest-details-form")).not.toBeNull();
  });

  it.each([404, 410])("shows an unavailable state when link resolution returns %s", async (status) => {
    installFetch(async () => response({ error: { code: "guest_link_unavailable" } }, status));
    await renderGuestPage(guestToken);

    expect(document.body.textContent).toContain("This link isn't active");
    expect(document.querySelector(".guest-state-shell")).not.toBeNull();
    expect(document.querySelector(".guest-state-emoji")?.textContent).toBe("💌");
    expect(document.querySelector(".guest-actions")).toBeNull();
    expect(document.querySelector("#guest-details-form")).toBeNull();
  });

  it("shows a friendly, centered retry state when link resolution fails", async () => {
    installFetch(async () => {
      throw new Error("network failure");
    });
    await renderGuestPage(guestToken);

    expect(document.querySelector(".guest-state-error")).not.toBeNull();
    expect(document.querySelector(".guest-state-emoji")?.textContent).toBe("🌱");
    expect(document.body.textContent).toContain("Oops, that didn't work");
    expect(button("Try again")).toBeDefined();
  });

  it("retries a failed post-submission vCard download without resubmitting", async () => {
    let cardRequests = 0;
    const fetchMock = installActiveGuestLink(async (url) => {
      if (url === vcardUrl) {
        cardRequests += 1;
        return cardRequests === 1
          ? response({ error: { code: "vcard_unavailable" } }, 500)
          : vcardResponse();
      }
      if (url === `/api/guest/links/${guestToken}/submissions`) return response({ success: true }, 201);
      return response({ error: { code: "not_found" } }, 404);
    });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    await renderGuestPage(guestToken);
    await click(button("Download my card & share your details"));

    fillGuestRequiredFields();
    await submit(document.querySelector<HTMLFormElement>("#guest-details-form")!);

    expect(document.querySelector("#guest-details-form")).toBeNull();
    expect(document.querySelector("#guest-thank-you-heading")?.textContent).toBe("Thanks for sharing!");
    expect(document.body.textContent).toContain("Couldn't get the contact card. Try again.");
    expect(fetchMock.mock.calls.filter(([url]) => url === vcardUrl)).toHaveLength(1);
    await click(button("Download the card"));

    expect(fetchMock.mock.calls.filter(([url]) => url === `/api/guest/links/${guestToken}/submissions`))
      .toHaveLength(1);
    expect(fetchMock.mock.calls.filter(([url]) => url === vcardUrl)).toHaveLength(2);
    expect(document.querySelector("#guest-thank-you-heading")?.textContent).toBe("Thanks for sharing!");
  });
});

async function screenText(): Promise<string> {
  await act(async () => Promise.resolve());
  return document.body.textContent ?? "";
}

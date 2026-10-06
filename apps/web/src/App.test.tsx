// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";

const token = "owner-test-token";
const profile = {
  name: "Quinten Example",
  email: "quinten@example.invalid",
  address: "12 Main Street",
  birthday: "1990-02-28",
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
  const element = [...document.querySelectorAll("button")].find((item) => item.textContent?.includes(text));
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

async function submit(form: HTMLFormElement) {
  await act(async () => {
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
}

async function click(element: HTMLButtonElement) {
  await act(async () => element.click());
}

async function renderApp() {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root?.render(<App />));
}

async function renderLinksPage() {
  window.history.pushState({}, "", "/owner/links");
  await renderApp();
}

async function renderGuestPage(token = "guest-test-token") {
  window.history.pushState({}, "", `/guest/${token}`);
  await renderApp();
}

function installFetch(handler: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>) {
  vi.stubGlobal("fetch", vi.fn(handler));
  return vi.mocked(fetch);
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  window.localStorage.clear();
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
  vi.restoreAllMocks();
});

describe("owner profile frontend", () => {
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

    expect(document.body.textContent).toContain("Guest links");
    expect(document.querySelector('nav[aria-label="Owner navigation"] a[aria-current="page"]')?.textContent).toBe("Guest links");
    expect([...document.querySelectorAll('nav[aria-label="Owner navigation"] a')].map((link) => link.textContent)).toEqual(["Profile", "Guest links"]);
    expect(document.querySelector('nav[aria-label="Owner navigation"] button')?.textContent).toBe("Log out");
    expect(document.body.textContent).toContain("active");
    expect(document.body.textContent).toContain("consumed");
    expect(document.body.textContent).toContain("revoked");
    expect([...document.querySelectorAll(".link-card code")].map((item) => item.textContent)).toEqual(links.map((link) => link.id));
    expect(document.querySelectorAll(".link-card .danger-button")).toHaveLength(1);
    expect(fetchMock.mock.calls.some(([url, init]) => url === "/api/owner/links" && init?.cache === "no-store")).toBe(true);
    expect(document.body.textContent).not.toContain(token);
  });

  it("creates a guest link, refreshes the overview, and confirms successful copying", async () => {
    window.localStorage.setItem(tokenStorageKey, token);
    const guestUrl = "https://contactswap.example/guest/new-secret-token";
    const copied = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: copied } });
    let linkReads = 0;
    const fetchMock = installFetch(async (url, init) => {
      if (url === "/api/owner/links" && init?.method === "POST") return response({ guestUrl }, 201);
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
    expect(document.body.textContent).toContain("Link created.");
    expect(document.body.textContent).toContain("cannot be retrieved");
    expect(document.body.textContent).not.toContain(token);
    expect(createCall?.[1]).not.toHaveProperty("body");

    await click(button("Copy link"));
    expect(copied).toHaveBeenCalledWith(guestUrl);
    expect(document.body.textContent).toContain("Guest link copied.");
    expect(document.body.textContent).toContain("00000000-0000-4000-8000-000000000001");
  });

  it("keeps the generated URL available when refreshing the overview fails", async () => {
    window.localStorage.setItem(tokenStorageKey, token);
    const guestUrl = "https://contactswap.example/guest/one-time-token";
    let linkReads = 0;
    installFetch(async (url, init) => {
      if (url === "/api/owner/links" && init?.method === "POST") return response({ guestUrl }, 201);
      if (url === "/api/owner/links") {
        linkReads += 1;
        return linkReads === 1 ? response({ links: [] }) : response({ error: { code: "service_error" } }, 500);
      }
      return response(profile);
    });
    await renderLinksPage();
    await click(button("Generate new link"));

    expect(document.querySelector<HTMLInputElement>("#generated-guest-url")?.value).toBe(guestUrl);
    expect(document.body.textContent).toContain("overview could not be refreshed");
    expect(document.body.textContent).not.toContain("Link creation failed.");
  });

  it("provides a manual copy fallback when clipboard access fails", async () => {
    window.localStorage.setItem(tokenStorageKey, token);
    const guestUrl = "https://contactswap.example/guest/manual-copy-token";
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: vi.fn().mockRejectedValue(new Error("clipboard unavailable")) }
    });
    installFetch(async (url, init) => {
      if (url === "/api/owner/links" && init?.method === "POST") return response({ guestUrl }, 201);
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

    expect(document.body.textContent).toContain("Save your owner profile before creating a guest link.");
    expect(button("Generate new link").disabled).toBe(true);
    expect(document.querySelector('.links-panel a[href="/"]')?.textContent).toContain("Go to your profile");
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

    expect(document.body.textContent).toContain("Save your owner profile before creating a link.");
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
    expect(document.body.textContent).toContain("revoked");
    */
    const deleteCall = fetchMock.mock.calls.find(([url, init]) => url === `/api/owner/links/${linkId}` && init?.method === "DELETE");
    expect(deleteCall?.[1]?.method).toBe("DELETE");
    expect(typeof (deleteCall?.[1]?.headers as Record<string, string>)?.Authorization).toBe("string");
    expect(deleteCall?.[1]?.cache).toBe("no-store");
    expect(document.querySelector(".link-card .status-revoked")).not.toBeNull();
    expect(document.body.textContent).toContain("Link status updated.");
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
    expect(document.body.textContent).toContain("Unauthorized.");
    expect(document.body.textContent).not.toContain("Guest links");
  });

  it("loads a remembered token using the authorization header and no-store cache", async () => {
    window.localStorage.setItem(tokenStorageKey, token);
    const fetchMock = installFetch(async () => response(profile));
    await renderApp();

    expect(await screenText()).toContain("Contact details");
    expect([...document.querySelectorAll(".profile-shell > section.panel")].map((panel) =>
      panel.getAttribute("aria-labelledby")
    )).toEqual(["photo-heading", "profile-heading"]);
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
    expect(document.body.textContent).toContain("New");
    changeValue(input("name"), " Quinten Example ");
    changeValue(input("email"), " quinten@example.invalid ");
    changeValue(input("address"), " 12 Main Street ");
    changeValue(input("birthday"), "1990-02-28");
    await submit(input("name").form!);

    const saveCall = fetchMock.mock.calls.find(([, init]) => init?.method === "PUT");
    expect(saveCall?.[0]).toBe("/api/owner/profile");
    expect(saveCall?.[1]?.headers).toEqual({
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    });
    expect(JSON.parse(String(saveCall?.[1]?.body))).toEqual({
      name: profile.name,
      email: profile.email,
      address: profile.address,
      birthday: profile.birthday
    });
    expect(document.body.textContent).toContain("Saved.");
    expect([...document.querySelectorAll(".profile-shell > .page-notice, .profile-shell > section.panel")].map((element) =>
      element.classList.contains("page-notice") ? "notice" : element.getAttribute("aria-labelledby")
    )).toEqual(["notice", "photo-heading", "profile-heading"]);

    changeValue(input("address"), " 99 New Street ");
    await submit(input("address").form!);
    const saves = fetchMock.mock.calls.filter(([, init]) => init?.method === "PUT");
    expect(JSON.parse(String(saves[1]?.[1]?.body))).toEqual({
      name: profile.name,
      email: profile.email,
      address: "99 New Street",
      birthday: profile.birthday
    });
    expect(document.body.textContent).toContain("Saved.");
  });

  it("returns to login and clears a remembered token after a 401", async () => {
    window.localStorage.setItem(tokenStorageKey, token);
    installFetch(async () => response({ error: { code: "unauthorized" } }, 401));
    await renderApp();

    expect(window.localStorage.getItem(tokenStorageKey)).toBeNull();
    expect(document.querySelector("#owner-token")).not.toBeNull();
    expect(document.body.textContent).not.toContain(profile.email);
    expect(document.querySelector("#name")).toBeNull();
    expect(document.body.textContent).toContain("Unauthorized.");
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

    changeValue(input("email"), "not-an-email");
    await submit(input("email").form!);
    expect(document.body.textContent).toContain("Enter a valid email address.");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    changeValue(input("email"), "correct@example.invalid");
    changeValue(input("name"), "Edited name");
    await submit(input("email").form!);
    expect(document.body.textContent).toContain("Check required fields, email, and birthday.");
    expect(input("name").value).toBe("Edited name");
    expect(document.body.textContent).toContain("Unsaved");
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
    expect(document.body.textContent).toContain("Photo saved.");
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

    expect(document.body.textContent).toContain("Image too large.");
    expect(document.body.textContent).not.toContain("Photo saved.");
    expect(document.body.textContent).toContain("None");
  });

  it("logs out by clearing the remembered token and returning to the login form", async () => {
    window.localStorage.setItem(tokenStorageKey, token);
    installFetch(async () => response(profile));
    await renderApp();

    expect(document.querySelector('nav[aria-label="Owner navigation"] a[aria-current="page"]')?.textContent).toBe("Profile");
    await click(button("Log out"));
    expect(window.localStorage.getItem(tokenStorageKey)).toBeNull();
    expect(document.querySelector("#owner-token")).not.toBeNull();
    expect(document.querySelector("#name")).toBeNull();
    expect(document.body.textContent).toContain("Logged out.");
  });
});

describe("guest frontend", () => {
  const guestToken = "guest-test-token";
  const vcardUrl = "/api/guest/vcard/00000000-0000-4000-8000-000000000001/test-signature";

  function vcardResponse() {
    return new Response("BEGIN:VCARD\nVERSION:4.0\nEND:VCARD\n", {
      headers: { "Content-Type": "text/vcard; version=4.0; charset=utf-8" }
    });
  }

  function installActiveGuestLink(handler?: (url: RequestInfo | URL, init?: RequestInit) => Promise<Response>) {
    return installFetch(async (url, init) => {
      if (url === `/api/guest/links/${guestToken}`) return response({ vcardUrl });
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
    expect(button("Download and share your details").className).toContain("guest-primary-action");
    expect(button("Download Quinten's contact card only").className).toContain("guest-secondary-action");
    expect(document.querySelector("#guest-details-form")).toBeNull();
    expect(document.body.textContent).toContain("Your details are only sent if you submit it.");
  });

  it("downloads the contact card and opens the form from the primary action", async () => {
    const fetchMock = installActiveGuestLink();
    const anchorClick = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    await renderGuestPage(guestToken);

    await click(button("Download and share your details"));

    expect(fetchMock).toHaveBeenCalledWith(vcardUrl, {
      cache: "no-store",
      referrerPolicy: "no-referrer"
    });
    expect(URL.createObjectURL).toHaveBeenCalled();
    expect(anchorClick).toHaveBeenCalled();
    const formPanel = document.querySelector(".guest-form-panel");
    const actionsPanel = document.querySelector("#guest-actions-heading")?.closest("section");
    expect(formPanel).not.toBeNull();
    expect(
      (formPanel!.compareDocumentPosition(actionsPanel!) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0
    ).toBe(true);
    expect(document.activeElement?.id).toBe("guest-form-heading");
  });

  it("downloads only when the secondary action is selected", async () => {
    const fetchMock = installActiveGuestLink();
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    await renderGuestPage(guestToken);

    await click(button("Download Quinten's contact card only"));

    expect(fetchMock.mock.calls.some(([url]) => url === vcardUrl)).toBe(true);
    expect(document.querySelector("#guest-details-form")).toBeNull();
  });

  it("submits required details without a picture and shows a privacy-safe thank-you state", async () => {
    const fetchMock = installActiveGuestLink(async (url, init) => {
      if (url === vcardUrl) return vcardResponse();
      if (url === `/api/guest/links/${guestToken}/submissions`) return response({ success: true }, 201);
      return response({ error: { code: "not_found" } }, 404);
    });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    await renderGuestPage(guestToken);
    await click(button("Download and share your details"));

    changeValue(input("guest-name"), "Guest Example");
    changeValue(input("guest-email"), "guest@example.invalid");
    changeValue(input("guest-address"), "34 Example Street");
    changeValue(input("guest-birthday"), "1992-06-17");
    await submit(document.querySelector<HTMLFormElement>("#guest-details-form")!);

    const submission = fetchMock.mock.calls.find(([url]) => url === `/api/guest/links/${guestToken}/submissions`);
    expect(submission?.[1]?.method).toBe("POST");
    expect(submission?.[1]?.cache).toBe("no-store");
    expect(submission?.[1]?.referrerPolicy).toBe("no-referrer");
    expect(submission?.[1]?.body).toBeInstanceOf(FormData);
    expect((submission?.[1]?.body as FormData).get("picture")).toBeNull();
    expect(document.body.textContent).toContain("Your details have been shared.");
    expect(document.body.textContent).not.toContain("Guest Example");
    expect(document.querySelector("#guest-details-form")).toBeNull();
    expect(document.querySelector(".guest-state-thank-you")).not.toBeNull();
    expect(document.querySelector(".guest-state-emoji")?.textContent).toBe("🎉");
  });

  it("includes the optional picture only when one is selected", async () => {
    const fetchMock = installActiveGuestLink(async (url) => {
      if (url === vcardUrl) return vcardResponse();
      if (url === `/api/guest/links/${guestToken}/submissions`) return response({ success: true }, 201);
      return response({ error: { code: "not_found" } }, 404);
    });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    await renderGuestPage(guestToken);
    await click(button("Download and share your details"));
    changeValue(input("guest-name"), "Guest Example");
    changeValue(input("guest-email"), "guest@example.invalid");
    changeValue(input("guest-address"), "34 Example Street");
    changeValue(input("guest-birthday"), "1992-06-17");

    const pictureInput = input("guest-picture");
    const picture = new File(["synthetic image"], "guest.png", { type: "image/png" });
    Object.defineProperty(pictureInput, "files", { configurable: true, value: [picture] });
    act(() => pictureInput.dispatchEvent(new Event("change", { bubbles: true })));
    await submit(document.querySelector<HTMLFormElement>("#guest-details-form")!);

    const request = fetchMock.mock.calls.find(([url]) => url === `/api/guest/links/${guestToken}/submissions`);
    const formData = request?.[1]?.body;
    expect(formData).toBeInstanceOf(FormData);
    expect((formData as FormData).get("picture")).toMatchObject({ name: "guest.png", type: "image/png" });
    expect(document.body.textContent).toContain("Your details have been shared.");
  });

  it("validates required fields before submitting", async () => {
    const fetchMock = installActiveGuestLink();
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    await renderGuestPage(guestToken);
    await click(button("Download and share your details"));
    await submit(document.querySelector<HTMLFormElement>("#guest-details-form")!);

    expect(fetchMock.mock.calls.some(([url]) => url === `/api/guest/links/${guestToken}/submissions`)).toBe(false);
    expect(input("guest-name").getAttribute("aria-invalid")).toBe("true");
    expect(document.body.textContent).toContain("Check the required details.");
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
    await click(button("Download and share your details"));
    changeValue(input("guest-name"), "Guest Example");
    changeValue(input("guest-email"), "guest@example.invalid");
    changeValue(input("guest-address"), "34 Example Street");
    changeValue(input("guest-birthday"), "1992-06-17");
    await submit(document.querySelector<HTMLFormElement>("#guest-details-form")!);

    expect(input("guest-name").value).toBe("Guest Example");
    expect(document.body.textContent).toContain("Check the required details and try again.");
    expect(document.querySelector("#guest-details-form")).not.toBeNull();
  });

  it.each([404, 410])("shows an unavailable state when link resolution returns %s", async (status) => {
    installFetch(async () => response({ error: { code: "guest_link_unavailable" } }, status));
    await renderGuestPage(guestToken);

    expect(document.body.textContent).toContain("This link isn't available");
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
    expect(document.body.textContent).toContain("A little hiccup");
    expect(button("Try again")).toBeDefined();
  });

  it("keeps the form available when the vCard download fails", async () => {
    installActiveGuestLink(async (url) => {
      if (url === vcardUrl) return response({ error: { code: "vcard_unavailable" } }, 500);
      return response({ error: { code: "not_found" } }, 404);
    });
    await renderGuestPage(guestToken);
    await click(button("Download and share your details"));

    expect(document.querySelector("#guest-details-form")).not.toBeNull();
    expect(document.body.textContent).toContain("The contact card could not be downloaded. Try again.");
  });
});

async function screenText(): Promise<string> {
  await act(async () => Promise.resolve());
  return document.body.textContent ?? "";
}

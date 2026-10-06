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
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("owner profile frontend", () => {
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

    await click(button("Log out"));
    expect(window.localStorage.getItem(tokenStorageKey)).toBeNull();
    expect(document.querySelector("#owner-token")).not.toBeNull();
    expect(document.querySelector("#name")).toBeNull();
    expect(document.body.textContent).toContain("Logged out.");
  });
});

async function screenText(): Promise<string> {
  await act(async () => Promise.resolve());
  return document.body.textContent ?? "";
}

import { createExecutionContext } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it, vi } from "vitest";
import app from "../src/index";

const adminToken = "test-only-admin-token";
const profile = {
  name: "Quinten Example",
  email: "quinten@example.invalid",
  address: "123 Owner Street",
  birthday: "1990-02-28",
  phone: "+31600000000"
};
const guest = {
  name: "Morgan Rivera",
  email: "morgan.rivera@example.invalid",
  address: "42 Example Avenue",
  birthday: "1992-07-14",
  phone: "+31600000001"
};
const inputPng = createPng();
const optimizedPhoto = new Uint8Array([
  0xff, 0xd8,
  0xff, 0xda, 0x00, 0x02, 0x01, 0x02,
  0xff, 0xd9
]);

let testEnv: Env;
let generatedPhoto = optimizedPhoto;
let imageFormat = "image/png";
let imageCalls = 0;

function createPng(animated = false): Uint8Array {
  const bytes = new Uint8Array(animated ? 53 : 33);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  new DataView(bytes.buffer).setUint32(8, 13);
  bytes.set([0x49, 0x48, 0x44, 0x52], 12);
  new DataView(bytes.buffer).setUint32(16, 320);
  new DataView(bytes.buffer).setUint32(20, 240);
  if (animated) {
    new DataView(bytes.buffer).setUint32(33, 8);
    bytes.set([0x61, 0x63, 0x54, 0x4c], 37);
  }
  return bytes;
}

function createImagesBinding(): ImagesBinding {
  return {
    info: vi.fn(async () => ({ format: imageFormat, width: 320, height: 240 })),
    input: vi.fn(() => ({
      transform: () => ({
        output: async () => {
          imageCalls += 1;
          return {
            contentType: () => "image/jpeg",
            image: () => new Response(generatedPhoto).body as ReadableStream<Uint8Array>
          };
        }
      })
    }))
  } as unknown as ImagesBinding;
}

async function call(path: string, init: RequestInit = {}, authorized = true): Promise<Response> {
  const headers = new Headers(init.headers);
  if (authorized) {
    headers.set("Authorization", `Bearer ${adminToken}`);
  }
  return app.fetch(
    new Request(`http://contactswap.local${path}`, { ...init, headers }),
    testEnv,
    createExecutionContext()
  );
}

async function createGuestToken(): Promise<string> {
  await call("/api/owner/profile", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(profile)
  });
  const response = await call("/api/owner/links", { method: "POST" });
  const body = (await response.json()) as { guestUrl: string };
  return new URL(body.guestUrl).pathname.split("/").at(-1) as string;
}

function submissionForm(photo?: File): FormData {
  const form = new FormData();
  for (const [field, value] of Object.entries(guest)) {
    form.append(field, value);
  }
  if (photo) {
    form.append("picture", photo);
  }
  return form;
}

function photoFile(
  bytes: Uint8Array = inputPng,
  type = "image/png",
  name = "untrusted-client-name.png"
): File {
  return new File([bytes], name, { type });
}

async function submit(token: string, form: FormData): Promise<Response> {
  return call(`/api/guest/links/${token}/submissions`, { method: "POST", body: form });
}

async function photoKeys(): Promise<string[]> {
  const objects = await env.PHOTOS.list();
  return objects.objects.map((object) => object.key);
}

function toBase64(bytes: Uint8Array): string {
  return btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(""));
}

describe("guest photo API", () => {
  beforeEach(async () => {
    generatedPhoto = optimizedPhoto;
    imageFormat = "image/png";
    imageCalls = 0;
    testEnv = {
      ...env,
      ADMIN_TOKEN: adminToken,
      LINK_SIGNING_KEY: "test-only-link-signing-key-with-32-bytes",
      PUBLIC_APP_ORIGIN: "https://contactswap.quinten.dev",
      IMAGES: createImagesBinding()
    };
    await env.DB.prepare("DROP TRIGGER IF EXISTS fail_guest_photo_notification").run();
    await env.DB.prepare("DELETE FROM notification_outbox").run();
    await env.DB.prepare("DELETE FROM guest_submissions").run();
    await env.DB.prepare("DELETE FROM guest_links").run();
    await env.DB.prepare("DELETE FROM owner_profile").run();
    for (const key of await photoKeys()) {
      await env.PHOTOS.delete(key);
    }
  });

  it("accepts multipart fields without a photo and stores a null photo key", async () => {
    const token = await createGuestToken();
    const response = await submit(token, submissionForm());

    expect(response.status).toBe(201);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({ success: true });
    expect(
      await env.DB.prepare("SELECT photo_key FROM guest_submissions").first()
    ).toEqual({ photo_key: null });
    expect(await photoKeys()).toEqual([]);
    expect(imageCalls).toBe(0);
  });

  it("stores only the optimized photo under the private guest prefix and embeds those bytes in the owner vCard", async () => {
    const token = await createGuestToken();
    const response = await submit(token, submissionForm(photoFile()));
    const responseBody = JSON.stringify(await response.json());
    const stored = await env.DB.prepare(
      "SELECT id, photo_key FROM guest_submissions"
    ).first<{ id: string; photo_key: string }>();

    expect(response.status).toBe(201);
    expect(responseBody).toEqual(JSON.stringify({ success: true }));
    expect(responseBody).not.toContain("photo_key");
    expect(responseBody).not.toContain("untrusted-client-name.png");
    expect(stored?.photo_key).toMatch(/^guest-submissions\/[0-9a-f-]+\.jpg$/i);
    expect(await photoKeys()).toEqual([stored?.photo_key]);
    expect(imageCalls).toBe(1);

    const object = await env.PHOTOS.get(stored!.photo_key);
    expect(object?.httpMetadata?.contentType).toBe("image/jpeg");
    expect(new Uint8Array(await object!.arrayBuffer())).toEqual(optimizedPhoto);

    const unauthorized = await call(`/api/owner/submissions/${stored!.id}/vcard`, {}, false);
    expect(unauthorized.status).toBe(401);
    expect(await unauthorized.text()).not.toContain(toBase64(optimizedPhoto));

    const detail = await call(`/api/owner/submissions/${stored!.id}`);
    expect(await detail.json()).toEqual({
      id: stored!.id,
      ...guest,
      org: null,
      title: null,
      createdAt: expect.any(String),
      expiresAt: expect.any(String)
    });

    const cardResponse = await call(`/api/owner/submissions/${stored!.id}/vcard`);
    const card = await cardResponse.text();
    expect(cardResponse.status).toBe(200);
    expect(cardResponse.headers.get("Cache-Control")).toBe("no-store");
    expect(cardResponse.headers.get("Content-Type")).toBe("text/vcard; version=3.0; charset=utf-8");
    const unfolded = card.replaceAll("\r\n ", "");
    expect(card).toContain("VERSION:3.0\r\n");
    expect(unfolded).toContain(
      `PHOTO;ENCODING=b;TYPE=JPEG:${toBase64(optimizedPhoto)}\r\n`
    );
    const photoBase64 = unfolded.match(/PHOTO;ENCODING=b;TYPE=JPEG:([^\r\n]+)/)?.[1];
    expect(photoBase64).toBe(toBase64(optimizedPhoto));
    expect(new Uint8Array([...atob(photoBase64!).split("").map((character) => character.charCodeAt(0))]))
      .toEqual(optimizedPhoto);
    expect(card.split("\r\n").filter(Boolean).every((line) => new TextEncoder().encode(line).length <= 75))
      .toBe(true);
  });

  it("rejects malformed, duplicated, non-file, missing, and unsupported multipart fields", async () => {
    const token = await createGuestToken();
    const duplicate = submissionForm();
    duplicate.append("email", guest.email);
    const duplicatePicture = submissionForm();
    duplicatePicture.append("picture", photoFile());
    duplicatePicture.append("picture", photoFile());
    const nonFilePicture = submissionForm();
    nonFilePicture.append("picture", "https://example.invalid/photo.jpg");
    const missingField = new FormData();
    missingField.append("name", guest.name);
    missingField.append("email", guest.email);
    missingField.append("address", guest.address);
    const extraField = submissionForm();
    extraField.append("extra", "not accepted");

    const invalidForms = [
      ["duplicate required field", duplicate],
      ["duplicate picture", duplicatePicture],
      ["non-file picture", nonFilePicture],
      ["missing required field", missingField],
      ["unsupported extra field", extraField]
    ] as const;
    for (const [description, form] of invalidForms) {
      const response = await submit(token, form);
      expect(response.status, description).toBe(400);
      expect(await response.json()).toMatchObject({ error: { code: "invalid_submission" } });
    }

    const malformed = await call(`/api/guest/links/${token}/submissions`, {
      method: "POST",
      headers: { "Content-Type": "multipart/form-data; boundary=broken" },
      body: "not a multipart body"
    });
    expect(malformed.status).toBe(400);
    expect(await malformed.json()).toMatchObject({ error: { code: "invalid_submission" } });
    expect((await call(`/api/guest/links/${token}`)).status).toBe(200);
    expect(await env.DB.prepare("SELECT id FROM guest_submissions").first()).toBeNull();
    expect(await photoKeys()).toEqual([]);
    expect(imageCalls).toBe(0);
  });

  it("returns stable photo errors for unsupported, empty, mismatched, animated, and oversized files", async () => {
    const token = await createGuestToken();
    const cases: { file: File; status: number; code: string }[] = [
      { file: photoFile(inputPng, "image/svg+xml"), status: 415, code: "unsupported_photo_type" },
      { file: photoFile(new Uint8Array(), "image/png"), status: 400, code: "invalid_photo" },
      { file: photoFile(inputPng, "image/jpeg"), status: 400, code: "invalid_photo" },
      { file: photoFile(createPng(true)), status: 400, code: "invalid_photo" },
      {
        file: photoFile(new Uint8Array(19 * 1024 * 1024 + 1)),
        status: 413,
        code: "photo_too_large"
      }
    ];

    for (const { file, status, code } of cases) {
      const response = await submit(token, submissionForm(file));
      expect(response.status).toBe(status);
      expect(await response.json()).toMatchObject({ error: { code } });
      expect((await call(`/api/guest/links/${token}`)).status).toBe(200);
    }

    generatedPhoto = new Uint8Array(80 * 1024);
    generatedPhoto.set([0xff, 0xd8, 0xff, 0xda, 0x00, 0x02]);
    generatedPhoto.set([0xff, 0xd9], generatedPhoto.byteLength - 2);
    const uncompressible = await submit(token, submissionForm(photoFile()));
    expect(uncompressible.status).toBe(422);
    expect(await uncompressible.json()).toMatchObject({
      error: { code: "photo_too_large" }
    });
    expect((await call(`/api/guest/links/${token}`)).status).toBe(200);
    expect(await env.DB.prepare("SELECT id FROM guest_submissions").first()).toBeNull();
    expect(await photoKeys()).toEqual([]);
  });

  it("checks link availability before image processing and preserves unknown and consumed responses", async () => {
    const token = await createGuestToken();
    const unknown = await submit("unknown-token", submissionForm(photoFile()));
    expect(unknown.status).toBe(404);
    expect(imageCalls).toBe(0);
    expect(await photoKeys()).toEqual([]);

    expect((await submit(token, submissionForm())).status).toBe(201);
    const consumed = await submit(token, submissionForm(photoFile()));
    expect(consumed.status).toBe(410);
    expect(imageCalls).toBe(0);
    expect(await photoKeys()).toEqual([]);
  });

  it("allows only one concurrent photo submission and keeps every created key under the expiring prefix", async () => {
    const token = await createGuestToken();
    const responses = await Promise.all([
      submit(token, submissionForm(photoFile())),
      submit(token, submissionForm(photoFile()))
    ]);

    expect(responses.map((response) => response.status).sort()).toEqual([201, 410]);
    const stored = await env.DB.prepare(
      "SELECT photo_key FROM guest_submissions"
    ).first<{ photo_key: string }>();
    expect(stored?.photo_key).toMatch(/^guest-submissions\//);
    const objects = await photoKeys();
    expect(objects.length).toBeGreaterThanOrEqual(1);
    expect(objects.every((key) => key.startsWith("guest-submissions/"))).toBe(true);
    expect(objects).toContain(stored?.photo_key);
    expect(
      await env.DB.prepare("SELECT COUNT(*) AS count FROM notification_outbox").first()
    ).toEqual({ count: 1 });
  });

  it("does not persist or consume a link when the R2 write fails", async () => {
    const token = await createGuestToken();
    testEnv = {
      ...testEnv,
      PHOTOS: {
        put: async () => {
          throw new Error("synthetic R2 write failure");
        }
      } as unknown as R2Bucket
    };
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await submit(token, submissionForm(photoFile()));

    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain(guest.email);
    expect((await call(`/api/guest/links/${token}`)).status).toBe(200);
    expect(await env.DB.prepare("SELECT id FROM guest_submissions").first()).toBeNull();
    expect(await env.DB.prepare("SELECT id FROM notification_outbox").first()).toBeNull();
    expect(await photoKeys()).toEqual([]);
  });

  it("leaves uploaded objects for lifecycle cleanup when D1 persistence fails", async () => {
    const token = await createGuestToken();
    await env.DB.prepare(
      `CREATE TRIGGER fail_guest_photo_notification BEFORE INSERT ON notification_outbox
       BEGIN SELECT RAISE(ABORT, 'forced test failure'); END`
    ).run();
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await submit(token, submissionForm(photoFile()));

    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain(guest.email);
    expect((await call(`/api/guest/links/${token}`)).status).toBe(200);
    expect(await env.DB.prepare("SELECT id FROM guest_submissions").first()).toBeNull();
    expect(await env.DB.prepare("SELECT id FROM notification_outbox").first()).toBeNull();
    expect(await photoKeys()).toHaveLength(1);
    expect((await photoKeys())[0]).toMatch(/^guest-submissions\//);
  });

  it("fails safely when a retained photo object is missing or its submission has expired", async () => {
    const token = await createGuestToken();
    await submit(token, submissionForm(photoFile()));
    const stored = await env.DB.prepare(
      "SELECT id, photo_key FROM guest_submissions"
    ).first<{ id: string; photo_key: string }>();

    const expired = await call(`/api/owner/submissions/${stored!.id}/vcard`, {}, false);
    expect(expired.status).toBe(401);

    await env.PHOTOS.delete(stored!.photo_key);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const missingObject = await call(`/api/owner/submissions/${stored!.id}/vcard`);
    expect(missingObject.status).toBe(500);
    const missingBody = await missingObject.text();
    expect(missingBody).not.toContain(guest.email);
    expect(missingBody).not.toContain(stored!.photo_key);

    await env.DB.prepare("UPDATE guest_submissions SET expires_at = ? WHERE id = ?")
      .bind(new Date(Date.now() - 1).toISOString(), stored!.id)
      .run();
    const expiredAfterBoundary = await call(`/api/owner/submissions/${stored!.id}/vcard`);
    expect(expiredAfterBoundary.status).toBe(404);
    expect(await expiredAfterBoundary.text()).not.toContain(guest.email);
  });
});

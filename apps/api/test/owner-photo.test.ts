import { createExecutionContext } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it, vi } from "vitest";
import app from "../src/index";
import { photoLimits, readPhotoBody } from "../src/photo";

const adminToken = "test-only-admin-token";
const baseProfile = {
  name: "Quinten Example",
  email: "quinten@example.invalid",
  address: "123 Example Street",
  birthday: "1990-02-28",
  phone: "+31600000000",
  org: null,
  title: null
};
const inputPng = createPng();
const photoWithMetadata = new Uint8Array([
  0xff, 0xd8,
  0xff, 0xe1, 0x00, 0x08, 0x45, 0x78, 0x69, 0x66, 0x00, 0x00,
  0xff, 0xda, 0x00, 0x02, 0x01, 0x02,
  0xff, 0xd9
]);
const optimizedPhoto = new Uint8Array([
  0xff, 0xd8,
  0xff, 0xda, 0x00, 0x02, 0x01, 0x02,
  0xff, 0xd9
]);

let generatedPhoto: Uint8Array = photoWithMetadata;
let sourceImageFormat = "image/png";
let transformCalls: { transform: ImageTransform; output: ImageOutputOptions }[] = [];
let testEnv: Env;

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
  const binding = {
    info: vi.fn(async () => ({ format: sourceImageFormat, width: 320, height: 240 })),
    input: vi.fn(() => {
      let currentTransform: ImageTransform = {};
      return {
        transform: (transform: ImageTransform) => {
          currentTransform = transform;
          return {
            output: async (output: ImageOutputOptions) => {
              transformCalls.push({ transform: currentTransform, output });
              const bytes = generatedPhoto;
              return {
                contentType: () => output.format,
                image: () => new Response(bytes).body as ReadableStream<Uint8Array>
              };
            }
          };
        }
      };
    })
  };
  return binding as unknown as ImagesBinding;
}

async function call(
  path: string,
  init: RequestInit = {},
  token: string | null = adminToken
): Promise<Response> {
  const headers = new Headers(init.headers);
  if (token !== null) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  return await app.fetch(
    new Request(`http://contactswap.local${path}`, { ...init, headers }),
    testEnv,
    createExecutionContext()
  );
}

function photoRequest(bytes: Uint8Array, contentType = "image/png"): RequestInit {
  return {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: bytes.buffer as ArrayBuffer
  };
}

async function saveProfile(): Promise<void> {
  await call("/api/owner/profile", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(baseProfile)
  });
}

async function storedPhotoKey(): Promise<string | null> {
  const profile = await env.DB.prepare("SELECT photo_key FROM owner_profile WHERE id = 1")
    .first<{ photo_key: string | null }>();
  return profile?.photo_key ?? null;
}

async function photoObjectKeys(): Promise<string[]> {
  const objects = await env.PHOTOS.list();
  return objects.objects.map((object) => object.key);
}

function toBase64(bytes: Uint8Array): string {
  return btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(""));
}

describe("owner profile photo API", () => {
  beforeEach(async () => {
    generatedPhoto = photoWithMetadata;
    sourceImageFormat = "image/png";
    transformCalls = [];
    testEnv = {
      ...env,
      ADMIN_TOKEN: adminToken,
      LINK_SIGNING_KEY: "test-only-link-signing-key-with-32-bytes",
      PUBLIC_APP_ORIGIN: "https://contactswap.quinten.dev",
      IMAGES: createImagesBinding()
    };
    await env.DB.prepare("DELETE FROM owner_profile").run();
    for (const key of await photoObjectKeys()) {
      await env.PHOTOS.delete(key);
    }
  });

  it("requires authorization and an existing profile before reading or storing a photo", async () => {
    const unauthorized = await call("/api/owner/profile/photo", photoRequest(inputPng), null);
    expect(unauthorized.status).toBe(401);
    expect(unauthorized.headers.get("Cache-Control")).toBe("no-store");
    expect(await photoObjectKeys()).toEqual([]);

    const uploadBeforeProfile = await call("/api/owner/profile/photo", photoRequest(inputPng));
    expect(uploadBeforeProfile.status).toBe(404);
    expect(await photoObjectKeys()).toEqual([]);
    expect(transformCalls).toEqual([]);
  });

  it("rejects unsupported, mismatched, empty, animated, and oversized uploads", async () => {
    await saveProfile();

    expect((await call("/api/owner/profile/photo", photoRequest(inputPng, "image/svg+xml"))).status)
      .toBe(415);
    expect((await call("/api/owner/profile/photo", photoRequest(inputPng, "image/jpeg"))).status)
      .toBe(400);
    expect((await call("/api/owner/profile/photo", photoRequest(new Uint8Array()))).status).toBe(400);
    expect((await call("/api/owner/profile/photo", photoRequest(createPng(true)))).status).toBe(400);

    const oversized = await call("/api/owner/profile/photo", {
      ...photoRequest(inputPng),
      headers: { "Content-Type": "image/png", "Content-Length": `${19 * 1024 * 1024 + 1}` }
    });
    expect(oversized.status).toBe(413);
    expect(await photoObjectKeys()).toEqual([]);
    expect(transformCalls).toEqual([]);
  });

  it("enforces the source limit while reading a streamed body", async () => {
    const chunk = new Uint8Array(1024 * 1024);
    let emittedBytes = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (emittedBytes < photoLimits.maxSourceBytes) {
          const nextSize = Math.min(chunk.byteLength, photoLimits.maxSourceBytes - emittedBytes);
          controller.enqueue(chunk.subarray(0, nextSize));
          emittedBytes += nextSize;
          return;
        }
        controller.enqueue(new Uint8Array([0]));
      }
    });

    await expect(readPhotoBody(body)).rejects.toMatchObject({
      code: "photo_too_large",
      status: 413
    });
  });

  it("accepts JPEG, PNG, and WebP source signatures", async () => {
    await saveProfile();
    const webp = new Uint8Array(20);
    webp.set(new TextEncoder().encode("RIFF"), 0);
    new DataView(webp.buffer).setUint32(4, 12, true);
    webp.set(new TextEncoder().encode("WEBP"), 8);
    webp.set(new TextEncoder().encode("VP8 "), 12);

    const supportedImages = [
      { contentType: "image/jpeg", bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]) },
      { contentType: "image/png", bytes: inputPng },
      { contentType: "image/webp", bytes: webp }
    ];

    for (const image of supportedImages) {
      sourceImageFormat = image.contentType;
      const response = await call(
        "/api/owner/profile/photo",
        photoRequest(image.bytes, image.contentType)
      );
      expect(response.status).toBe(200);
    }
    expect(await photoObjectKeys()).toHaveLength(1);
  });

  it("normalizes to metadata-free JPEG, serves it privately, and embeds identical bytes in vCards", async () => {
    await saveProfile();

    const upload = await call("/api/owner/profile/photo", photoRequest(inputPng));
    expect(upload.status).toBe(200);
    expect(await upload.json()).toEqual({ hasPhoto: true });
    expect(transformCalls).toEqual([
      {
        transform: { width: 256, height: 256 },
        output: { format: "image/jpeg", quality: 85 }
      }
    ]);
    expect(await storedPhotoKey()).toMatch(/^owner-profile\/[0-9a-f-]+\.jpg$/i);
    expect(await photoObjectKeys()).toEqual([await storedPhotoKey()]);

    const profileResponse = await call("/api/owner/profile");
    expect(await profileResponse.json()).toEqual({ ...baseProfile, hasPhoto: true });

    const preview = await call("/api/owner/profile/photo");
    expect(preview.status).toBe(200);
    expect(preview.headers.get("Content-Type")).toBe("image/jpeg");
    expect(preview.headers.get("Content-Disposition")).toBe("inline");
    expect(preview.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(preview.headers.get("Cache-Control")).toBe("no-store");
    expect(new Uint8Array(await preview.arrayBuffer())).toEqual(optimizedPhoto);

    const ownerCard = await (await call("/api/owner/profile/vcard")).text();
    const photoLine = `PHOTO;ENCODING=b;TYPE=JPEG:${toBase64(optimizedPhoto)}`;
    const unfoldedOwnerCard = ownerCard.replaceAll("\r\n ", "");
    expect(unfoldedOwnerCard).toContain(`${photoLine}\r\n`);
    expect(ownerCard).toContain("VERSION:3.0\r\n");
    const photoBase64 = unfoldedOwnerCard.match(/PHOTO;ENCODING=b;TYPE=JPEG:([^\r\n]+)/)?.[1];
    expect(photoBase64).toBe(toBase64(optimizedPhoto));
    expect(new Uint8Array([...atob(photoBase64!).split("").map((character) => character.charCodeAt(0))]))
      .toEqual(optimizedPhoto);
    expect(ownerCard.split("\r\n").filter(Boolean).every((line) => new TextEncoder().encode(line).length <= 75))
      .toBe(true);

    await call("/api/owner/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...baseProfile, address: "99 New Street" })
    });
    expect(await storedPhotoKey()).not.toBeNull();
    expect((await (await call("/api/owner/profile/vcard")).text()).replaceAll("\r\n ", ""))
      .toContain("ADR;TYPE=home:;;99 New Street;;;;\r\n");

    const linkResponse = await call("/api/owner/links", { method: "POST" });
    const guestUrl = new URL(((await linkResponse.json()) as { guestUrl: string }).guestUrl);
    const guestToken = guestUrl.pathname.split("/").at(-1);
    const vcardUrl = ((await (await call(`/api/guest/links/${guestToken}`)).json()) as {
      vcardUrl: string;
    }).vcardUrl;
    const guestCard = await (await call(vcardUrl)).text();
    expect(guestCard.replaceAll("\r\n ", "")).toContain(`${photoLine}\r\n`);
  });

  it("keeps the existing photo when all bounded output variants exceed the cap", async () => {
    await saveProfile();
    expect((await call("/api/owner/profile/photo", photoRequest(inputPng))).status).toBe(200);
    const originalKey = await storedPhotoKey();
    const originalObjects = await photoObjectKeys();

    transformCalls = [];
    generatedPhoto = createOversizedJpeg();
    const replacement = await call("/api/owner/profile/photo", photoRequest(inputPng));

    expect(replacement.status).toBe(422);
    expect(await replacement.json()).toMatchObject({ error: { code: "photo_too_large" } });
    expect(await storedPhotoKey()).toBe(originalKey);
    expect(await photoObjectKeys()).toEqual(originalObjects);
    expect(transformCalls).toHaveLength(12);
  });

  it("leaves no stored photo when image processing or the R2 write fails", async () => {
    await saveProfile();
    const originalBucket = env.PHOTOS;
    testEnv = {
      ...testEnv,
      IMAGES: {
        info: async () => {
          throw new Error("synthetic image binding failure");
        }
      } as unknown as ImagesBinding
    };

    const imageFailure = await call("/api/owner/profile/photo", photoRequest(inputPng));
    expect(imageFailure.status).toBe(500);
    expect(await storedPhotoKey()).toBeNull();
    expect(await photoObjectKeys()).toEqual([]);

    testEnv = {
      ...testEnv,
      IMAGES: createImagesBinding(),
      PHOTOS: {
        get: originalBucket.get.bind(originalBucket),
        put: async () => {
          throw new Error("synthetic R2 write failure");
        },
        delete: originalBucket.delete.bind(originalBucket),
        list: originalBucket.list.bind(originalBucket)
      } as unknown as R2Bucket
    };

    const storageFailure = await call("/api/owner/profile/photo", photoRequest(inputPng));
    expect(storageFailure.status).toBe(500);
    expect(await storedPhotoKey()).toBeNull();
    expect(await photoObjectKeys()).toEqual([]);
  });

  it("cleans up the new R2 object when the D1 reference update fails", async () => {
    await saveProfile();
    const failingDatabase = new Proxy(env.DB, {
      get(target, property) {
        if (property === "prepare") {
          return (query: string) => {
            if (query.startsWith("UPDATE owner_profile SET photo_key = ?, updated_at")) {
              return {
                bind: () => ({
                  run: async () => {
                    throw new Error("synthetic D1 update failure");
                  }
                }) as unknown as D1PreparedStatement
              };
            }
            return target.prepare(query);
          };
        }
        return Reflect.get(target, property, target);
      }
    });
    testEnv = { ...testEnv, DB: failingDatabase };

    const response = await call("/api/owner/profile/photo", photoRequest(inputPng));

    expect(response.status).toBe(500);
    expect(await storedPhotoKey()).toBeNull();
    expect(await photoObjectKeys()).toEqual([]);
  });

  it("restores the prior D1 key when removing the old R2 object fails during replacement", async () => {
    await saveProfile();
    await call("/api/owner/profile/photo", photoRequest(inputPng));
    const originalKey = await storedPhotoKey();
    const originalBucket = env.PHOTOS;
    testEnv = {
      ...testEnv,
      PHOTOS: {
        get: originalBucket.get.bind(originalBucket),
        put: originalBucket.put.bind(originalBucket),
        delete: async (key: string) => {
          if (key === originalKey) {
            throw new Error("synthetic R2 delete failure");
          }
          return originalBucket.delete(key);
        },
        list: originalBucket.list.bind(originalBucket)
      } as unknown as R2Bucket
    };

    const response = await call("/api/owner/profile/photo", photoRequest(inputPng));

    expect(response.status).toBe(500);
    expect(await storedPhotoKey()).toBe(originalKey);
    expect(await photoObjectKeys()).toEqual([originalKey]);
  });

  it("replaces and removes photos idempotently, clearing later vCard output", async () => {
    await saveProfile();
    await call("/api/owner/profile/photo", photoRequest(inputPng));
    const oldKey = await storedPhotoKey();

    const replacement = await call("/api/owner/profile/photo", photoRequest(inputPng));
    const newKey = await storedPhotoKey();
    expect(replacement.status).toBe(200);
    expect(newKey).not.toBe(oldKey);
    expect(await photoObjectKeys()).toEqual([newKey]);

    expect((await call("/api/owner/profile/photo", {}, null)).status).toBe(401);
    expect((await call("/api/owner/profile/photo", { method: "DELETE" }, null)).status).toBe(401);
    expect((await call("/api/owner/profile/photo", { method: "GET" }, null)).status).toBe(401);

    const remove = await call("/api/owner/profile/photo", { method: "DELETE" });
    expect(remove.status).toBe(204);
    expect(await storedPhotoKey()).toBeNull();
    expect(await photoObjectKeys()).toEqual([]);
    expect((await call("/api/owner/profile/photo")).status).toBe(404);
    expect((await call("/api/owner/profile").then((response) => response.json())))
      .toMatchObject({ hasPhoto: false });
    expect((await (await call("/api/owner/profile/vcard")).text())).not.toContain("PHOTO:");
    expect((await call("/api/owner/profile/photo", { method: "DELETE" })).status).toBe(204);
  });
});

function createOversizedJpeg(): Uint8Array {
  const bytes = new Uint8Array(80 * 1024);
  bytes.set([0xff, 0xd8, 0xff, 0xda, 0x00, 0x02]);
  bytes.set([0xff, 0xd9], bytes.byteLength - 2);
  return bytes;
}
const maxSourceBytes = 19 * 1024 * 1024;
const maxOptimizedBytes = 75 * 1024;
const outputDimensions = [256, 192, 128, 96];
const outputQualities = [85, 75, 65];

export class PhotoRequestError extends Error {
  constructor(
    readonly code: "invalid_photo" | "photo_too_large",
    readonly status: 400 | 413 | 422
  ) {
    super(code);
  }
}

function bytesToString(bytes: Uint8Array): string {
  return String.fromCharCode(...bytes);
}

function matches(bytes: Uint8Array, offset: number, value: string): boolean {
  return bytesToString(bytes.subarray(offset, offset + value.length)) === value;
}

function isAnimatedPng(bytes: Uint8Array): boolean {
  let offset = 8;
  while (offset + 12 <= bytes.byteLength) {
    const length = new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getUint32(0);
    if (length > bytes.byteLength - offset - 12) {
      throw new PhotoRequestError("invalid_photo", 400);
    }
    if (matches(bytes, offset + 4, "acTL")) {
      return true;
    }
    if (matches(bytes, offset + 4, "IEND")) {
      return false;
    }
    offset += length + 12;
  }
  return false;
}

function isAnimatedWebp(bytes: Uint8Array): boolean {
  const declaredLength = new DataView(bytes.buffer, bytes.byteOffset + 4, 4).getUint32(0, true) + 8;
  if (declaredLength > bytes.byteLength || declaredLength < 12) {
    throw new PhotoRequestError("invalid_photo", 400);
  }

  let offset = 12;
  while (offset + 8 <= declaredLength) {
    const chunkLength = new DataView(bytes.buffer, bytes.byteOffset + offset + 4, 4).getUint32(0, true);
    const chunkEnd = offset + 8 + chunkLength;
    if (chunkEnd > declaredLength) {
      throw new PhotoRequestError("invalid_photo", 400);
    }
    if (matches(bytes, offset, "ANIM") || matches(bytes, offset, "ANMF")) {
      return true;
    }
    if (matches(bytes, offset, "VP8X") && chunkLength >= 1 && (bytes[offset + 8] & 0x02) !== 0) {
      return true;
    }
    offset = chunkEnd + (chunkLength % 2);
  }
  return false;
}

export async function readPhotoBody(body: ReadableStream<Uint8Array> | null): Promise<Uint8Array> {
  if (!body) {
    throw new PhotoRequestError("invalid_photo", 400);
  }

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    totalBytes += value.byteLength;
    if (totalBytes > maxSourceBytes) {
      await reader.cancel();
      throw new PhotoRequestError("photo_too_large", 413);
    }
    chunks.push(value);
  }

  if (totalBytes === 0) {
    throw new PhotoRequestError("invalid_photo", 400);
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

export function validatePhotoSignature(bytes: Uint8Array, contentType: string): void {
  if (contentType === "image/jpeg") {
    if (bytes.byteLength < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) {
      throw new PhotoRequestError("invalid_photo", 400);
    }
    return;
  }

  if (contentType === "image/png") {
    const validPng =
      bytes.byteLength >= 33 &&
      matches(bytes, 0, "\x89PNG\r\n\x1a\n") &&
      matches(bytes, 12, "IHDR") &&
      new DataView(bytes.buffer, bytes.byteOffset + 8, 4).getUint32(0) === 13;
    if (!validPng || isAnimatedPng(bytes)) {
      throw new PhotoRequestError("invalid_photo", 400);
    }
    return;
  }

  if (contentType === "image/webp") {
    if (bytes.byteLength < 20 || !matches(bytes, 0, "RIFF") || !matches(bytes, 8, "WEBP")) {
      throw new PhotoRequestError("invalid_photo", 400);
    }
    if (isAnimatedWebp(bytes)) {
      throw new PhotoRequestError("invalid_photo", 400);
    }
    return;
  }

  throw new PhotoRequestError("invalid_photo", 400);
}

function streamFrom(bytes: Uint8Array): ReadableStream<Uint8Array> {
  return new Response(bytes).body as ReadableStream<Uint8Array>;
}

function stripJpegMetadata(bytes: Uint8Array): Uint8Array {
  if (bytes.byteLength < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    throw new PhotoRequestError("invalid_photo", 400);
  }

  const parts: Uint8Array[] = [bytes.subarray(0, 2)];
  let offset = 2;
  while (offset < bytes.byteLength) {
    const markerStart = offset;
    if (bytes[offset] !== 0xff) {
      throw new PhotoRequestError("invalid_photo", 400);
    }
    let markerOffset = offset + 1;
    while (markerOffset < bytes.byteLength && bytes[markerOffset] === 0xff) {
      markerOffset += 1;
    }
    const marker = bytes[markerOffset];
    if (marker === undefined || marker === 0x00) {
      throw new PhotoRequestError("invalid_photo", 400);
    }

    if (marker === 0xd9) {
      parts.push(bytes.subarray(markerStart, markerOffset + 1));
      const outputLength = parts.reduce((length, part) => length + part.byteLength, 0);
      const output = new Uint8Array(outputLength);
      let outputOffset = 0;
      for (const part of parts) {
        output.set(part, outputOffset);
        outputOffset += part.byteLength;
      }
      return output;
    }

    const standalone = marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7);
    let segmentEnd = markerOffset + 1;
    if (!standalone) {
      if (segmentEnd + 2 > bytes.byteLength) {
        throw new PhotoRequestError("invalid_photo", 400);
      }
      const segmentLength = new DataView(bytes.buffer, bytes.byteOffset + segmentEnd, 2).getUint16(0);
      segmentEnd += segmentLength;
      if (segmentLength < 2 || segmentEnd > bytes.byteLength) {
        throw new PhotoRequestError("invalid_photo", 400);
      }
    }

    if (!((marker >= 0xe1 && marker <= 0xef) || marker === 0xfe)) {
      parts.push(bytes.subarray(markerStart, segmentEnd));
    }
    offset = segmentEnd;

    if (marker === 0xda) {
      let scanOffset = offset;
      while (scanOffset + 1 < bytes.byteLength) {
        if (bytes[scanOffset] !== 0xff) {
          scanOffset += 1;
          continue;
        }
        let codeOffset = scanOffset + 1;
        while (codeOffset < bytes.byteLength && bytes[codeOffset] === 0xff) {
          codeOffset += 1;
        }
        const code = bytes[codeOffset];
        if (code === undefined) {
          break;
        }
        if (code === 0x00 || (code >= 0xd0 && code <= 0xd7)) {
          scanOffset = codeOffset + 1;
          continue;
        }
        break;
      }
      parts.push(bytes.subarray(offset, scanOffset));
      offset = scanOffset;
    }
  }

  throw new PhotoRequestError("invalid_photo", 400);
}

export async function optimizeProfilePhoto(
  images: ImagesBinding,
  source: Uint8Array,
  contentType: string
): Promise<Uint8Array> {
  validatePhotoSignature(source, contentType);
  const info = await images.info(streamFrom(source));
  if (info.format !== contentType || !("width" in info) || info.width < 1 || info.height < 1) {
    throw new PhotoRequestError("invalid_photo", 400);
  }

  for (const dimension of outputDimensions) {
    for (const quality of outputQualities) {
      const transformation = await images
        .input(streamFrom(source))
        .transform({ width: dimension, height: dimension })
        .output({ format: "image/jpeg", quality });
      if (transformation.contentType() !== "image/jpeg") {
        throw new Error("Images binding returned an unexpected output format.");
      }
      const encoded = new Uint8Array(await new Response(transformation.image()).arrayBuffer());
      const optimized = stripJpegMetadata(encoded);
      if (optimized.byteLength <= maxOptimizedBytes) {
        return optimized;
      }
    }
  }

  throw new PhotoRequestError("photo_too_large", 422);
}

export const photoLimits = {
  maxSourceBytes,
  maxOptimizedBytes
};

export function encodePhotoBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}
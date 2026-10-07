import { encodePhotoBase64 } from "./photo";

const encoder = new TextEncoder();

type VCardProfile = {
  name: string;
  email: string;
  address: string;
  birthday: string;
  phone: string;
};

function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\r\n|\r|\n/g, "\\n")
    .replace(/([,;])/g, "\\$1");
}

function foldLine(line: string): string {
  let folded = "";
  let lineBytes = 0;

  for (const character of line) {
    const characterBytes = encoder.encode(character).length;
    if (lineBytes + characterBytes > 75) {
      folded += "\r\n ";
      lineBytes = 1;
    }
    folded += character;
    lineBytes += characterBytes;
  }

  return folded;
}

export function vCardDownloadFilename(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const selectedParts = parts.length > 1 ? [parts[0], parts[parts.length - 1]] : parts;
  const filenameParts = selectedParts
    .map((part) =>
      part
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
    )
    .filter(Boolean);

  return `${filenameParts.join("-") || "contact"}.vcf`;
}

export function renderVCard(profile: VCardProfile, photo?: Uint8Array): string {
  const name = escapeText(profile.name);
  const lines = [
    "BEGIN:VCARD",
    "VERSION:4.0",
    `FN:${name}`,
    `N:${name};;;;`,
    `EMAIL:${escapeText(profile.email)}`,
    `TEL;VALUE=uri;TYPE=cell,voice;PREF=1:tel:${profile.phone}`,
    `BDAY:${profile.birthday}`,
    `ADR;TYPE=home:;;${escapeText(profile.address)};;;;`
  ];

  if (photo) {
    lines.push(`PHOTO:data:image/jpeg;base64,${encodePhotoBase64(photo)}`);
  }
  lines.push("END:VCARD");

  return `${lines.map(foldLine).join("\r\n")}\r\n`;
}
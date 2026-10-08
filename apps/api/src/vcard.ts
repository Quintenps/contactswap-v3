import { encodePhotoBase64 } from "./photo";
import { formatDisplayName } from "./api-utils";

const encoder = new TextEncoder();

type VCardProfile = {
  firstName: string;
  lastName: string;
  email: string;
  street: string;
  city: string;
  postalCode: string;
  country: string;
  birthday: string;
  phone: string;
  org: string | null;
  title: string | null;
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

export function vCardDownloadFilename(firstName: string, lastName: string): string {
  const filenameParts = [firstName, lastName]
    .map((part) =>
      part
        .trim()
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
  const firstName = escapeText(profile.firstName);
  const lastName = escapeText(profile.lastName);
  const displayName = escapeText(formatDisplayName(profile.firstName, profile.lastName));
  const lines = [
    "BEGIN:VCARD",
    "VERSION:3.0",
    `FN:${displayName}`,
    `N:${lastName};${firstName};;;`,
    `EMAIL:${escapeText(profile.email)}`,
    `TEL;TYPE=CELL,VOICE,PREF:${profile.phone}`,
    `BDAY:${profile.birthday}`,
    `ADR;TYPE=home:;;${escapeText(profile.street)};${escapeText(profile.city)};;${escapeText(profile.postalCode)};${escapeText(profile.country)}`
  ];

  if (profile.org) {
    lines.push(`ORG:${escapeText(profile.org)}`);
  }
  if (profile.title) {
    lines.push(`TITLE:${escapeText(profile.title)}`);
  }
  if (photo) {
    lines.push(`PHOTO;ENCODING=b;TYPE=JPEG:${encodePhotoBase64(photo)}`);
  }
  lines.push("END:VCARD");

  return `${lines.map(foldLine).join("\r\n")}\r\n`;
}
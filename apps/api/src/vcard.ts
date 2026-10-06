import { encodePhotoBase64 } from "./photo";

const encoder = new TextEncoder();

type VCardProfile = {
  name: string;
  email: string;
  address: string;
  birthday: string;
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

export function renderVCard(profile: VCardProfile, photo?: Uint8Array): string {
  const name = escapeText(profile.name);
  const lines = [
    "BEGIN:VCARD",
    "VERSION:4.0",
    `FN:${name}`,
    `N:${name};;;;`,
    `EMAIL:${escapeText(profile.email)}`,
    `BDAY:${profile.birthday}`,
    `ADR;TYPE=home:;;${escapeText(profile.address)};;;;`
  ];

  if (photo) {
    lines.push(`PHOTO:data:image/jpeg;base64,${encodePhotoBase64(photo)}`);
  }
  lines.push("END:VCARD");

  return `${lines.map(foldLine).join("\r\n")}\r\n`;
}
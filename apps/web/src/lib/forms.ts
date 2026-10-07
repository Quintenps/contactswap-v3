import type { FieldName, ProfileFields } from "../types";

export const fields: {
  name: FieldName;
  label: string;
  type: string;
  autoComplete: string;
  hint?: string;
  placeholder?: string;
}[] = [
  { name: "name", label: "Full name", type: "text", autoComplete: "name" },
  { name: "email", label: "Email address", type: "email", autoComplete: "email" },
  { name: "address", label: "Address", type: "text", autoComplete: "street-address" },
  { name: "birthday", label: "Birthday", type: "date", autoComplete: "bday" },
  {
    name: "phone",
    label: "Phone number",
    type: "tel",
    autoComplete: "tel",
    hint: "Use international format with the +31 country code.",
    placeholder: "+31600000000"
  }
];

export const emptyFields: ProfileFields = { name: "", email: "", address: "", birthday: "", phone: "" };

export function validateProfile(values: ProfileFields): Partial<Record<FieldName, string>> {
  const errors: Partial<Record<FieldName, string>> = {};
  const trimmed = {
    name: values.name.trim(),
    email: values.email.trim(),
    address: values.address.trim(),
    birthday: values.birthday.trim(),
    phone: values.phone.trim()
  };

  if (!trimmed.name) errors.name = "Enter your name.";
  if (!trimmed.email) errors.email = "Enter your email address.";
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed.email)) {
    errors.email = "Enter a valid email address.";
  }
  if (!trimmed.address) errors.address = "Enter your address.";
  if (!trimmed.phone) {
    errors.phone = "Enter your phone number with the +31 country code, such as +31600000000.";
  } else if (!/^\+[1-9]\d{1,14}$/.test(trimmed.phone)) {
    errors.phone = "Use international E.164 format, such as +31600000000.";
  }
  if (!trimmed.birthday) {
    errors.birthday = "Enter your birthday.";
  } else {
    const date = new Date(`${trimmed.birthday}T00:00:00.000Z`);
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(trimmed.birthday) ||
      Number(trimmed.birthday.slice(0, 4)) < 1 ||
      !Number.isFinite(date.valueOf()) ||
      date.toISOString().slice(0, 10) !== trimmed.birthday
    ) {
      errors.birthday = "Enter a valid birthday.";
    }
  }
  return errors;
}

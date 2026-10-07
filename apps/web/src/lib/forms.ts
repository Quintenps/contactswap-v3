import type { FieldName, ProfileFields } from "../types";
import type { MessageKey } from "./i18n";

export const fields: {
  name: FieldName;
  labelKey: MessageKey;
  type: string;
  autoComplete: string;
  hintKey?: MessageKey;
  placeholder?: string;
  placeholderKey?: MessageKey;
  optional?: boolean;
}[] = [
  { name: "name", labelKey: "fieldName", type: "text", autoComplete: "name" },
  { name: "email", labelKey: "fieldEmail", type: "email", autoComplete: "email" },
  { name: "address", labelKey: "fieldAddress", type: "text", autoComplete: "street-address" },
  { name: "birthday", labelKey: "fieldBirthday", type: "date", autoComplete: "bday" },
  {
    name: "phone",
    labelKey: "fieldPhone",
    type: "tel",
    autoComplete: "tel",
    hintKey: "phoneHint",
    placeholder: "+31600000000"
  },
  {
    name: "org",
    labelKey: "fieldOrg",
    type: "text",
    autoComplete: "organization",
    placeholderKey: "guestExampleOrg",
    optional: true
  },
  {
    name: "title",
    labelKey: "fieldTitle",
    type: "text",
    autoComplete: "organization-title",
    placeholderKey: "guestExampleTitle",
    optional: true
  }
];

export const emptyFields: ProfileFields = {
  name: "",
  email: "",
  address: "",
  birthday: "",
  phone: "",
  org: "",
  title: ""
};

export function validateProfile(values: ProfileFields): Partial<Record<FieldName, MessageKey>> {
  const errors: Partial<Record<FieldName, MessageKey>> = {};
  const trimmed = {
    name: values.name.trim(),
    email: values.email.trim(),
    address: values.address.trim(),
    birthday: values.birthday.trim(),
    phone: values.phone.trim()
  };

  if (!trimmed.name) errors.name = "enterName";
  if (!trimmed.email) errors.email = "enterEmail";
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed.email)) {
    errors.email = "validEmail";
  }
  if (!trimmed.address) errors.address = "enterAddress";
  if (!trimmed.phone) {
    errors.phone = "enterPhone";
  } else if (!/^\+[1-9]\d{1,14}$/.test(trimmed.phone)) {
    errors.phone = "validPhone";
  }
  if (!trimmed.birthday) {
    errors.birthday = "enterBirthday";
  } else {
    const date = new Date(`${trimmed.birthday}T00:00:00.000Z`);
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(trimmed.birthday) ||
      Number(trimmed.birthday.slice(0, 4)) < 1 ||
      !Number.isFinite(date.valueOf()) ||
      date.toISOString().slice(0, 10) !== trimmed.birthday
    ) {
      errors.birthday = "validBirthday";
    }
  }
  return errors;
}

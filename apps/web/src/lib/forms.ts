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
  { name: "firstName", labelKey: "fieldFirstName", type: "text", autoComplete: "given-name" },
  { name: "lastName", labelKey: "fieldLastName", type: "text", autoComplete: "family-name" },
  { name: "email", labelKey: "fieldEmail", type: "email", autoComplete: "email" },
  { name: "street", labelKey: "fieldStreet", type: "text", autoComplete: "street-address", placeholderKey: "guestExampleStreet" },
  { name: "city", labelKey: "fieldCity", type: "text", autoComplete: "address-level2", placeholderKey: "guestExampleCity" },
  { name: "postalCode", labelKey: "fieldPostalCode", type: "text", autoComplete: "postal-code", placeholderKey: "guestExamplePostalCode" },
  { name: "country", labelKey: "fieldCountry", type: "text", autoComplete: "country-name" },
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

const addressFieldNames: ReadonlySet<FieldName> = new Set([
  "street",
  "city",
  "postalCode",
  "country"
]);

export const contactFields = fields.filter(
  ({ name, optional }) => !optional && !addressFieldNames.has(name)
);
export const addressFields = fields.filter(({ name }) => addressFieldNames.has(name));
export const workFields = fields.filter(({ optional }) => optional);

export function createEmptyFields(country = "The Netherlands"): ProfileFields {
  return {
    firstName: "",
    lastName: "",
    email: "",
    street: "",
    city: "",
    postalCode: "",
    country,
    birthday: "",
    phone: "",
    org: "",
    title: ""
  };
}

function titleCaseWords(value: string): string {
  return value
    .split(/(\s+)/u)
    .map((word) =>
      /^\s+$/u.test(word)
        ? word
        : word.toLowerCase().replace(/\p{L}/u, (letter) => letter.toUpperCase())
    )
    .join("");
}

export function normalizeSubmittedFields(values: ProfileFields): ProfileFields {
  return {
    ...values,
    firstName: titleCaseWords(values.firstName.trim()),
    lastName: titleCaseWords(values.lastName.trim()),
    street: titleCaseWords(values.street.trim()),
    city: titleCaseWords(values.city.trim()),
    postalCode: values.postalCode.trim().toUpperCase()
  };
}

export const fieldMaxLengths: Partial<Record<FieldName, number>> = {
  firstName: 255,
  lastName: 255,
  email: 254,
  street: 255,
  city: 255,
  postalCode: 255,
  country: 255,
  org: 255,
  title: 255
};

const controlCharacters = /[\u0000-\u001f\u007f-\u009f]/u;
const controlCharacterFields = new Set<FieldName>([
  "firstName",
  "lastName",
  "email",
  "street",
  "city",
  "postalCode",
  "country",
  "org",
  "title"
]);

export function codePointLength(value: string): number {
  return Array.from(value).length;
}

export function exceedsFieldLimit(name: FieldName, value: string): boolean {
  const maxLength = fieldMaxLengths[name];
  return maxLength !== undefined && codePointLength(value.trim()) > maxLength;
}

export function currentUtcDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export function validateTouchedProfile(
  values: ProfileFields,
  touched: Partial<Record<FieldName, boolean>>
): Partial<Record<FieldName, MessageKey>> {
  const allErrors = validateProfile(values);
  const errors: Partial<Record<FieldName, MessageKey>> = {};
  for (const { name } of fields) {
    if (touched[name] && allErrors[name]) {
      errors[name] = allErrors[name];
    }
  }
  return errors;
}

export function allProfileFieldsTouched(): Partial<Record<FieldName, boolean>> {
  const touched: Partial<Record<FieldName, boolean>> = {};
  for (const { name } of fields) {
    touched[name] = true;
  }
  return touched;
}

export function validateProfile(
  values: ProfileFields,
  today = currentUtcDate()
): Partial<Record<FieldName, MessageKey>> {
  const errors: Partial<Record<FieldName, MessageKey>> = {};
  const normalizedValues = normalizeSubmittedFields(values);

  const requiredMessages: Partial<Record<FieldName, MessageKey>> = {
    firstName: "enterFirstName",
    lastName: "enterLastName",
    email: "enterEmail",
    street: "enterStreet",
    city: "enterCity",
    postalCode: "enterPostalCode",
    country: "enterCountry",
    birthday: "enterBirthday",
    phone: "enterPhone"
  };

  for (const { name, optional } of fields) {
    const raw = values[name] ?? "";
    const trimmed = raw.trim();
    const normalized = normalizedValues[name];
    const maxLength = fieldMaxLengths[name];

    if (controlCharacterFields.has(name) && controlCharacters.test(raw)) {
      errors[name] = "controlCharactersNotAllowed";
    } else if (!optional && !trimmed) {
      errors[name] = requiredMessages[name];
    } else if (maxLength !== undefined && codePointLength(normalized) > maxLength) {
      errors[name] = "fieldTooLong";
    }
  }

  const email = values.email.trim();
  if (!errors.email && email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email)) {
    errors.email = "validEmail";
  }

  const phone = values.phone.trim();
  if (!errors.phone && phone && !/^\+[1-9]\d{1,14}$/.test(phone)) {
    errors.phone = "validPhone";
  }

  const birthday = values.birthday.trim();
  if (!errors.birthday && birthday) {
    const date = new Date(`${birthday}T00:00:00.000Z`);
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(birthday) ||
      Number(birthday.slice(0, 4)) < 1 ||
      !Number.isFinite(date.valueOf()) ||
      date.toISOString().slice(0, 10) !== birthday
    ) {
      errors.birthday = "validBirthday";
    } else if (birthday > today) {
      errors.birthday = "futureBirthday";
    }
  }

  return errors;
}

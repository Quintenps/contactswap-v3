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

export function validateProfile(values: ProfileFields): Partial<Record<FieldName, MessageKey>> {
  const errors: Partial<Record<FieldName, MessageKey>> = {};
  const trimmed = {
    firstName: values.firstName.trim(),
    lastName: values.lastName.trim(),
    email: values.email.trim(),
    street: values.street.trim(),
    city: values.city.trim(),
    postalCode: values.postalCode.trim(),
    country: values.country.trim(),
    birthday: values.birthday.trim(),
    phone: values.phone.trim()
  };

  if (!trimmed.firstName) errors.firstName = "enterFirstName";
  if (!trimmed.lastName) errors.lastName = "enterLastName";
  if (!trimmed.email) errors.email = "enterEmail";
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed.email)) {
    errors.email = "validEmail";
  }
  if (!trimmed.street) errors.street = "enterStreet";
  if (!trimmed.city) errors.city = "enterCity";
  if (!trimmed.postalCode) errors.postalCode = "enterPostalCode";
  if (!trimmed.country) errors.country = "enterCountry";
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

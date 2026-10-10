import { describe, expect, it } from "vitest";
import {
  codePointLength,
  createEmptyFields,
  normalizeSubmittedFields,
  validateProfile
} from "./forms";

function validProfile() {
  return {
    ...createEmptyFields(),
    firstName: "Alex",
    lastName: "Morgan",
    email: "alex@example.com",
    street: "42 Example Street",
    city: "London",
    postalCode: "SW1A 1AA",
    country: "United Kingdom",
    birthday: "1990-06-15",
    phone: "+447700900123"
  };
}

describe("profile form validation", () => {
  it("accepts valid values, including old birthdays and blank optional fields", () => {
    expect(validateProfile({ ...validProfile(), birthday: "0001-01-01" })).toEqual({});
    expect(validateProfile({ ...validProfile(), org: "  ", title: " " })).toEqual({});
    expect(validateProfile({
      ...validProfile(),
      birthday: " 1990-06-15 ",
      phone: "\t+447700900123 "
    })).toEqual({});
  });

  it("rejects malformed and future birthdays", () => {
    expect(validateProfile({ ...validProfile(), birthday: "2025-02-30" }).birthday)
      .toBe("validBirthday");
    expect(validateProfile({ ...validProfile(), birthday: "2026-03-02" }, "2026-03-01").birthday)
      .toBe("futureBirthday");
  });

  it("counts Unicode code points for text and email limits", () => {
    expect(codePointLength("😀".repeat(255))).toBe(255);
    expect(validateProfile({ ...validProfile(), firstName: "😀".repeat(255) }).firstName).toBeUndefined();
    expect(validateProfile({ ...validProfile(), firstName: "😀".repeat(256) }).firstName)
      .toBe("fieldTooLong");
    expect(validateProfile({ ...validProfile(), firstName: "ß".repeat(255) }).firstName)
      .toBe("fieldTooLong");
    expect(validateProfile({
      ...validProfile(),
      email: `${"a".repeat(242)}@example.com`
    }).email).toBeUndefined();
    expect(validateProfile({
      ...validProfile(),
      email: `${"a".repeat(243)}@example.com`
    }).email).toBe("fieldTooLong");
  });

  it("trims surrounding email whitespace but rejects embedded whitespace and controls", () => {
    expect(validateProfile({ ...validProfile(), email: " alex@example.com " }).email).toBeUndefined();
    expect(validateProfile({ ...validProfile(), email: "alex @example.com" }).email)
      .toBe("validEmail");
    expect(validateProfile({ ...validProfile(), street: "42 Example\tStreet" }).street)
      .toBe("controlCharactersNotAllowed");
    expect(validateProfile({ ...validProfile(), org: "Studio\nName" }).org)
      .toBe("controlCharactersNotAllowed");
  });
});

describe("form submission normalization", () => {
  it("title-cases names and address values and uppercases postal codes", () => {
    const normalized = normalizeSubmittedFields({
      ...validProfile(),
      firstName: "  jOhN DOE ",
      lastName: "ÉMILIE dUPONT",
      street: "  12 MAIN STREET, APT 3 ",
      city: " nEW   yORK ",
      postalCode: " sw1a 1aa "
    });

    expect(normalized).toMatchObject({
      firstName: "John Doe",
      lastName: "Émilie Dupont",
      street: "12 Main Street, Apt 3",
      city: "New   York",
      postalCode: "SW1A 1AA"
    });
  });

  it("does not normalize fields outside names and address casing", () => {
    const values = {
      ...validProfile(),
      email: "USER@EXAMPLE.COM",
      country: "the NETHERLANDS",
      org: "ACME INC",
      title: "VICE PRESIDENT"
    };

    expect(normalizeSubmittedFields(values)).toMatchObject({
      email: values.email,
      country: values.country,
      org: values.org,
      title: values.title
    });
  });
});

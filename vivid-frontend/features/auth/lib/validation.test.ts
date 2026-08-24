import { describe, expect, it } from "vitest";

import {
  CODE_LENGTH,
  normaliseCode,
  validateCode,
  validateEmail,
  validateName,
} from "@/features/auth/lib/validation";

describe("validateEmail", () => {
  it("accepts an ordinary address", () => {
    expect(validateEmail("mark@example.com")).toBeNull();
  });

  it("accepts a plus-addressed mailbox", () => {
    expect(validateEmail("mark+vivid@example.co.uk")).toBeNull();
  });

  it("rejects an empty value with a prompt rather than a complaint", () => {
    expect(validateEmail("   ")).toBe("Enter your email address.");
  });

  it("rejects a value with no domain", () => {
    expect(validateEmail("mark@")).not.toBeNull();
  });

  it("rejects a value with no at sign", () => {
    expect(validateEmail("mark.example.com")).not.toBeNull();
  });
});

describe("normaliseCode", () => {
  it("strips the spaces out of a pasted code", () => {
    expect(normaliseCode("123 456")).toBe("123456");
  });

  it("drops anything that is not a digit", () => {
    expect(normaliseCode("a1b2c3d4e5f6")).toBe("123456");
  });

  it("caps at the code length", () => {
    expect(normaliseCode("1234567890")).toBe("123456");
  });
});

describe("validateCode", () => {
  it("accepts six digits", () => {
    expect(validateCode("123456")).toBeNull();
  });

  it("rejects a short code", () => {
    expect(validateCode("1234")).toBe(`The code is ${CODE_LENGTH} digits.`);
  });

  it("rejects letters", () => {
    expect(validateCode("12a456")).toBe("The code is six digits.");
  });
});

describe("validateName", () => {
  it("accepts a real name", () => {
    expect(validateName("Mark")).toBeNull();
  });

  it("rejects a single character", () => {
    expect(validateName("M")).toBe("That name is too short.");
  });

  it("ignores surrounding whitespace when measuring", () => {
    expect(validateName("  M  ")).toBe("That name is too short.");
  });
});

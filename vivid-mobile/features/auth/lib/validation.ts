// Sign-in form rules. Pure, so they are unit tested and the component only
// renders what these return. Identical to the web app.

// Deliberately permissive. The authoritative check is the backend; a clever
// regex here only rejects addresses that are actually valid.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function validateEmail(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return "Enter your email address.";
  if (!EMAIL.test(trimmed)) return "That doesn't look like an email address.";
  return null;
}

export const MIN_PASSWORD_LENGTH = 8;

export function validatePassword(value: string): string | null {
  if (value.length < MIN_PASSWORD_LENGTH)
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  return null;
}

export const CODE_LENGTH = 6;

export function validateCode(value: string): string | null {
  const digits = value.trim();
  if (!digits) return "Enter the code we sent you.";
  if (!/^\d+$/.test(digits)) return "The code is six digits.";
  if (digits.length !== CODE_LENGTH) return `The code is ${CODE_LENGTH} digits.`;
  return null;
}

// Keeps only digits and caps the length, so a paste of "123 456" or a longer
// string still lands correctly in the code field.
export function normaliseCode(value: string): string {
  return value.replace(/\D/g, "").slice(0, CODE_LENGTH);
}

export function validateName(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return "Enter your name.";
  if (trimmed.length < 2) return "That name is too short.";
  return null;
}

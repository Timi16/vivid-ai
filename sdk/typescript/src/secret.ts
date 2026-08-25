/**
 * A string that resists being looked at.
 *
 * Authenticated browsing means credentials pass through this SDK. The rule is
 * that they reach the browser and nothing else: never a snapshot, never an LLM
 * controller prompt, never a log line. A plain string cannot enforce that —
 * one template literal in a caller's debug logging and the password is on disk.
 *
 * `Secret` makes leaking deliberate. `toString`, `JSON.stringify` and Node's
 * `console.log` inspection all render `***`, so it survives logging and error
 * formatting intact. Reading the real value takes an explicit `.reveal()`,
 * which is easy to grep for in review.
 */

export const REDACTED = "***";

const NODE_INSPECT = Symbol.for("nodejs.util.inspect.custom");

export class Secret {
  readonly #value: string;

  constructor(value: string | Secret) {
    // secret(secret(x)) shouldn't nest.
    this.#value = value instanceof Secret ? value.reveal() : value;
    if (typeof this.#value !== "string") {
      throw new TypeError("secret() takes a string");
    }
  }

  /** The real value. The only way to get it, and named to be greppable. */
  reveal(): string {
    return this.#value;
  }

  get length(): number {
    return this.#value.length;
  }

  toString(): string {
    return REDACTED;
  }

  /**
   * Critically, this makes `JSON.stringify({password: secret})` safe. The
   * transport reveals values explicitly, so redacting the generic path costs
   * nothing and closes the most likely accidental leak.
   */
  toJSON(): string {
    return REDACTED;
  }

  [Symbol.toPrimitive](): string {
    return REDACTED;
  }

  [NODE_INSPECT](): string {
    return `Secret(${REDACTED})`;
  }
}

/** Wrap a credential so it cannot be printed or logged by accident. */
export function secret(value: string | Secret): Secret {
  return new Secret(value);
}

/** Unwrap either a Secret or a plain string, for transport code. */
export function reveal(value: string | Secret): string {
  return value instanceof Secret ? value.reveal() : value;
}

export function isSecret(value: unknown): value is Secret {
  return value instanceof Secret;
}

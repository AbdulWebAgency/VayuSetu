/** Typed error carrying a safe, user-presentable message and HTTP status. */
export class DomainError extends Error {
  constructor(
    public readonly code:
      "BAD_INPUT" | "NOT_IN_INDIA" | "UPSTREAM" | "RATE_LIMITED" | "TOO_LARGE" | "FORBIDDEN",
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "DomainError";
  }
}

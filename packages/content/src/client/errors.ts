// Error messages are fixed strings or built from status codes only; the API key is never interpolated.
export class ForeverDbAuthError extends Error {
  readonly status: number;
  constructor(status: number) {
    super(`ForeverDB rejected the API key (HTTP ${status})`);
    this.name = "ForeverDbAuthError";
    this.status = status;
  }
}

export class ForeverDbBudgetError extends Error {
  readonly remaining: number;
  constructor(remaining: number, reserve: number) {
    super(`ForeverDB daily budget nearly exhausted (${remaining} remaining, reserve ${reserve})`);
    this.name = "ForeverDbBudgetError";
    this.remaining = remaining;
  }
}

export class ForeverDbHttpError extends Error {
  readonly status: number;
  constructor(status: number) {
    super(`ForeverDB request failed (HTTP ${status})`);
    this.name = "ForeverDbHttpError";
    this.status = status;
  }
}

/** A 2xx response that was not the expected ForeverDB JSON envelope. Carries only the status. */
export class ForeverDbResponseError extends Error {
  readonly status: number;
  constructor(status: number) {
    super(`ForeverDB returned an unexpected response (HTTP ${status})`);
    this.name = "ForeverDbResponseError";
    this.status = status;
  }
}

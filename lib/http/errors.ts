import type { GenerateErrorCode } from "@/lib/generators/types";

export class GenerateError extends Error {
  readonly code: GenerateErrorCode;
  readonly retryAfterSec?: number;

  constructor(code: GenerateErrorCode, message: string, retryAfterSec?: number) {
    super(message);
    this.name = "GenerateError";
    this.code = code;
    this.retryAfterSec = retryAfterSec;
  }
}

export function httpStatus(code: GenerateErrorCode): number {
  switch (code) {
    case "VALIDATION":
      return 400;
    case "START_NOT_SNAPPED":
    case "ROUTE_NOT_FOUND":
    case "UNSUPPORTED_SHAPE":
      return 422;
    case "PROVIDER_BUSY":
      return 429;
    case "PROVIDER_QUOTA":
      return 503;
    case "PROVIDER_TIMEOUT":
      return 504;
    default:
      return 500;
  }
}

export function publicMessage(code: GenerateErrorCode, fallback: string): string {
  switch (code) {
    case "START_NOT_SNAPPED":
      return "Nothing routable here (water or no paths). Move the pin.";
    case "ROUTE_NOT_FOUND":
      return "Couldn't find a route from here. Move the pin or try out-and-back.";
    case "PROVIDER_BUSY":
      return "Slow down — try again in a few seconds.";
    case "PROVIDER_QUOTA":
      return "The routing service is out of daily quota. Try again tomorrow.";
    case "PROVIDER_TIMEOUT":
      return "The routing service timed out. Retry.";
    case "VALIDATION":
      return fallback;
    default:
      return "Couldn't reach the routing service. Retry.";
  }
}

import { ACTIVITY_DEFAULTS } from "@/lib/activity";
import { resolveGenerator } from "@/lib/generators/registry";
import type {
  Activity,
  GenerateInput,
  LonLat,
  RouteShape,
} from "@/lib/generators/types";
import { GenerateError, httpStatus, publicMessage } from "@/lib/http/errors";

export const maxDuration = 30;

function randomSeed(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000_000;
}

function isActivity(v: unknown): v is Activity {
  return v === "run" || v === "bike";
}

function isShape(v: unknown): v is RouteShape {
  return v === "loop" || v === "out_and_back";
}

function parseStart(raw: unknown): LonLat {
  if (!raw || typeof raw !== "object") {
    throw new GenerateError("VALIDATION", "Start location is required.");
  }
  const { lat, lng } = raw as { lat?: unknown; lng?: unknown };
  if (
    typeof lat !== "number" ||
    typeof lng !== "number" ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lng)
  ) {
    throw new GenerateError("VALIDATION", "Start location is invalid.");
  }
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    throw new GenerateError("VALIDATION", "Start location is out of range.");
  }
  return [lng, lat];
}

function parseBody(body: unknown): GenerateInput {
  if (!body || typeof body !== "object") {
    throw new GenerateError("VALIDATION", "Request body is required.");
  }
  const b = body as Record<string, unknown>;
  if (!isActivity(b.activity)) {
    throw new GenerateError("VALIDATION", "Pick run or bike.");
  }
  if (!isShape(b.shape)) {
    throw new GenerateError("VALIDATION", "Pick a loop or out-and-back.");
  }
  if (typeof b.targetMeters !== "number" || !Number.isFinite(b.targetMeters)) {
    throw new GenerateError("VALIDATION", "Enter a distance.");
  }
  const limits = ACTIVITY_DEFAULTS[b.activity];
  if (b.targetMeters < limits.minMeters || b.targetMeters > limits.maxMeters) {
    throw new GenerateError(
      "VALIDATION",
      `Distance must be between ${limits.minMeters / 1000} and ${limits.maxMeters / 1000} km for ${b.activity}.`,
    );
  }
  const seed =
    typeof b.seed === "number" && Number.isFinite(b.seed)
      ? Math.floor(Math.abs(b.seed))
      : randomSeed();

  return {
    start: parseStart(b.start),
    activity: b.activity,
    shape: b.shape,
    targetMeters: b.targetMeters,
    seed,
  };
}

export async function POST(request: Request) {
  try {
    let json: unknown;
    try {
      json = await request.json();
    } catch {
      throw new GenerateError("VALIDATION", "Request body must be JSON.");
    }

    const input = parseBody(json);
    const route = await resolveGenerator(input).generate(input);

    console.info("generate", {
      activity: input.activity,
      shape: input.shape,
      targetMeters: input.targetMeters,
      provider: route.provider,
      attempts: route.attempts,
    });

    return Response.json({ route });
  } catch (err) {
    if (err instanceof GenerateError) {
      return Response.json(
        {
          error: {
            code: err.code,
            message: publicMessage(err.code, err.message),
            retryAfterSec: err.retryAfterSec,
          },
        },
        { status: httpStatus(err.code) },
      );
    }
    console.error("generate failed", (err as Error).name);
    return Response.json(
      {
        error: {
          code: "INTERNAL",
          message: "Couldn't reach the routing service. Retry.",
        },
      },
      { status: 500 },
    );
  }
}

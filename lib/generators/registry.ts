import { distanceLoopGenerator } from "@/lib/generators/distance-loop";
import { distanceOutAndBackGenerator } from "@/lib/generators/distance-out-and-back";
import type { GenerateInput, RouteGenerator } from "@/lib/generators/types";
import { GenerateError } from "@/lib/http/errors";

const generators: RouteGenerator[] = [
  distanceLoopGenerator,
  distanceOutAndBackGenerator,
];

export function resolveGenerator(input: GenerateInput): RouteGenerator {
  const found = generators.find(
    (g) =>
      g.criterion === "distance" &&
      g.shapes.includes(input.shape) &&
      g.activities.includes(input.activity),
  );
  if (!found) {
    throw new GenerateError(
      "UNSUPPORTED_SHAPE",
      "That route shape isn't available yet.",
    );
  }
  return found;
}

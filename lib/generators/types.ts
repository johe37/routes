export type Activity = "run" | "bike";
export type RouteShape = "loop" | "out_and_back";
export type LonLat = readonly [lon: number, lat: number];

export interface GenerateInput {
  start: LonLat;
  activity: Activity;
  shape: RouteShape;
  targetMeters: number;
  seed: number;
}

export interface GeneratedRoute {
  id: string;
  geometry: {
    type: "LineString";
    coordinates: LonLat[];
  };
  bbox: [minLon: number, minLat: number, maxLon: number, maxLat: number];
  distanceMeters: number;
  activity: Activity;
  shape: RouteShape;
  seed: number;
  provider: "ors" | "osrm";
  attempts: number;
  distanceSoftMiss: boolean;
  warnings: string[];
}

export type GenerateErrorCode =
  | "VALIDATION"
  | "START_NOT_SNAPPED"
  | "ROUTE_NOT_FOUND"
  | "UNSUPPORTED_SHAPE"
  | "PROVIDER_BUSY"
  | "PROVIDER_QUOTA"
  | "PROVIDER_TIMEOUT"
  | "INTERNAL";

export interface RouteGenerator {
  id: string;
  criterion: "distance";
  shapes: RouteShape[];
  activities: Activity[];
  generate(input: GenerateInput): Promise<GeneratedRoute>;
}

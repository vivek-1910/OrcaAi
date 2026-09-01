export type WaterMode = "marine" | "inland";
export type LocationSource = "permission" | "manual" | "unset";
export type TripTiming = "early-morning" | "day" | "evening" | "overnight";
export type Experience = "new" | "learning" | "regular" | "expert";

export type FisherLocation = { source: LocationSource; label: string; latitude?: number; longitude?: number };
export type FisherContext = {
  waterMode: WaterMode;
  location: FisherLocation;
  language: string;
  vessel: { type: string; name: string; lengthFeet: string };
  experience: Experience;
  tripTiming: TripTiming;
  departureAt?: string;
  returnAt?: string;
  distanceKm?: number;
};

export const DEFAULT_FISHER_CONTEXT: FisherContext = { waterMode: "marine", location: { source: "unset", label: "Add a harbour or waterbody" }, language: "English", vessel: { type: "Small boat", name: "", lengthFeet: "" }, experience: "regular", tripTiming: "early-morning" };
export const FISHER_PROFILE_STORAGE_KEY = "orca:fisher-context:v1";

export function mergeFisherContext(value: unknown): FisherContext {
  if (!value || typeof value !== "object") return DEFAULT_FISHER_CONTEXT;
  const saved = value as Partial<FisherContext>;
  const savedLocation = saved.location && typeof saved.location === "object" ? saved.location : {};
  const savedVessel = saved.vessel && typeof saved.vessel === "object" ? saved.vessel : {};
  return { ...DEFAULT_FISHER_CONTEXT, ...saved, location: { ...DEFAULT_FISHER_CONTEXT.location, ...savedLocation }, vessel: { ...DEFAULT_FISHER_CONTEXT.vessel, ...savedVessel } } as FisherContext;
}

export function getFisherContextSummary(context: FisherContext) {
  const location = context.location.label || "your water";
  const vessel = context.vessel.name || context.vessel.type || "your vessel";
  return `${context.waterMode === "marine" ? "Marine" : "Inland"} · ${location} · ${vessel}`;
}

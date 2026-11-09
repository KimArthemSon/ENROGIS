import * as Location from "expo-location";

export const GPS_LIVE_TIMEOUT_MS = 30000;
export const GPS_READY_HOURS = 2;
export const GPS_AGING_HOURS = 6;

export type GpsFix = {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  altitude: number | null;
  /** True when live GPS failed and the last known position was used instead. */
  isFallback: boolean;
  timestamp: number;
};

export type GpsResult =
  | { ok: true; fix: GpsFix }
  | { ok: false; reason: "permission" | "services" | "no-signal" | "error" };

/**
 * Gets a GPS fix without internet. Tries a live high-accuracy fix first, and
 * falls back to the last known position if no fix comes within the timeout.
 */
export async function getGpsFix(timeoutMs = GPS_LIVE_TIMEOUT_MS): Promise<GpsResult> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") return { ok: false, reason: "permission" };
    if (!(await Location.hasServicesEnabledAsync())) return { ok: false, reason: "services" };

    let loc: Location.LocationObject | null = null;
    let isFallback = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      loc = await Promise.race([
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Highest }),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error("GPS_TIMEOUT")), timeoutMs);
        }),
      ]);
    } catch {
      loc = await Location.getLastKnownPositionAsync();
      isFallback = !!loc;
    } finally {
      if (timer) clearTimeout(timer);
    }

    if (!loc?.coords) return { ok: false, reason: "no-signal" };
    return {
      ok: true,
      fix: {
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
        accuracy: loc.coords.accuracy ?? null,
        altitude: loc.coords.altitude ?? null,
        isFallback,
        timestamp: loc.timestamp,
      },
    };
  } catch (e) {
    console.error("GPS error:", e);
    return { ok: false, reason: "error" };
  }
}

export const gpsErrorMessage: Record<Exclude<GpsResult, { ok: true }>["reason"], string> = {
  permission: "Location permission is turned off for ENROGIS.",
  services: "Please turn on Location/GPS in your phone settings.",
  "no-signal": "Could not lock onto GPS. Step into the open or enter coordinates manually.",
  error: "Unexpected error while getting location.",
};

export type GpsReadiness = "ready" | "aging" | "cold" | "checking";

/** How fresh the phone's cached GPS fix is. A fresh fix means faster locks offline. */
export async function checkGpsReadiness(): Promise<{ readiness: GpsReadiness; ageHours: number | null }> {
  try {
    const { status } = await Location.getForegroundPermissionsAsync();
    if (status !== "granted") return { readiness: "cold", ageHours: null };
    const last = await Location.getLastKnownPositionAsync();
    if (!last) return { readiness: "cold", ageHours: null };
    const ageHours = (Date.now() - last.timestamp) / 3_600_000;
    const readiness =
      ageHours < GPS_READY_HOURS ? "ready" : ageHours < GPS_AGING_HOURS ? "aging" : "cold";
    return { readiness, ageHours };
  } catch {
    return { readiness: "cold", ageHours: null };
  }
}

export function formatAge(ageHours: number | null) {
  if (ageHours === null) return "never";
  if (ageHours < 1 / 60) return "just now";
  if (ageHours < 1) return `${Math.round(ageHours * 60)} min ago`;
  if (ageHours < 24) return `${ageHours.toFixed(1)}h ago`;
  return `${Math.round(ageHours / 24)}d ago`;
}

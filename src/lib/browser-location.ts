export type BrowserLocation = {
  latitude: number;
  longitude: number;
  accuracy: number;
};

export function requestBrowserLocation(): Promise<BrowserLocation> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Location is not supported by this browser."));
      return;
    }

    const locate = (highAccuracy: boolean) => {
      navigator.geolocation.getCurrentPosition(
        ({ coords }) => resolve({ latitude: coords.latitude, longitude: coords.longitude, accuracy: coords.accuracy }),
        (error) => {
          if (highAccuracy && (error.code === error.TIMEOUT || error.code === error.POSITION_UNAVAILABLE)) {
            locate(false);
            return;
          }
          reject(error);
        },
        highAccuracy
          ? { enableHighAccuracy: true, timeout: 12_000, maximumAge: 60_000 }
          : { enableHighAccuracy: false, timeout: 15_000, maximumAge: 300_000 },
      );
    };

    locate(true);
  });
}

export function locationErrorMessage(error: unknown): string {
  const code = error && typeof error === "object" && "code" in error
    ? Number((error as { code?: unknown }).code)
    : undefined;

  if (code === 1) return "Location permission is blocked. Allow location for Orca in your browser settings, then try again.";
  if (code === 2) return "Your browser could not get a location fix. Try again outdoors or enter your harbour manually.";
  if (code === 3) return "Location took too long. Try again or enter your harbour manually.";
  return error instanceof Error ? error.message : "Location was not available. Enter your harbour or waterbody manually.";
}

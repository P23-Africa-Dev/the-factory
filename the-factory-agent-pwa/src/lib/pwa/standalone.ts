export function isStandaloneMode(): boolean {
  if (typeof window === "undefined") return false;

  const displayModes = ["standalone", "fullscreen", "minimal-ui"] as const;
  const inDisplayMode = displayModes.some((mode) =>
    window.matchMedia(`(display-mode: ${mode})`).matches,
  );

  const iosStandalone =
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true;

  const androidAppReferrer = document.referrer.includes("android-app://");

  return inDisplayMode || iosStandalone || androidAppReferrer;
}

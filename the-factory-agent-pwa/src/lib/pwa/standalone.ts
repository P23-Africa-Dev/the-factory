import { isMobileDevice } from "./device";

export function getStandaloneSignals() {
  if (typeof window === "undefined") {
    return {
      standalone: false,
      displayStandalone: false,
      displayFullscreen: false,
      displayMinimalUi: false,
      displayBrowser: false,
      displayModeKnown: false,
      mobileInstalledShell: false,
      iosStandalone: false,
      androidAppReferrer: false,
      referrer: "",
      href: "",
    };
  }

  const displayStandalone = window.matchMedia("(display-mode: standalone)").matches;
  const displayFullscreen = window.matchMedia("(display-mode: fullscreen)").matches;
  const displayMinimalUi = window.matchMedia("(display-mode: minimal-ui)").matches;
  const displayBrowser = window.matchMedia("(display-mode: browser)").matches;
  const iosStandalone =
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
  const androidAppReferrer = document.referrer.includes("android-app://");

  const displayModeKnown =
    displayStandalone || displayFullscreen || displayMinimalUi || displayBrowser;

  // When display-mode API works: mobile + not browser tab = installed PWA shell
  const mobileInstalledShell =
    isMobileDevice() && displayModeKnown && !displayBrowser;

  const standalone =
    displayStandalone ||
    displayFullscreen ||
    displayMinimalUi ||
    iosStandalone ||
    androidAppReferrer ||
    mobileInstalledShell;

  return {
    standalone,
    displayStandalone,
    displayFullscreen,
    displayMinimalUi,
    displayBrowser,
    displayModeKnown,
    mobileInstalledShell,
    iosStandalone,
    androidAppReferrer,
    referrer: document.referrer,
    href: window.location.href,
  };
}

export function isStandaloneMode(): boolean {
  return getStandaloneSignals().standalone;
}

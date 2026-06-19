import { isDesktopDevice } from "./device";
import { isStandaloneMode } from "./standalone";
import { getAppLaunchPath } from "./launch";

export function isPwaOnlyModeEnabled(): boolean {
  return process.env.NEXT_PUBLIC_PWA_ONLY_MODE === "true";
}

export function isLocalDevHost(): boolean {
  if (typeof window === "undefined") return false;
  const host = window.location.hostname;
  return host === "localhost" || host === "127.0.0.1";
}

/** PWA-only gate applies in production; localhost dev allows browser access for testing. */
export function shouldEnforcePwaOnlyMode(): boolean {
  if (!isPwaOnlyModeEnabled()) return false;
  if (process.env.NODE_ENV === "development" && isLocalDevHost()) return false;
  return true;
}

export function shouldAllowAppAccess(): boolean {
  if (!shouldEnforcePwaOnlyMode()) return true;
  return isStandaloneMode();
}

export function getInstallRedirectPath(isDesktop: boolean): string {
  return isDesktop ? "/install" : "/install/mobile";
}

export function getInstallRedirectPathForClient(): string {
  return getInstallRedirectPath(isDesktopDevice());
}

export function isInstallPath(pathname: string): boolean {
  return pathname === "/install" || pathname.startsWith("/install/");
}

export type PwaAccessResult = {
  allowed: boolean;
  redirect?: string;
  bypassReason?: string;
};

export function resolvePwaAccess(pathname: string): PwaAccessResult {
  if (!shouldEnforcePwaOnlyMode()) {
    const reason = !isPwaOnlyModeEnabled()
      ? "pwa_only_mode_off"
      : "localhost_dev_bypass";
    return { allowed: true, bypassReason: reason };
  }

  const standalone = isStandaloneMode();
  const desktop = isDesktopDevice();
  const launchPath = getAppLaunchPath();

  if (standalone) {
    if (isInstallPath(pathname)) {
      return { allowed: false, redirect: launchPath };
    }
    return { allowed: true };
  }

  if (desktop) {
    if (pathname === "/install") {
      return { allowed: true };
    }
    return { allowed: false, redirect: "/install" };
  }

  if (pathname.startsWith("/install/mobile")) {
    return { allowed: true };
  }

  return { allowed: false, redirect: "/install/mobile" };
}

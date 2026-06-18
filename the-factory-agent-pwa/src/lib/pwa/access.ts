import { isDesktopDevice } from "./device";
import { isStandaloneMode } from "./standalone";
import { getAppLaunchPath } from "./launch";

export function isPwaOnlyModeEnabled(): boolean {
  return process.env.NEXT_PUBLIC_PWA_ONLY_MODE === "true";
}

export function shouldAllowAppAccess(): boolean {
  if (!isPwaOnlyModeEnabled()) return true;
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
};

export function resolvePwaAccess(pathname: string): PwaAccessResult {
  if (!isPwaOnlyModeEnabled()) {
    return { allowed: true };
  }

  if (isStandaloneMode()) {
    if (isInstallPath(pathname)) {
      return { allowed: false, redirect: getAppLaunchPath() };
    }
    return { allowed: true };
  }

  if (isDesktopDevice()) {
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

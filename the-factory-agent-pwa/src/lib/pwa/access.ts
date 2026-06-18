import { isDesktopDevice } from "./device";
import { isStandaloneMode } from "./standalone";

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

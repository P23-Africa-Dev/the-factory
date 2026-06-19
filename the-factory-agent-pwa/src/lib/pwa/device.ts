const MOBILE_UA_PATTERN =
  /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i;

export function isMobileUserAgent(
  userAgent: string,
  secChUaMobile?: string | null,
): boolean {
  if (secChUaMobile === "?1") return true;
  if (secChUaMobile === "?0") return false;
  return MOBILE_UA_PATTERN.test(userAgent);
}

export function isDesktopUserAgent(
  userAgent: string,
  secChUaMobile?: string | null,
): boolean {
  return !isMobileUserAgent(userAgent, secChUaMobile);
}

export function isMobileDevice(): boolean {
  if (typeof window === "undefined") return false;
  return isMobileUserAgent(window.navigator.userAgent);
}

export function isDesktopDevice(): boolean {
  if (typeof window === "undefined") return true;
  return !isMobileDevice();
}

export function isIosDevice(): boolean {
  if (typeof window === "undefined") return false;
  const ua = window.navigator.userAgent.toLowerCase();
  return ua.includes("iphone") || ua.includes("ipad") || ua.includes("ipod");
}

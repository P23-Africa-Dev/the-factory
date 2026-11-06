/**
 * HMAC-SHA256 signer/verifier for edge & server mode cookies
 */
import crypto from 'crypto';
import type { AppMode } from './appMode';

export const MODE_COOKIE_NAME = 'f23_mode';

const DEFAULT_SECRET = 'factory23_default_secure_session_signing_key_2026';

function getSecret(): string {
  return process.env.SESSION_SIGNING_SECRET || DEFAULT_SECRET;
}

export type ModeCookiePayload = {
  mode: AppMode;
  uid?: number | string;
  iat: number;
  exp: number;
};

export function signModeCookie(payload: ModeCookiePayload): string {
  const json = JSON.stringify(payload);
  const dataB64 = Buffer.from(json, 'utf8').toString('base64url');
  const hmac = crypto.createHmac('sha256', getSecret());
  hmac.update(dataB64);
  const sig = hmac.digest('base64url');
  return `${dataB64}.${sig}`;
}

export function verifyModeCookie(cookieValue: string | undefined | null): ModeCookiePayload | null {
  if (!cookieValue) return null;
  const parts = cookieValue.split('.');
  if (parts.length !== 2) return null;

  const [dataB64, sig] = parts;
  try {
    const hmac = crypto.createHmac('sha256', getSecret());
    hmac.update(dataB64);
    const expectedSig = hmac.digest('base64url');

    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig))) {
      return null;
    }

    const json = Buffer.from(dataB64, 'base64url').toString('utf8');
    const parsed = JSON.parse(json) as ModeCookiePayload;

    if (parsed.exp && parsed.exp < Date.now()) {
      return null; // Expired
    }

    if (parsed.mode !== 'agent' && parsed.mode !== 'manager') {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}


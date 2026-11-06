/**
 * Client helper to mint and clear the signed HttpOnly f23_mode cookie via /api/session
 */

export async function syncSessionCookie(token: string): Promise<boolean> {
  try {
    const res = await fetch('/api/session', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      cache: 'no-store',
    });
    return res.ok;
  } catch (error) {
    console.warn('[sessionCookie] Failed to sync session cookie:', error);
    return false;
  }
}

export async function clearSessionCookie(): Promise<boolean> {
  try {
    const res = await fetch('/api/session', {
      method: 'DELETE',
      cache: 'no-store',
    });
    return res.ok;
  } catch (error) {
    console.warn('[sessionCookie] Failed to clear session cookie:', error);
    return false;
  }
}


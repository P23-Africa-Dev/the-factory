import { NextRequest, NextResponse } from 'next/server';
import { signModeCookie, MODE_COOKIE_NAME } from '@/session/cookieSigner';
import type { AppMode } from '@/session/appMode';

const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_BASE_URL?.trim() ||
  'https://api.thefactory23.com/api/v1'
).replace(/\/+$/, '');

export async function POST(request: NextRequest): Promise<NextResponse> {
  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Missing bearer token' }, { status: 401 });
  }

  const token = authHeader.replace('Bearer ', '').trim();

  try {
    const upstream = await fetch(`${API_BASE_URL}/mobile/session`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
      cache: 'no-store',
    });

    if (!upstream.ok) {
      return NextResponse.json({ error: 'Invalid session' }, { status: upstream.status });
    }

    const json = (await upstream.json()) as {
      data?: {
        app_mode?: string;
        user?: { id?: number | string };
      };
    };

    const mode = json.data?.app_mode as AppMode | undefined;
    if (mode !== 'agent' && mode !== 'manager') {
      return NextResponse.json({ error: 'Ineligible mode', app_mode: mode }, { status: 403 });
    }

    const payload = {
      mode,
      uid: json.data?.user?.id,
      iat: Date.now(),
      exp: Date.now() + 30 * 24 * 60 * 60 * 1000,
    };

    const signedCookie = signModeCookie(payload);
    const response = NextResponse.json({ success: true, app_mode: mode });

    const isSecure = process.env.NODE_ENV === 'production';
    response.cookies.set({
      name: MODE_COOKIE_NAME,
      value: signedCookie,
      httpOnly: true,
      secure: isSecure,
      sameSite: 'lax',
      path: '/',
      maxAge: 30 * 24 * 60 * 60,
    });

    return response;
  } catch (error) {
    console.error('[Session Route] Error verifying session:', error);
    return NextResponse.json({ error: 'Internal verification error' }, { status: 500 });
  }
}

export async function DELETE(): Promise<NextResponse> {
  const response = NextResponse.json({ success: true });
  response.cookies.set({
    name: MODE_COOKIE_NAME,
    value: '',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
    expires: new Date(0),
  });
  return response;
}


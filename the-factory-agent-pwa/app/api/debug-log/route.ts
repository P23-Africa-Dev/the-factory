import { appendFileSync, existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { NextResponse } from 'next/server';

function resolveLogPath(): string {
  const candidates = [
    join(process.cwd(), 'debug-6d289e.log'),
    join(process.cwd(), '..', 'debug-6d289e.log'),
  ];
  return candidates.find((p) => existsSync(dirname(p))) ?? candidates[1];
}

const LOG_PATH = resolveLogPath();

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body = await request.json();
    const dir = dirname(LOG_PATH);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    appendFileSync(LOG_PATH, `${JSON.stringify(body)}\n`, { encoding: 'utf8' });
    console.warn('[MapDebug:server]', body.message ?? body.location, body.data ?? '');
  } catch (err) {
    console.warn('[MapDebug:server] write failed', err);
  }
  return NextResponse.json({ ok: true });
}

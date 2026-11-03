import { appStore } from '@/lib/storage/stores';
import { readSession } from '@/session/sessionStore';
import { homeFor } from '@/session/appMode';

export type AppLaunchPath = '/login' | '/' | '/manager';

export function getAppLaunchPath(): AppLaunchPath {
  const token = appStore.getString('auth_token');
  if (!token) return '/login';
  const session = readSession();
  if (session?.app_mode) {
    return homeFor(session.app_mode);
  }
  return '/';
}

import { appStore } from '@/lib/storage/stores';

export type AppLaunchPath = '/login' | '/';

export function getAppLaunchPath(): AppLaunchPath {
  const token = appStore.getString('auth_token');
  return token ? '/' : '/login';
}

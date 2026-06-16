/**
 * localStorage-based key-value stores — replaces React Native MMKV.
 *
 * Each store uses a namespace prefix to avoid key collisions.
 * API surface mirrors MMKV's synchronous get/set/delete interface so
 * feature code can be ported with minimal changes.
 */

class WebStore {
  private readonly prefix: string;

  constructor(config: { id: string }) {
    this.prefix = config.id;
  }

  private k(key: string): string {
    return `${this.prefix}:${key}`;
  }

  set(key: string, value: boolean | string | number): void {
    try {
      localStorage.setItem(this.k(key), String(value));
    } catch {
      // Storage quota exceeded or unavailable — non-fatal
    }
  }

  getString(key: string): string | undefined {
    try {
      return localStorage.getItem(this.k(key)) ?? undefined;
    } catch {
      return undefined;
    }
  }

  getNumber(key: string): number | undefined {
    const val = this.getString(key);
    if (val == null) return undefined;
    const n = Number(val);
    return isNaN(n) ? undefined : n;
  }

  getBoolean(key: string): boolean | undefined {
    const val = this.getString(key);
    if (val === 'true') return true;
    if (val === 'false') return false;
    return undefined;
  }

  delete(key: string): void {
    try {
      localStorage.removeItem(this.k(key));
    } catch {
      // Ignore
    }
  }

  clearAll(): void {
    try {
      const keys = Object.keys(localStorage);
      for (const key of keys) {
        if (key.startsWith(`${this.prefix}:`)) {
          localStorage.removeItem(key);
        }
      }
    } catch {
      // Ignore
    }
  }
}

export const appStore = new WebStore({ id: 'app-store' });
export const trackingStore = new WebStore({ id: 'tracking' });

export function getActiveCompanyId(): number | null {
  const id = appStore.getNumber('company_id');
  return id ?? null;
}

export function setActiveCompanyId(companyId: number): void {
  appStore.set('company_id', companyId);
}

/** SLIMEgachi — default persistence. */
import type { StorageAdapter } from './types';

/* Default storage adapter — localStorage */
export function makeLocalStorageAdapter(namespace: string): StorageAdapter {
  return {
    async load(key: string) {
      try {
        const raw = localStorage.getItem(namespace + ':' + key);
        return raw ? JSON.parse(raw) : null;
      } catch (e) { return null; }
    },
    async save(key: string, data: unknown) {
      try {
        localStorage.setItem(namespace + ':' + key, JSON.stringify(data));
        return true;
      } catch (e) { return false; }
    },
    async remove(key: string) {
      try { localStorage.removeItem(namespace + ':' + key); return true; }
      catch (e) { return false; }
    }
  };
}

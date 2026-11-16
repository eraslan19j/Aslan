import type { KeyValueStorage } from './save';

export const CRASH_LOG_KEY = 'istanbul_streets_crash_log_v1';
export const MAX_CRASH_RECORDS = 20;

export interface CrashRecord {
  id: string;
  timestampIso: string;
  source: 'window.onerror' | 'unhandledrejection' | 'runtime';
  message: string;
  stack?: string;
  version: string;
}

export class CrashLogStore {
  private readonly storage: KeyValueStorage;

  constructor(storage: KeyValueStorage) {
    this.storage = storage;
  }

  list(): CrashRecord[] {
    const raw = this.storage.getItem(CRASH_LOG_KEY);
    if (!raw) return [];
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(
        (item): item is CrashRecord =>
          Boolean(item) &&
          typeof item === 'object' &&
          typeof (item as CrashRecord).message === 'string' &&
          typeof (item as CrashRecord).timestampIso === 'string',
      );
    } catch {
      return [];
    }
  }

  record(entry: Omit<CrashRecord, 'id' | 'timestampIso'>, nowIso = new Date().toISOString()): CrashRecord {
    const existing = this.list();
    const created: CrashRecord = {
      id: `${Date.parse(nowIso) || 0}-${existing.length + 1}`,
      timestampIso: nowIso,
      source: entry.source,
      message: entry.message.slice(0, 500),
      stack: entry.stack ? entry.stack.slice(0, 1200) : undefined,
      version: entry.version,
    };
    const next = [...existing, created].slice(-MAX_CRASH_RECORDS);
    this.storage.setItem(CRASH_LOG_KEY, JSON.stringify(next));
    return created;
  }

  clear(): void {
    this.storage.removeItem(CRASH_LOG_KEY);
  }

  formatText(): string {
    const items = this.list();
    if (items.length === 0) return 'No crash records.';
    return items
      .map(
        (r) =>
          `[${r.timestampIso}] (${r.version}) ${r.source}: ${r.message}${r.stack ? `\n${r.stack}` : ''}`,
      )
      .join('\n---\n');
  }
}

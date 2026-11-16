import { describe, expect, it } from 'vitest';
import {
  createDefaultSave,
  SAVE_BACKUP_KEY,
  SAVE_PRIMARY_KEY,
  SaveStore,
  type KeyValueStorage,
} from './save';
import { CrashLogStore, MAX_CRASH_RECORDS } from './crashLog';

function createMemoryStorage(): KeyValueStorage {
  const map = new Map<string, string>();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => {
      map.set(k, v);
    },
    removeItem: (k) => {
      map.delete(k);
    },
  };
}

describe('core/save & core/crashLog isolation', () => {
  it('persists saves and recovers cleanly from primary corruption via backup', () => {
    const storage = createMemoryStorage();
    const store = new SaveStore(storage);

    const s1 = { ...createDefaultSave('2026-11-16T00:00:00.000Z'), cash: 1200 };
    store.save(s1);
    const s2 = { ...s1, cash: 2500 };
    store.save(s2);

    // Corrupt primary save JSON
    storage.setItem(SAVE_PRIMARY_KEY, '{corrupt json!!!');

    const loaded = store.load();
    expect(loaded.source).toBe('backup');
    expect(loaded.recoveredFromCorruption).toBe(true);
    expect(loaded.data.cash).toBe(1200);
  });

  it('falls back to default save if both primary and backup are invalid', () => {
    const storage = createMemoryStorage();
    storage.setItem(SAVE_PRIMARY_KEY, '{"schemaVersion": 999}');
    storage.setItem(SAVE_BACKUP_KEY, 'not-json');
    const store = new SaveStore(storage);

    const loaded = store.load();
    expect(loaded.source).toBe('default');
    expect(loaded.recoveredFromCorruption).toBe(true);
    expect(loaded.data.cash).toBe(250);
  });

  it('records crash logs up to MAX_CRASH_RECORDS without touching save data', () => {
    const storage = createMemoryStorage();
    const saveStore = new SaveStore(storage);
    const crashStore = new CrashLogStore(storage);

    saveStore.save({ ...createDefaultSave(), cash: 777 });

    for (let i = 0; i < MAX_CRASH_RECORDS + 5; i += 1) {
      crashStore.record({
        source: 'runtime',
        message: `Test error #${i}`,
        version: '0.0.1',
      });
    }

    const records = crashStore.list();
    expect(records.length).toBe(MAX_CRASH_RECORDS);
    expect(records[records.length - 1]?.message).toBe(`Test error #${MAX_CRASH_RECORDS + 4}`);

    // Player save remains completely intact after crashes
    expect(saveStore.load().data.cash).toBe(777);
  });
});

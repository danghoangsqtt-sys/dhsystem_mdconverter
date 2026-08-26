import { useCallback, useEffect, useRef } from 'react';
import { loadAutosave, saveAutosave, type AutosaveRecord } from '../autosaveDb';

function debounce(fn: (record: AutosaveRecord) => void | Promise<void>, ms: number): (record: AutosaveRecord) => void {
  let timeoutId: ReturnType<typeof setTimeout>;
  return (record: AutosaveRecord) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => { void fn(record); }, ms);
  };
}

export function useAutosave() {
  const saveRef = useRef<AutosaveRecord | null>(null);
  const debouncedSaveRef = useRef<((record: AutosaveRecord) => void) | null>(null);

  useEffect(() => {
    debouncedSaveRef.current = debounce(async (record: AutosaveRecord) => {
      try {
        await saveAutosave(record);
      } catch (err) {
        if (err instanceof DOMException && err.name === 'QuotaExceededError') {
          console.warn('[Autosave] IndexedDB quota exceeded, skipping save');
        } else {
          console.error('[Autosave] Save failed:', err);
        }
      }
    }, 2000);

    return () => {
      if (debouncedSaveRef.current) {
        // Flush pending save on unmount
        const record = saveRef.current;
        if (record) {
          saveAutosave(record).catch(() => {});
        }
      }
    };
  }, []);

  const load = useCallback(async (): Promise<AutosaveRecord | null> => {
    const record = await loadAutosave();
    saveRef.current = record;
    return record;
  }, []);

  const save = useCallback((content: string, fileName: string) => {
    const record = { content, fileName };
    saveRef.current = record;
    debouncedSaveRef.current?.(record);
  }, []);

  const clear = useCallback(() => {
    saveRef.current = null;
  }, []);

  return { load, save, clear };
}

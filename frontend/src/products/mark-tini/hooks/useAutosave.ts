import { useCallback, useEffect, useRef } from 'react';
import { loadAutosave, saveAutosave, type AutosaveRecord } from '../autosaveDb';

interface Debounced<T> {
  (record: T): void;
  cancel(): void;
}

function debounce(fn: (record: AutosaveRecord) => void | Promise<void>, ms: number): Debounced<AutosaveRecord> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const debounced = ((record: AutosaveRecord) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => { void fn(record); }, ms);
  }) as Debounced<AutosaveRecord>;
  debounced.cancel = () => clearTimeout(timeoutId);
  return debounced;
}

export function useAutosave(onSaved?: () => void, onError?: (err: unknown) => void) {
  const saveRef = useRef<AutosaveRecord | null>(null);
  const debouncedSaveRef = useRef<Debounced<AutosaveRecord> | null>(null);
  const onSavedRef = useRef(onSaved);
  const onErrorRef = useRef(onError);

  useEffect(() => {
    onSavedRef.current = onSaved;
    onErrorRef.current = onError;
  }, [onSaved, onError]);

  useEffect(() => {
    debouncedSaveRef.current = debounce(async (record: AutosaveRecord) => {
      try {
        await saveAutosave(record);
        onSavedRef.current?.();
      } catch (err) {
        if (err instanceof DOMException && err.name === 'QuotaExceededError') {
          console.warn('[Autosave] IndexedDB quota exceeded, skipping save');
        } else {
          console.error('[Autosave] Save failed:', err);
        }
        onErrorRef.current?.(err);
      }
    }, 2000);

    return () => {
      const debounced = debouncedSaveRef.current;
      if (debounced) {
        // Cancel the pending debounce timer so it can't fire later (after
        // unmount, e.g. an ErrorBoundary retry) and overwrite the shared
        // IndexedDB slot with whatever it last captured.
        debounced.cancel();
        // Flush the latest record synchronously instead.
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

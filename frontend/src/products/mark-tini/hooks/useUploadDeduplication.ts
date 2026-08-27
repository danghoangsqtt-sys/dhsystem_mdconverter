import { useCallback, useRef } from 'react';

interface PendingUpload {
  promise: Promise<boolean>;
  abort: () => void;
}

export function useUploadDeduplication() {
  const pendingUploads = useRef<Map<string, PendingUpload>>(new Map());

  const getFileKey = useCallback((file: File): string => {
    return `${file.name}-${file.size}-${file.lastModified}`;
  }, []);

  const isPending = useCallback((file: File): boolean => {
    const key = getFileKey(file);
    return pendingUploads.current.has(key);
  }, [getFileKey]);

  const executeWithDedup = useCallback(async (
    file: File,
    uploadFn: (signal: AbortSignal) => Promise<boolean>
  ): Promise<boolean> => {
    const key = getFileKey(file);

    // Check if already pending
    const existing = pendingUploads.current.get(key);
    if (existing) {
      return existing.promise;
    }

    const controller = new AbortController();

    // Only clear the slot if it's still the entry we installed — a
    // cancel-then-immediately-retry of the same file can otherwise let this
    // stale cleanup delete a newer, still-in-flight entry for the same key.
    const clearIfCurrent = () => {
      if (pendingUploads.current.get(key)?.promise === promise) {
        pendingUploads.current.delete(key);
      }
    };

    const promise = uploadFn(controller.signal).finally(clearIfCurrent);

    const pending: PendingUpload = {
      promise,
      abort: () => controller.abort(),
    };

    pendingUploads.current.set(key, pending);

    try {
      return await promise;
    } catch (err) {
      clearIfCurrent();
      throw err;
    }
  }, [getFileKey]);

  const cancelAll = useCallback(() => {
    for (const pending of pendingUploads.current.values()) {
      pending.abort();
    }
    pendingUploads.current.clear();
  }, []);

  const cancelFile = useCallback((file: File) => {
    const key = getFileKey(file);
    const pending = pendingUploads.current.get(key);
    if (pending) {
      pending.abort();
      pendingUploads.current.delete(key);
    }
  }, [getFileKey]);

  return { isPending, executeWithDedup, cancelAll, cancelFile };
}
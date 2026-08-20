import React, { useCallback, useEffect, useRef, useState } from 'react';
import { GripHorizontal, Search, PlusSquare, X } from 'lucide-react';
import type { ExtractionResult } from '../types';

interface ExtractionResultsPanelProps {
  results: ExtractionResult[];
  onTextChange: (id: string, text: string) => void;
  onSearch: (result: ExtractionResult) => void;
  onInsert: (result: ExtractionResult) => void;
  onDismiss: (id: string) => void;
}

const MIN_PANEL_HEIGHT = 140;
const DEFAULT_PANEL_HEIGHT = 256;
const PANEL_HEIGHT_STORAGE_KEY = 'marktini_extraction_panel_height';

const clampPanelHeight = (height: number): number => {
  const maxHeight = Math.max(MIN_PANEL_HEIGHT, Math.floor(window.innerHeight * 0.65));
  return Math.min(maxHeight, Math.max(MIN_PANEL_HEIGHT, height));
};

export const ExtractionResultsPanel: React.FC<ExtractionResultsPanelProps> = ({
  results,
  onTextChange,
  onSearch,
  onInsert,
  onDismiss,
}) => {
  const [height, setHeight] = useState(() => {
    const stored = Number(localStorage.getItem(PANEL_HEIGHT_STORAGE_KEY));
    return Number.isFinite(stored) && stored >= MIN_PANEL_HEIGHT
      ? clampPanelHeight(stored)
      : DEFAULT_PANEL_HEIGHT;
  });
  const [isResizing, setIsResizing] = useState(false);
  const resizeCleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    localStorage.setItem(PANEL_HEIGHT_STORAGE_KEY, String(height));
  }, [height]);

  useEffect(() => () => resizeCleanupRef.current?.(), []);

  const startResize = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    resizeCleanupRef.current?.();
    const startY = event.clientY;
    const startHeight = height;
    setIsResizing(true);

    const handleMove = (moveEvent: globalThis.MouseEvent) => {
      setHeight(clampPanelHeight(startHeight + startY - moveEvent.clientY));
    };
    const cleanup = () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', cleanup);
      resizeCleanupRef.current = null;
      setIsResizing(false);
    };
    resizeCleanupRef.current = cleanup;
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', cleanup);
  }, [height]);

  const handleResizeKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
    event.preventDefault();
    setHeight(current => clampPanelHeight(current + (event.key === 'ArrowUp' ? 24 : -24)));
  }, []);

  if (results.length === 0) return null;

  return (
    <div
      className={`bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden flex-shrink-0 flex flex-col ${isResizing ? 'select-none' : ''}`}
      style={{ height }}
    >
      <div
        role="separator"
        aria-label="Kéo để thay đổi chiều cao vùng đã trích xuất"
        aria-orientation="horizontal"
        tabIndex={0}
        onMouseDown={startResize}
        onKeyDown={handleResizeKeyDown}
        title="Kéo lên hoặc xuống để thay đổi chiều cao"
        className="h-3 flex-shrink-0 cursor-row-resize flex items-center justify-center text-gray-300 hover:text-blue-500 hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-400 transition-colors"
      >
        <GripHorizontal size={18} />
      </div>
      <div className="px-3 py-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wider sticky top-0 bg-white border-b border-gray-100">
        Vùng đã trích xuất — {results.length}
      </div>
      <div className="px-3 pb-3 space-y-2 overflow-y-auto flex-1 min-h-0">
        {results.map((result) => (
          <div key={result.id} className="bg-white border border-gray-200 rounded-md p-2 shadow-sm">
            <div className="flex justify-between items-start gap-2">
              <textarea
                value={result.text}
                onChange={(e) => onTextChange(result.id, e.target.value)}
                rows={3}
                placeholder="Không nhận diện được văn bản..."
                className="flex-1 min-h-16 text-xs text-gray-700 border border-gray-100 rounded p-1.5 resize-y focus:outline-none focus:ring-1 focus:ring-blue-400"
              />
              <button
                onClick={() => onDismiss(result.id)}
                title="Bỏ qua"
                className="text-gray-300 hover:text-gray-500 flex-shrink-0"
              >
                <X size={14} />
              </button>
            </div>
            <div className="flex gap-2 mt-2">
              <button
                onClick={() => onSearch(result)}
                disabled={!result.text.trim()}
                className="flex-1 flex items-center justify-center gap-1.5 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 disabled:opacity-40 disabled:cursor-not-allowed rounded px-2 py-1.5 transition-colors"
              >
                <Search size={12} /> Tìm kiếm trên web
              </button>
              <button
                onClick={() => onInsert(result)}
                disabled={!result.text.trim()}
                className="flex-1 flex items-center justify-center gap-1.5 text-xs font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed rounded px-2 py-1.5 transition-colors"
              >
                <PlusSquare size={12} /> Chèn vào tài liệu
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

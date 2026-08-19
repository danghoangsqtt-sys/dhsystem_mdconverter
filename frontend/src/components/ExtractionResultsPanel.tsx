import React from 'react';
import { Search, PlusSquare, X } from 'lucide-react';
import type { ExtractionResult } from '../types';

interface ExtractionResultsPanelProps {
  results: ExtractionResult[];
  onTextChange: (id: string, text: string) => void;
  onSearch: (result: ExtractionResult) => void;
  onInsert: (result: ExtractionResult) => void;
  onDismiss: (id: string) => void;
}

export const ExtractionResultsPanel: React.FC<ExtractionResultsPanelProps> = ({
  results,
  onTextChange,
  onSearch,
  onInsert,
  onDismiss,
}) => {
  if (results.length === 0) return null;

  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-sm max-h-64 overflow-y-auto flex-shrink-0">
      <div className="px-3 py-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wider sticky top-0 bg-white border-b border-gray-100">
        Vùng đã trích xuất — {results.length}
      </div>
      <div className="px-3 pb-3 space-y-2">
        {results.map((result) => (
          <div key={result.id} className="bg-white border border-gray-200 rounded-md p-2 shadow-sm">
            <div className="flex justify-between items-start gap-2">
              <textarea
                value={result.text}
                onChange={(e) => onTextChange(result.id, e.target.value)}
                rows={3}
                placeholder="Không nhận diện được văn bản..."
                className="flex-1 text-xs text-gray-700 border border-gray-100 rounded p-1.5 resize-none focus:outline-none focus:ring-1 focus:ring-blue-400"
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

import React from 'react';
import { X, Languages } from 'lucide-react';
import type { TranslationEntry } from '../types';
import { TRANSLATION_DOMAIN_OPTIONS } from '../services/api';

interface TranslationPanelProps {
  results: TranslationEntry[];
  onDismiss: (id: string) => void;
}

const directionLabel = (direction: string): string => (direction === 'vi_en' ? 'VI → EN' : 'EN → VI');

// Only the translated side's language depends on direction — the "original"
// box's label ("Gốc") is language-agnostic and stays fixed either way.
const targetLanguageLabel = (direction: string): string => (direction === 'vi_en' ? 'Tiếng Anh' : 'Tiếng Việt');

const domainLabel = (domain: string | null): string | null => {
  if (!domain) return null;
  return TRANSLATION_DOMAIN_OPTIONS.find(opt => opt.value === domain)?.label ?? null;
};

export const TranslationPanel: React.FC<TranslationPanelProps> = ({ results, onDismiss }) => {
  if (results.length === 0) return null;

  return (
    <div className="bg-white border-t border-gray-200 shadow-sm max-h-64 overflow-y-auto flex-shrink-0">
      <div className="px-3 py-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wider sticky top-0 bg-white border-b border-gray-100">
        Bản dịch — {results.length}
      </div>
      <div className="px-3 pb-3 space-y-2">
        {results.map((result) => (
          <div key={result.id} className="bg-white border border-gray-200 rounded-md p-2 shadow-sm space-y-2">
            <div className="flex justify-between items-start gap-2">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="flex items-center gap-1 text-[11px] font-medium text-blue-700 flex-shrink-0">
                  <Languages size={12} /> {directionLabel(result.direction)}
                </span>
                {domainLabel(result.domain) && (
                  <span className="text-[11px] text-gray-400 truncate">· {domainLabel(result.domain)}</span>
                )}
              </div>
              <button
                onClick={() => onDismiss(result.id)}
                title="Bỏ qua"
                className="text-gray-300 hover:text-gray-500 flex-shrink-0"
              >
                <X size={14} />
              </button>
            </div>

            <div className="rounded p-2 bg-blue-50/60 border border-blue-100">
              <p className="text-[11px] font-medium text-blue-500 uppercase tracking-wide mb-1">
                {targetLanguageLabel(result.direction)}
              </p>
              <p className="text-xs text-gray-800 whitespace-pre-wrap">{result.translated_text}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

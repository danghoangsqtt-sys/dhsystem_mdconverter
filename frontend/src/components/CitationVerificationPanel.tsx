import React from 'react';
import { X, BadgeCheck, BadgeAlert, BadgeX, Sparkles, AlertTriangle } from 'lucide-react';
import type { CitationVerificationEntry, CitationMatch } from '../types';

interface CitationVerificationPanelProps {
  results: CitationVerificationEntry[];
  onDismiss: (id: string) => void;
}

const matchBadge = (match: CitationMatch | null): { label: string; className: string; icon: React.ElementType } => {
  if (!match) {
    return { label: 'Không tìm thấy nguồn', className: 'bg-gray-100 text-gray-500', icon: BadgeX };
  }
  if (match.confidence >= 0.75) {
    return { label: 'Khớp', className: 'bg-green-100 text-green-700', icon: BadgeCheck };
  }
  if (match.confidence >= 0.4) {
    return { label: 'Có thể khớp', className: 'bg-yellow-100 text-yellow-700', icon: BadgeAlert };
  }
  return { label: 'Chưa chắc khớp', className: 'bg-orange-100 text-orange-700', icon: BadgeAlert };
};

export const CitationVerificationPanel: React.FC<CitationVerificationPanelProps> = ({ results, onDismiss }) => {
  if (results.length === 0) return null;

  return (
    <div className="bg-white border-t border-gray-200 shadow-sm max-h-64 overflow-y-auto flex-shrink-0">
      <div className="px-3 py-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wider sticky top-0 bg-white border-b border-gray-100">
        Xác minh trích dẫn — {results.length}
      </div>
      <div className="px-3 pb-3 space-y-2">
        {results.map((result) => {
          const badge = matchBadge(result.match);
          const BadgeIcon = badge.icon;
          return (
            <div key={result.id} className="bg-white border border-gray-200 rounded-md p-2 shadow-sm space-y-2">
              <div className="flex justify-between items-start gap-2">
                <p className="flex-1 text-xs text-gray-500 italic truncate" title={result.query_text}>
                  "{result.query_text}"
                </p>
                <button
                  onClick={() => onDismiss(result.id)}
                  title="Bỏ qua"
                  className="text-gray-300 hover:text-gray-500 flex-shrink-0"
                >
                  <X size={14} />
                </button>
              </div>

              <div className="rounded p-2 bg-gray-50 border border-gray-100">
                <div className={`inline-flex items-center gap-1 text-[11px] font-medium px-1.5 py-0.5 rounded ${badge.className}`}>
                  <BadgeIcon size={12} /> {badge.label}
                </div>
                {result.match ? (
                  <div className="mt-1.5 text-xs text-gray-700 space-y-0.5">
                    <p className="font-medium">{result.match.title}</p>
                    <p className="text-gray-500">
                      {result.match.authors.length > 0 ? result.match.authors.join(', ') : 'Không rõ tác giả'}
                      {result.match.year ? ` · ${result.match.year}` : ''}
                    </p>
                    {result.match.doi && <p className="text-gray-400 truncate">DOI: {result.match.doi}</p>}
                  </div>
                ) : (
                  <p className="mt-1.5 text-xs text-gray-500">
                    Không tìm thấy nguồn phù hợp trên OpenAlex cho nội dung đã chọn.
                  </p>
                )}
              </div>

              <div className="rounded p-2 bg-purple-50/60 border border-dashed border-purple-200">
                <div className="flex items-center gap-1 text-[11px] font-medium text-purple-700">
                  <Sparkles size={12} /> Đánh giá nội dung (tham khảo)
                </div>
                {result.llm_available && result.llm_assessment ? (
                  <>
                    <p className="mt-1 text-xs text-gray-700">{result.llm_assessment}</p>
                    <p className="mt-1 flex items-center gap-1 text-[10px] text-purple-600">
                      <AlertTriangle size={10} /> Chỉ mang tính tham khảo, không phải kết luận chính xác.
                    </p>
                  </>
                ) : (
                  <p className="mt-1 text-xs text-gray-500">
                    Cần Ollama đang chạy cục bộ để dùng gợi ý nội dung.
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

import React, { useState } from 'react';
import {
  FileText,
  Save,
  Copy,
  Check,
  Loader2,
  Pencil,
  Columns2,
  Eye,
  ShieldCheck,
  Languages,
  Upload
} from 'lucide-react';
import type { PreviewType } from '@uiw/react-md-editor';
import type { TranslationDirection, TranslationDomain } from '../services/api';
import { TRANSLATION_DIRECTION_OPTIONS, TRANSLATION_DOMAIN_OPTIONS } from '../services/api';
import type { SourceFileMetadata } from '../types';

interface ToolbarProps {
  onSave: () => void;
  onCopy: () => void;
  onVerifyCitation: () => void;
  canVerifyCitation: boolean;
  isVerifyingCitation: boolean;
  onTranslate: () => void;
  canTranslate: boolean;
  isTranslating: boolean;
  translationDirection: TranslationDirection;
  onTranslationDirectionChange: (direction: TranslationDirection) => void;
  translationDomain: TranslationDomain | null;
  onTranslationDomainChange: (domain: TranslationDomain | null) => void;
  fileName: string;
  saveStatus: 'saved' | 'saving';
  previewMode: PreviewType;
  onPreviewModeChange: (mode: PreviewType) => void;
  sourceFileMetadata: SourceFileMetadata | null;
  onOpenOriginal: () => void;
}

const PREVIEW_MODES: { mode: PreviewType; icon: React.ElementType; label: string }[] = [
  { mode: 'edit', icon: Pencil, label: 'Chỉ soạn thảo' },
  { mode: 'live', icon: Columns2, label: 'Soạn thảo + Xem trước' },
  { mode: 'preview', icon: Eye, label: 'Chỉ xem trước' },
];

const Toolbar: React.FC<ToolbarProps> = ({
  onSave,
  onCopy,
  onVerifyCitation,
  canVerifyCitation,
  isVerifyingCitation,
  onTranslate,
  canTranslate,
  isTranslating,
  translationDirection,
  onTranslationDirectionChange,
  translationDomain,
  onTranslationDomainChange,
  fileName,
  saveStatus,
  previewMode,
  onPreviewModeChange,
  sourceFileMetadata,
  onOpenOriginal
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    onCopy();
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="h-16 bg-white border-b border-gray-100 flex items-center px-4 justify-between shadow-sm flex-shrink-0 z-10">
      <div className="flex items-center space-x-4">
        <div className="flex items-center space-x-2 mr-4">
          <div className="bg-blue-600 p-1.5 rounded text-white shadow-sm">
            <FileText size={18} strokeWidth={1.5} />
          </div>
          <div>
             <h1 className="font-semibold text-[13px] text-gray-800 leading-tight">Mark Tini</h1>
             <div className="flex items-center space-x-2">
                <p className="text-[11px] text-gray-500 truncate max-w-[150px]">{fileName}</p>
                <span className="text-gray-300">|</span>
                <div className="flex items-center text-[11px] text-gray-400">
                    {saveStatus === 'saving' ? (
                       <>
                         <Loader2 size={10} className="animate-spin mr-1" />
                         <span>Đang lưu...</span>
                       </>
                    ) : (
                       <>
                         <Check size={10} className="mr-1 text-green-500" />
                         <span>Đã lưu</span>
                       </>
                    )}
                </div>
             </div>
          </div>
        </div>
      </div>

      <div className="flex items-center space-x-2">
        <div className="flex items-center bg-gray-100 rounded-md p-0.5 mr-1">
          {PREVIEW_MODES.map(({ mode, icon: Icon, label }) => (
            <button
              key={mode}
              onClick={() => onPreviewModeChange(mode)}
              title={label}
              aria-label={label}
              className={`flex items-center justify-center p-1.5 rounded transition-colors ${
                previewMode === mode
                  ? 'bg-white text-blue-600 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <Icon size={14} />
            </button>
          ))}
        </div>

        <button
          onClick={onVerifyCitation}
          disabled={!canVerifyCitation || isVerifyingCitation}
          title={canVerifyCitation ? 'Kiểm tra trích dẫn/nội dung đã chọn' : 'Bôi đen một đoạn trong bản xem trước để kiểm tra'}
          className="flex items-center space-x-2 px-3 py-1.5 rounded-md text-[13px] font-medium transition-colors border bg-white hover:bg-gray-50 text-gray-700 border-gray-200 shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {isVerifyingCitation ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
          <span>{isVerifyingCitation ? 'Đang xác minh...' : 'Xác minh trích dẫn'}</span>
        </button>

        <div className="flex items-center gap-1">
          <select
            value={translationDirection}
            onChange={(e) => onTranslationDirectionChange(e.target.value as TranslationDirection)}
            disabled={isTranslating}
            title="Chiều dịch"
            className="text-[11px] border border-gray-200 rounded px-1.5 py-1.5 bg-white text-gray-700 disabled:opacity-50"
          >
            {TRANSLATION_DIRECTION_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <select
            value={translationDomain ?? ''}
            onChange={(e) => onTranslationDomainChange(e.target.value === '' ? null : (e.target.value as TranslationDomain))}
            disabled={isTranslating}
            title="Lĩnh vực thuật ngữ"
            className="text-[11px] border border-gray-200 rounded px-1.5 py-1.5 bg-white text-gray-700 disabled:opacity-50 max-w-[128px]"
          >
            {TRANSLATION_DOMAIN_OPTIONS.map(opt => (
              <option key={opt.value ?? 'none'} value={opt.value ?? ''}>{opt.label}</option>
            ))}
          </select>
        </div>

        <button
          onClick={onTranslate}
          disabled={!canTranslate || isTranslating}
          title={canTranslate ? 'Dịch đoạn đã chọn' : 'Bôi đen một đoạn trong bản xem trước để dịch'}
          className="flex items-center space-x-2 px-3 py-1.5 rounded-md text-[13px] font-medium transition-colors border bg-white hover:bg-gray-50 text-gray-700 border-gray-200 shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {isTranslating ? <Loader2 size={14} className="animate-spin" /> : <Languages size={14} />}
          <span>{isTranslating ? 'Đang dịch...' : 'Dịch đoạn đã chọn'}</span>
        </button>

        <button
          onClick={handleCopy}
          className={`flex items-center space-x-2 px-3 py-1.5 rounded-md text-[13px] font-medium transition-colors border ${
            copied 
              ? 'bg-green-50 text-green-700 border-green-200 shadow-sm' 
              : 'bg-white hover:bg-gray-50 text-gray-700 border-gray-200 shadow-sm'
          }`}
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
          <span>{copied ? 'Đã chép' : 'Sao chép'}</span>
        </button>

        {sourceFileMetadata && (
          <button
            onClick={onOpenOriginal}
            title={`Mở lại file gốc: ${sourceFileMetadata.originalFilename}`}
            className="flex items-center space-x-2 px-3 py-1.5 rounded-md text-[13px] font-medium transition-colors border bg-white hover:bg-gray-50 text-gray-700 border-gray-200 shadow-sm"
          >
            <Upload size={14} />
            <span>Mở file gốc ({sourceFileMetadata.originalFilename})</span>
          </button>
        )}

        <button 
          onClick={onSave}
          className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-md text-[13px] font-medium transition-colors shadow-sm"
        >
          <Save size={14} />
          <span>Lưu file</span>
        </button>
      </div>
    </div>
  );
};

export default Toolbar;
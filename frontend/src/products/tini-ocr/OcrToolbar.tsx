import { FileOutput, Loader2, RotateCcw, ScanText, ShieldCheck } from 'lucide-react';
import type { OcrExportFormat } from './api';
import type { Stage } from './TiniOcrApp';

interface OcrToolbarProps {
  stage: Stage;
  imageCount: number;
  isBackendReady: boolean;
  onStartRecognition: () => void;
  exportFormat: OcrExportFormat;
  onExportFormatChange: (format: OcrExportFormat) => void;
  exportOptions: { value: OcrExportFormat; label: string }[];
  onExport: () => void;
  isExporting: boolean;
  onStartOver: () => void;
}

export default function OcrToolbar({
  stage,
  imageCount,
  isBackendReady,
  onStartRecognition,
  exportFormat,
  onExportFormatChange,
  exportOptions,
  onExport,
  isExporting,
  onStartOver,
}: OcrToolbarProps) {
  return (
    <div
      data-testid="ocr-toolbar"
      className="min-h-16 bg-white border-b border-gray-100 flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2 shadow-sm flex-shrink-0 z-10"
    >
      <div className="flex min-w-0 flex-none items-center">
        <div className="flex min-w-0 items-center space-x-2">
          <div className="bg-blue-600 p-1.5 rounded text-white shadow-sm flex-shrink-0">
            <ScanText size={18} strokeWidth={1.5} />
          </div>
          <div>
            <h1 className="font-semibold text-[13px] text-gray-800 leading-tight">Tini OCR</h1>
            <p className="text-[11px] text-gray-500">Image to Text &amp; Word</p>
          </div>
        </div>
      </div>

      <div className="flex min-w-0 flex-1 basis-[420px] flex-wrap items-center justify-end gap-2">
        <span className="flex flex-none items-center gap-1.5 px-2.5 py-1 rounded-full bg-green-50 text-green-700 border border-green-100 text-[11px] font-medium whitespace-nowrap">
          <ShieldCheck size={13} /> Xử lý hoàn toàn trên máy
        </span>

        {stage === 'idle' && imageCount > 0 && (
          <button
            type="button"
            onClick={onStartRecognition}
            disabled={!isBackendReady}
            className="flex flex-none items-center space-x-2 whitespace-nowrap bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-md text-[13px] font-medium transition-colors shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <ScanText size={14} />
            <span>{isBackendReady ? 'Bắt đầu nhận dạng' : 'Đang khởi động máy chủ...'}</span>
          </button>
        )}

        {stage === 'reviewing' && (
          <>
            <select
              value={exportFormat}
              onChange={event => onExportFormatChange(event.target.value as OcrExportFormat)}
              title="Định dạng xuất"
              className="text-[11px] border border-gray-200 rounded px-1.5 py-1.5 bg-white text-gray-700 max-w-[220px]"
            >
              {exportOptions.map(option => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>

            <button
              type="button"
              onClick={onExport}
              disabled={isExporting}
              className="flex flex-none items-center space-x-2 whitespace-nowrap bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-md text-[13px] font-medium transition-colors shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isExporting ? <Loader2 size={14} className="animate-spin" /> : <FileOutput size={14} />}
              <span>{isExporting ? 'Đang xuất...' : 'Xuất file'}</span>
            </button>

            <button
              type="button"
              onClick={onStartOver}
              className="flex flex-none items-center space-x-2 whitespace-nowrap px-3 py-1.5 rounded-md text-[13px] font-medium transition-colors border bg-white hover:bg-gray-50 text-gray-700 border-gray-200 shadow-sm"
            >
              <RotateCcw size={14} />
              <span>Làm lại từ đầu</span>
            </button>
          </>
        )}
      </div>
    </div>
  );
}

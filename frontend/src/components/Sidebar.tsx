import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Upload, HelpCircle, FilePlus, RefreshCcw, FolderOpen, Box, History, Trash2, Languages, Table2, ChevronLeft, ChevronRight } from 'lucide-react';
import type { OcrLang, TableMode, HistoryEntry } from '../services/api';
import { OCR_LANG_OPTIONS, TABLE_MODE_OPTIONS } from '../services/api';

interface SidebarItemProps {
  icon: React.ElementType;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  active?: boolean;
}

const SidebarItem: React.FC<SidebarItemProps> = ({ icon: Icon, label, onClick, disabled = false, active = false }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className={`w-full flex items-center space-x-3 px-3 py-2 text-sm font-medium transition-colors rounded-md
      ${active ? 'bg-gray-100 text-gray-900' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'}
      ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}
    `}
  >
    <Icon size={18} strokeWidth={1.5} />
    <span>{label}</span>
  </button>
);

type BackendStatus = 'connecting' | 'starting' | 'loading_models' | 'ready' | 'error' | 'unreachable';

interface SidebarProps {
  onFilesUpload: (files: File[]) => void;
  onOpenMarkdown: (file: File) => void;
  onNewDocument: () => void;
  onShowHelp: () => void;
  isProcessing: boolean;
  backendStatus: BackendStatus;
  backendDetail: string;
  ocrLang: OcrLang;
  onOcrLangChange: (lang: OcrLang) => void;
  tableMode: TableMode;
  onTableModeChange: (mode: TableMode) => void;
  history: HistoryEntry[];
  onLoadHistoryItem: (jobId: string) => void;
  onDeleteHistoryItem: (jobId: string) => void;
}

const formatHistoryDate = (iso: string): string => {
  try {
    return new Date(iso).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return '';
  }
};

const MIN_WIDTH = 200;
const MAX_WIDTH = 420;
const DEFAULT_WIDTH = 256;
const COLLAPSED_WIDTH = 56;
const WIDTH_STORAGE_KEY = 'documark_sidebar_width';
const COLLAPSED_STORAGE_KEY = 'documark_sidebar_collapsed';

const Sidebar: React.FC<SidebarProps> = ({
  onFilesUpload,
  onOpenMarkdown,
  onNewDocument,
  onShowHelp,
  isProcessing,
  backendStatus,
  backendDetail,
  ocrLang,
  onOcrLangChange,
  tableMode,
  onTableModeChange,
  history,
  onLoadHistoryItem,
  onDeleteHistoryItem,
}) => {
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const mdInputRef = useRef<HTMLInputElement>(null);
  const backendReady = backendStatus === 'ready';
  const backendFailed = backendStatus === 'error' || backendStatus === 'unreachable';
  const uploadDisabled = isProcessing || !backendReady;

  const [width, setWidth] = useState<number>(() => {
    const stored = Number(localStorage.getItem(WIDTH_STORAGE_KEY));
    return stored >= MIN_WIDTH && stored <= MAX_WIDTH ? stored : DEFAULT_WIDTH;
  });
  const [collapsed, setCollapsed] = useState<boolean>(
    () => localStorage.getItem(COLLAPSED_STORAGE_KEY) === 'true'
  );
  const isDraggingRef = useRef(false);

  useEffect(() => {
    localStorage.setItem(WIDTH_STORAGE_KEY, String(width));
  }, [width]);

  useEffect(() => {
    localStorage.setItem(COLLAPSED_STORAGE_KEY, String(collapsed));
  }, [collapsed]);

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDraggingRef.current = true;
    const startX = e.clientX;
    const startWidth = width;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!isDraggingRef.current) return;
      const next = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidth + (moveEvent.clientX - startX)));
      setWidth(next);
    };
    const handleMouseUp = () => {
      isDraggingRef.current = false;
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  }, [width]);

  const handlePdfChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onFilesUpload(Array.from(e.target.files));
    }
    if (pdfInputRef.current) {
      pdfInputRef.current.value = '';
    }
  };

  const handleMdChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      onOpenMarkdown(e.target.files[0]);
    }
    if (mdInputRef.current) {
      mdInputRef.current.value = '';
    }
  };

  return (
    <div
      className="relative bg-[#fbfbfa] border-r border-[#e5e7eb] h-full flex flex-col flex-shrink-0 z-20"
      style={{
        width: collapsed ? COLLAPSED_WIDTH : width,
        transition: isDraggingRef.current ? 'none' : 'width 150ms ease',
      }}
    >
      <button
        onClick={() => setCollapsed((c) => !c)}
        title={collapsed ? 'Mở rộng thanh bên' : 'Thu gọn thanh bên'}
        className="absolute -right-3 top-4 z-30 w-6 h-6 rounded-full bg-white border border-gray-200 shadow-sm flex items-center justify-center text-gray-500 hover:text-gray-800 hover:bg-gray-50 transition-colors"
      >
        {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
      </button>

      {!collapsed && (
        <div
          onMouseDown={handleResizeStart}
          title="Kéo để thay đổi kích thước"
          className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-blue-400/40 active:bg-blue-500/50 z-20"
        />
      )}

      {collapsed ? (
        <div className="flex-1 flex flex-col items-center pt-4 gap-3">
          <div className="w-8 h-8 bg-blue-600 rounded-md flex items-center justify-center flex-shrink-0">
            <span className="text-white font-bold text-[10px]">DH</span>
          </div>
          <span
            className={`w-2 h-2 rounded-full flex-shrink-0 ${
              backendFailed ? 'bg-red-500' : backendReady ? 'bg-blue-500' : 'bg-amber-500 animate-pulse'
            }`}
            title={backendReady ? 'Máy chủ sẵn sàng' : backendDetail}
          />
        </div>
      ) : (
        <>
          <div className="p-4 border-b border-transparent">
            <button
              onClick={() => pdfInputRef.current?.click()}
              disabled={uploadDisabled}
              title={!backendReady ? backendDetail : undefined}
              className={`w-full flex items-center justify-center space-x-2 py-2 px-3 rounded-md border transition-all shadow-sm group
                ${uploadDisabled
                  ? 'border-gray-200 bg-gray-50 text-gray-400 cursor-not-allowed'
                  : 'border-[#e5e7eb] bg-white text-gray-800 hover:bg-gray-50'
                }
              `}
            >
              {isProcessing || (!backendReady && !backendFailed) ? (
                <RefreshCcw size={20} className="animate-spin" />
              ) : (
                <Upload size={20} className="group-hover:scale-110 transition-transform" />
              )}
              <span className="font-semibold">
                {isProcessing ? 'Đang xử lý...' : !backendReady ? 'Đang khởi động...' : 'Chọn PDF & Chuyển đổi'}
              </span>
            </button>

            {/* .doc (legacy binary Word) is deliberately excluded: docling only
                supports the OOXML .docx format and would fail on old .doc files.
                multiple: batch upload processes each file sequentially (see
                App.tsx's handleFilesUpload). */}
            <input type="file" multiple ref={pdfInputRef} onChange={handlePdfChange} accept=".pdf,.docx,.pptx,.html" className="hidden" />
            <input type="file" ref={mdInputRef} onChange={handleMdChange} accept=".md,.markdown,.txt" className="hidden" />

            <div className="grid grid-cols-2 gap-1.5 mt-2.5">
              <label className="flex flex-col gap-0.5">
                <span className="flex items-center gap-1 text-[10px] font-medium text-gray-400">
                  <Languages size={11} /> Ngôn ngữ OCR
                </span>
                <select
                  value={ocrLang}
                  onChange={(e) => onOcrLangChange(e.target.value as OcrLang)}
                  disabled={isProcessing}
                  className="text-[11px] border border-gray-200 rounded px-1.5 py-1 bg-white text-gray-700 disabled:opacity-50"
                >
                  {OCR_LANG_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-0.5">
                <span className="flex items-center gap-1 text-[10px] font-medium text-gray-400">
                  <Table2 size={11} /> Chế độ bảng
                </span>
                <select
                  value={tableMode}
                  onChange={(e) => onTableModeChange(e.target.value as TableMode)}
                  disabled={isProcessing}
                  className="text-[11px] border border-gray-200 rounded px-1.5 py-1 bg-white text-gray-700 disabled:opacity-50"
                >
                  {TABLE_MODE_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </label>
            </div>

            {backendReady ? (
              <div className="flex items-center justify-center mt-3 space-x-1.5 text-xs text-gray-500">
                <Box size={14} className="text-blue-500" />
                <span>Core: <span className="font-semibold text-blue-700">Mark Tini Engine v2</span></span>
              </div>
            ) : (
              <div className="flex items-center justify-center mt-3 space-x-1.5 text-xs text-gray-500" title={backendDetail}>
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${backendFailed ? 'bg-red-500' : 'bg-amber-500 animate-pulse'}`} />
                <span className="truncate">{backendDetail}</span>
              </div>
            )}
          </div>

          <div className="px-2 pt-2 space-y-1 flex-shrink-0">
            <div className="px-2 py-1 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Chức năng</div>
            <SidebarItem icon={FilePlus} label="Tài liệu mới" onClick={onNewDocument} disabled={isProcessing} />
            <SidebarItem icon={FolderOpen} label="Mở file Markdown" onClick={() => mdInputRef.current?.click()} disabled={isProcessing} />
            <SidebarItem icon={HelpCircle} label="Hướng dẫn sử dụng" onClick={onShowHelp} />
          </div>

          <div className="flex-1 overflow-y-auto py-2 px-2 custom-scrollbar space-y-0.5 mt-1 border-t border-gray-100">
            <div className="px-2 py-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
              <History size={12} /> Lịch sử
            </div>
            {history.length === 0 ? (
              <p className="px-2 text-xs text-gray-400">Chưa có tài liệu nào được chuyển đổi.</p>
            ) : (
              history.map((entry) => (
                <div
                  key={entry.job_id}
                  onClick={() => onLoadHistoryItem(entry.job_id)}
                  className="group flex items-center gap-1 px-2 py-1.5 rounded-md hover:bg-gray-100 cursor-pointer"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-gray-700 truncate" title={entry.original_filename}>{entry.original_filename}</p>
                    <p className="text-[10px] text-gray-400">{formatHistoryDate(entry.created_at)}</p>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); onDeleteHistoryItem(entry.job_id); }}
                    title="Xóa khỏi lịch sử"
                    className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 transition-opacity flex-shrink-0"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))
            )}
          </div>

          {/* ─── Publisher Info ─── */}
          <div className="p-3 border-t border-gray-200">
            <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-lg p-3 text-xs text-gray-600 space-y-2">
              <div className="flex items-center space-x-2">
                <div className="w-7 h-7 bg-blue-600 rounded-md flex items-center justify-center flex-shrink-0">
                  <span className="text-white font-bold text-[10px]">DH</span>
                </div>
                <div>
                  <p className="font-bold text-gray-800 leading-tight">Mark Tini</p>
                  <p className="text-[10px] text-gray-400">Phiên bản 1.2.0</p>
                </div>
              </div>

              <div className="space-y-1 text-[10px] text-gray-500 border-t border-gray-200 pt-2">
                <p><span className="font-semibold text-gray-600">Engine:</span> DHSystem Core Engine v2</p>
                <p><span className="font-semibold text-gray-600">Hỗ trợ:</span> PDF, DOCX, PPTX, HTML</p>
                <p><span className="font-semibold text-gray-600">Chế độ:</span> Offline — xử lý cục bộ</p>
              </div>

              <div className="border-t border-gray-200 pt-2">
                <p className="text-[10px] font-semibold text-gray-500">Nhà phát triển</p>
                <p className="font-bold text-blue-700 text-[11px]">DHSystem</p>
                <p className="text-[10px] text-gray-400">© 2026 DHSystem. All rights reserved.</p>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default Sidebar;

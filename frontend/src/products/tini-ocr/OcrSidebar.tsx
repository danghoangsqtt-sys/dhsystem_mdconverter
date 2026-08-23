import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  FileText,
  FolderOpen,
  Images,
  X,
} from 'lucide-react';
import { productStorageKey } from '../../shared/product';
import type { ImageOcrPreset } from '../../services/api';
import type { ImageItem, Stage } from './TiniOcrApp';

const MIN_WIDTH = 200;
const MAX_WIDTH = 420;
const DEFAULT_WIDTH = 256;
const COLLAPSED_WIDTH = 56;
const WIDTH_STORAGE_KEY = productStorageKey('tini-ocr', 'sidebar-width');
const COLLAPSED_STORAGE_KEY = productStorageKey('tini-ocr', 'sidebar-collapsed');

const ACCEPTED_IMAGE_TYPES = 'image/jpeg,image/png';

const DIRECTORY_INPUT_PROPS = {
  webkitdirectory: '',
  directory: '',
} as React.InputHTMLAttributes<HTMLInputElement>;

const PRESET_OPTIONS: { value: ImageOcrPreset; label: string; hint: string }[] = [
  { value: 'original', label: 'Giữ nguyên', hint: 'Không chỉnh sửa ảnh trước khi nhận dạng' },
  { value: 'balanced', label: 'Cân bằng', hint: 'Sửa phối cảnh, xoay thẳng và làm rõ chữ mờ' },
  { value: 'high_contrast', label: 'Tương phản cao', hint: 'Phù hợp ảnh mờ, thiếu sáng hoặc ám vàng' },
];

function formatFileSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface OcrSidebarProps {
  images: ImageItem[];
  totalSize: number;
  stage: Stage;
  isBackendReady: boolean;
  preset: ImageOcrPreset;
  onPresetChange: (preset: ImageOcrPreset) => void;
  onFilesSelected: (files: FileList | null) => void;
  onMoveImage: (index: number, direction: -1 | 1) => void;
  onRemoveImage: (id: string) => void;
}

export default function OcrSidebar({
  images,
  totalSize,
  stage,
  isBackendReady,
  preset,
  onPresetChange,
  onFilesSelected,
  onMoveImage,
  onRemoveImage,
}: OcrSidebarProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const [width, setWidth] = useState<number>(() => {
    const stored = Number(localStorage.getItem(WIDTH_STORAGE_KEY));
    return stored >= MIN_WIDTH && stored <= MAX_WIDTH ? stored : DEFAULT_WIDTH;
  });
  const [collapsed, setCollapsed] = useState<boolean>(
    () => localStorage.getItem(COLLAPSED_STORAGE_KEY) === 'true'
  );
  const [isDragging, setIsDragging] = useState(false);
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
    setIsDragging(true);
    const startX = e.clientX;
    const startWidth = width;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!isDraggingRef.current) return;
      const next = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidth + (moveEvent.clientX - startX)));
      setWidth(next);
    };
    const handleMouseUp = () => {
      isDraggingRef.current = false;
      setIsDragging(false);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  }, [width]);

  const handleFileInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    onFilesSelected(event.target.files);
    event.target.value = '';
  };

  const isRecognizing = stage === 'recognizing';
  // Reordering/removing images or switching presets after recognition has
  // started would desync images[i] from the already-fetched pages[i] (the
  // review cards match them up by index) — lock the list once idle ends.
  const listLocked = stage !== 'idle';

  return (
    <div
      className="relative bg-[#fbfbfa] border-r border-[#e5e7eb] h-full flex flex-col flex-shrink-0 z-20"
      style={{
        width: collapsed ? COLLAPSED_WIDTH : width,
        transition: isDragging ? 'none' : 'width 150ms ease',
      }}
    >
      {!collapsed && (
        <div
          onMouseDown={handleResizeStart}
          title="Kéo để thay đổi kích thước"
          className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-blue-400/40 active:bg-blue-500/50 z-20"
        />
      )}

      <button
        onClick={() => setCollapsed((c) => !c)}
        title={collapsed ? 'Mở rộng thanh bên' : 'Thu gọn thanh bên'}
        className="absolute -right-3 top-4 z-30 w-6 h-6 rounded-full bg-white border border-gray-200 shadow-sm flex items-center justify-center text-gray-500 hover:text-gray-800 hover:bg-gray-50 transition-colors"
      >
        {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
      </button>

      {collapsed ? (
        <div className="flex-1 flex flex-col items-center pt-4 gap-3">
          <div className="w-8 h-8 bg-blue-600 rounded-md flex items-center justify-center flex-shrink-0">
            <span className="text-white font-bold text-[10px]">DH</span>
          </div>
          <span
            className={`w-2 h-2 rounded-full flex-shrink-0 ${
              isBackendReady ? 'bg-blue-500' : 'bg-amber-500 animate-pulse'
            }`}
            title={isBackendReady ? 'Máy chủ sẵn sàng' : 'Đang khởi động máy chủ...'}
          />
        </div>
      ) : (
        <>
          <div className="p-4 border-b border-transparent">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isRecognizing}
              title={isRecognizing ? 'Không thể đổi ảnh khi đang nhận dạng' : undefined}
              className={`w-full min-w-0 flex items-center justify-center space-x-2 py-2 px-3 rounded-md border transition-all shadow-sm group
                ${isRecognizing
                  ? 'border-gray-200 bg-gray-50 text-gray-400 cursor-not-allowed'
                  : 'border-[#e5e7eb] bg-white text-gray-800 hover:bg-gray-50'
                }
              `}
            >
              <Images size={20} className="group-hover:scale-110 transition-transform flex-shrink-0" />
              <span className="min-w-0 truncate whitespace-nowrap font-semibold">Chọn ảnh</span>
            </button>

            <button
              type="button"
              onClick={() => folderInputRef.current?.click()}
              disabled={isRecognizing}
              title={isRecognizing ? 'Không thể đổi ảnh khi đang nhận dạng' : 'Chọn một thư mục ảnh'}
              className={`w-full min-w-0 mt-2 flex items-center justify-center gap-2 py-1.5 px-3 rounded-md border text-xs font-semibold transition-colors
                ${isRecognizing
                  ? 'border-gray-200 bg-gray-50 text-gray-400 cursor-not-allowed'
                  : 'border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100'
                }
              `}
            >
              <FolderOpen size={16} className="flex-shrink-0" />
              <span className="min-w-0 truncate whitespace-nowrap">Chọn cả thư mục</span>
            </button>

            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED_IMAGE_TYPES}
              multiple
              onChange={handleFileInputChange}
              className="hidden"
            />
            <input
              ref={folderInputRef}
              type="file"
              accept={ACCEPTED_IMAGE_TYPES}
              multiple
              onChange={handleFileInputChange}
              className="hidden"
              {...DIRECTORY_INPUT_PROPS}
            />

            {isBackendReady ? (
              <div className="flex items-center justify-center mt-3 space-x-1.5 text-xs text-gray-500">
                <span className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0" />
                <span>Máy chủ: <span className="font-semibold text-blue-700">Sẵn sàng</span></span>
              </div>
            ) : (
              <div className="flex items-center justify-center mt-3 space-x-1.5 text-xs text-gray-500">
                <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse flex-shrink-0" />
                <span>Đang khởi động máy chủ...</span>
              </div>
            )}
          </div>

          <div className="px-2 pt-2 flex-shrink-0">
            <div className="px-2 py-1 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
              Chế độ xử lý ảnh
            </div>
            <fieldset disabled={listLocked} className="px-2 pb-2 space-y-1.5">
              {PRESET_OPTIONS.map(option => (
                <label
                  key={option.value}
                  className={`flex flex-col gap-0.5 px-2.5 py-1.5 rounded-md border transition-colors
                    ${preset === option.value ? 'border-blue-200 bg-blue-50' : 'border-gray-200 bg-white hover:bg-gray-50'}
                    ${listLocked ? 'cursor-not-allowed opacity-55' : 'cursor-pointer'}
                  `}
                >
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-gray-800">
                    <input
                      type="radio"
                      name="ocr-preset"
                      value={option.value}
                      checked={preset === option.value}
                      onChange={() => onPresetChange(option.value)}
                      className="sr-only"
                    />
                    {option.label}
                  </span>
                  <span className="text-[10px] text-gray-500 leading-tight">{option.hint}</span>
                </label>
              ))}
            </fieldset>
          </div>

          <div className="flex-1 overflow-y-auto py-2 px-2 space-y-0.5 mt-1 border-t border-gray-100">
            <div className="px-2 py-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wider flex items-center justify-between">
              <span className="flex items-center gap-1.5"><Images size={12} /> Ảnh đã chọn</span>
              {images.length > 0 && (
                <span className="text-[10px] text-gray-400 normal-case font-normal">{formatFileSize(totalSize)}</span>
              )}
            </div>
            {images.length === 0 ? (
              <p className="px-2 text-xs text-gray-400">Chưa có ảnh nào được chọn.</p>
            ) : (
              <ol aria-label="Ảnh đã chọn">
                {images.map((image, index) => (
                  <li
                    key={image.id}
                    className="group flex items-center gap-1.5 px-2 py-1.5 rounded-md hover:bg-gray-100"
                  >
                    <span className="w-5 h-5 rounded bg-blue-50 text-blue-700 text-[10px] font-semibold flex items-center justify-center flex-shrink-0">
                      {index + 1}
                    </span>
                    <FileText size={14} className="text-gray-400 flex-shrink-0" aria-hidden="true" />
                    <span className="flex-1 min-w-0 text-xs text-gray-700 truncate" title={image.name}>
                      {image.name}
                    </span>
                    <span className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                      <button
                        type="button"
                        disabled={listLocked || index === 0}
                        onClick={() => onMoveImage(index, -1)}
                        aria-label={`Đưa ${image.name} lên trước`}
                        className="p-0.5 text-gray-300 hover:text-gray-600 disabled:opacity-40 disabled:hover:text-gray-300"
                      >
                        <ArrowUp size={12} />
                      </button>
                      <button
                        type="button"
                        disabled={listLocked || index === images.length - 1}
                        onClick={() => onMoveImage(index, 1)}
                        aria-label={`Đưa ${image.name} xuống sau`}
                        className="p-0.5 text-gray-300 hover:text-gray-600 disabled:opacity-40 disabled:hover:text-gray-300"
                      >
                        <ArrowDown size={12} />
                      </button>
                      <button
                        type="button"
                        disabled={listLocked}
                        onClick={() => onRemoveImage(image.id)}
                        aria-label={`Bỏ ${image.name}`}
                        className="p-0.5 text-gray-300 hover:text-red-500 disabled:opacity-40 disabled:hover:text-gray-300"
                      >
                        <X size={12} />
                      </button>
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </div>

          <div className="p-3 border-t border-gray-200">
            <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-lg p-3 text-xs text-gray-600 space-y-2">
              <div className="flex items-center space-x-2">
                <div className="w-7 h-7 bg-blue-600 rounded-md flex items-center justify-center flex-shrink-0">
                  <span className="text-white font-bold text-[10px]">DH</span>
                </div>
                <div>
                  <p className="font-bold text-gray-800 leading-tight">Tini OCR</p>
                  <p className="text-[10px] text-gray-400">Phiên bản 1.6.0</p>
                </div>
              </div>

              <div className="space-y-1 text-[10px] text-gray-500 border-t border-gray-200 pt-2">
                <p><span className="font-semibold text-gray-600">Engine:</span> EasyOCR (Việt–Anh)</p>
                <p><span className="font-semibold text-gray-600">Hỗ trợ:</span> Ảnh JPG, PNG</p>
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
}

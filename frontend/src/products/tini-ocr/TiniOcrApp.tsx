import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Loader2, ScanText, Upload } from 'lucide-react';
import Toast from '../../shared/components/Toast';
import type { ToastMessage } from '../../shared/types';
import { productStorageKey } from '../../shared/product';
import OcrSidebar from './OcrSidebar';
import OcrToolbar from './OcrToolbar';
import { checkBackendHealth, ConversionCancelledError } from '../../shared/api';
import {
  exportImageOcr,
  recognizeImages,
  type ImageOcrPage,
  type ImageOcrPreset,
  type OcrExportFormat,
} from './api';

export type ImageItem = {
  id: string;
  name: string;
  size: number;
  file: File;
  previewUrl: string;
};

export type Stage = 'idle' | 'recognizing' | 'reviewing';

const ACCEPTED_IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png']);
const CONFIDENCE_WARNING_THRESHOLD = 0.6;

const EXPORT_OPTIONS: { value: OcrExportFormat; label: string; extension: string }[] = [
  { value: 'docx-editable', label: 'DOCX — văn bản chỉnh sửa được', extension: '.docx' },
  { value: 'docx-faithful', label: 'DOCX — giữ nguyên ảnh gốc', extension: '.docx' },
  { value: 'markdown', label: 'Markdown (.md)', extension: '.md' },
  { value: 'txt', label: 'Văn bản thuần (.txt)', extension: '.txt' },
];

function fileExtension(name: string): string {
  const index = name.lastIndexOf('.');
  return index === -1 ? '' : name.slice(index).toLowerCase();
}

let previewSeed = 0;

function createImageItem(file: File): ImageItem {
  previewSeed += 1;
  return {
    id: `${file.name}-${file.size}-${file.lastModified}-${previewSeed}`,
    name: file.name,
    size: file.size,
    file,
    previewUrl: URL.createObjectURL(file),
  };
}

export default function TiniOcrApp() {
  const abortControllerRef = useRef<AbortController | null>(null);

  const [images, setImages] = useState<ImageItem[]>([]);
  const [preset, setPreset] = useState<ImageOcrPreset>('balanced');
  const [stage, setStage] = useState<Stage>('idle');
  const [jobProgress, setJobProgress] = useState(0);
  const [jobMessage, setJobMessage] = useState('');
  const [pages, setPages] = useState<ImageOcrPage[]>([]);
  const [exportFormat, setExportFormat] = useState<OcrExportFormat>('docx-editable');
  const [isExporting, setIsExporting] = useState(false);
  const [isBackendReady, setIsBackendReady] = useState(false);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const addToast = useCallback((type: ToastMessage['type'], message: string) => {
    setToasts(prev => [...prev, { id: Date.now(), type, message }]);
  }, []);

  const removeToast = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  // Tini Core (torch/EasyOCR/Docling) can take well over a minute to warm up
  // on first launch — poll until ready instead of letting a click surface a
  // raw connection error, mirroring Mark Tini's own startup gate in App.tsx.
  useEffect(() => {
    let cancelled = false;
    let timerId: ReturnType<typeof setTimeout>;
    const poll = async () => {
      const ready = await checkBackendHealth()
        .then(health => health.status === 'ready')
        .catch(() => false);
      if (!cancelled) {
        setIsBackendReady(ready);
        timerId = setTimeout(poll, ready ? 15000 : 1200);
      }
    };
    poll();
    return () => {
      cancelled = true;
      clearTimeout(timerId);
    };
  }, []);

  const totalSize = useMemo(
    () => images.reduce((total, image) => total + image.size, 0),
    [images],
  );

  // Object URLs are only released when the list they belong to is replaced
  // or the product window closes — reviewing keeps referencing the same
  // previews the whole time, so revoking on every render would break them.
  useEffect(() => () => {
    images.forEach(image => URL.revokeObjectURL(image.previewUrl));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const replaceImages = useCallback((nextFiles: File[]) => {
    const accepted = nextFiles.filter(file => ACCEPTED_IMAGE_EXTENSIONS.has(fileExtension(file.name)));
    if (accepted.length === 0) {
      addToast('error', 'Chỉ hỗ trợ ảnh JPG hoặc PNG.');
      return;
    }
    setImages(prev => {
      prev.forEach(image => URL.revokeObjectURL(image.previewUrl));
      return accepted.map(createImageItem);
    });
    setStage('idle');
    setPages([]);
    localStorage.setItem(productStorageKey('tini-ocr', 'last-import-count'), String(accepted.length));
  }, [addToast]);

  const handleFiles = useCallback((files: FileList | null) => {
    if (!files || files.length === 0) return;
    replaceImages(Array.from(files));
  }, [replaceImages]);

  const moveImage = useCallback((index: number, direction: -1 | 1) => {
    setImages(prev => {
      const target = index + direction;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }, []);

  const removeImage = useCallback((id: string) => {
    setImages(prev => {
      const removed = prev.find(image => image.id === id);
      if (removed) URL.revokeObjectURL(removed.previewUrl);
      return prev.filter(image => image.id !== id);
    });
  }, []);

  const handleStartRecognition = useCallback(async () => {
    if (images.length === 0) return;
    const controller = new AbortController();
    abortControllerRef.current = controller;
    setStage('recognizing');
    setJobProgress(0);
    setJobMessage('Đang chuẩn bị ảnh...');
    try {
      const result = await recognizeImages(
        images.map(image => image.file),
        {
          preset,
          signal: controller.signal,
          onJobStatus: job => {
            setJobProgress(job.progress);
            setJobMessage(job.message);
          },
        },
      );
      setPages(result.pages);
      setStage('reviewing');
    } catch (err: unknown) {
      setStage('idle');
      if (err instanceof ConversionCancelledError) {
        addToast('info', 'Đã hủy nhận dạng.');
      } else {
        addToast('error', err instanceof Error ? err.message : 'Nhận dạng ảnh thất bại.');
      }
    } finally {
      abortControllerRef.current = null;
    }
  }, [images, preset, addToast]);

  const handleCancelRecognition = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  const updatePageText = useCallback((index: number, text: string) => {
    setPages(prev => prev.map((page, i) => (i === index ? { ...page, text } : page)));
  }, []);

  const handleStartOver = useCallback(() => {
    images.forEach(image => URL.revokeObjectURL(image.previewUrl));
    setImages([]);
    setPages([]);
    setStage('idle');
    setJobProgress(0);
    setJobMessage('');
  }, [images]);

  const handleExport = useCallback(async () => {
    if (pages.length === 0) return;
    setIsExporting(true);
    try {
      const option = EXPORT_OPTIONS.find(item => item.value === exportFormat);
      const extension = option?.extension ?? '.txt';
      const blob = await exportImageOcr(
        images.map(image => image.file),
        pages.map(page => ({ filename: page.filename, text: page.text })),
        exportFormat,
      );
      const fileName = `tini-ocr-ket-qua${extension}`;
      if (window.documark?.saveExportFile) {
        const result = await window.documark.saveExportFile(fileName, new Uint8Array(await blob.arrayBuffer()));
        if (result.status === 'cancelled') {
          addToast('info', 'Đã hủy lưu file.');
        } else {
          addToast('info', `Đã lưu: ${result.filePath}`);
        }
      } else {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
    } catch (err: unknown) {
      addToast('error', err instanceof Error ? err.message : 'Không thể xuất kết quả OCR.');
    } finally {
      setIsExporting(false);
    }
  }, [images, pages, exportFormat, addToast]);

  return (
    <div className="flex h-screen w-screen bg-neutral-100 overflow-hidden font-sans" data-testid="tini-ocr-shell">
      <OcrSidebar
        images={images}
        totalSize={totalSize}
        stage={stage}
        isBackendReady={isBackendReady}
        preset={preset}
        onPresetChange={setPreset}
        onFilesSelected={handleFiles}
        onMoveImage={moveImage}
        onRemoveImage={removeImage}
      />

      <div className="min-w-0 flex-1 flex flex-col h-full overflow-hidden relative">
        <OcrToolbar
          stage={stage}
          imageCount={images.length}
          isBackendReady={isBackendReady}
          onStartRecognition={handleStartRecognition}
          exportFormat={exportFormat}
          onExportFormatChange={setExportFormat}
          exportOptions={EXPORT_OPTIONS}
          onExport={handleExport}
          isExporting={isExporting}
          onStartOver={handleStartOver}
        />

        <div className="flex-1 overflow-y-auto relative bg-neutral-100 p-4">
          {stage === 'idle' && images.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-center gap-3">
              <div className="w-14 h-14 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center">
                <Upload size={26} />
              </div>
              <h2 className="text-sm font-semibold text-gray-700">Chưa có ảnh nào</h2>
              <p className="text-xs text-gray-500 max-w-xs">
                Chọn ảnh JPG hoặc PNG từ thanh bên để bắt đầu nhận dạng văn bản.
              </p>
            </div>
          )}

          {stage === 'idle' && images.length > 0 && (
            <div className="h-full flex flex-col items-center justify-center text-center gap-3">
              <div className="w-14 h-14 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center">
                <ScanText size={26} />
              </div>
              <h2 className="text-sm font-semibold text-gray-700">{images.length} ảnh đã sẵn sàng</h2>
              <p className="text-xs text-gray-500 max-w-xs">
                Bấm "Bắt đầu nhận dạng" ở góc trên bên phải để tiếp tục.
              </p>
            </div>
          )}

          {stage === 'recognizing' && (
            <div className="h-full flex items-center justify-center">
              <div
                role="status"
                className="w-full max-w-sm p-5 flex flex-col items-center gap-3 bg-white border border-gray-200 rounded-lg shadow-sm"
              >
                <Loader2 size={22} className="animate-spin text-blue-600" />
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-blue-600 rounded-full h-2 transition-all duration-300"
                    style={{ width: `${jobProgress}%` }}
                  />
                </div>
                <p className="text-xs text-gray-600">{jobMessage} ({jobProgress}%)</p>
                <button
                  type="button"
                  onClick={handleCancelRecognition}
                  className="px-3 py-1.5 rounded-md text-[13px] font-medium transition-colors border bg-white hover:bg-gray-50 text-gray-700 border-gray-200 shadow-sm"
                >
                  Hủy nhận dạng
                </button>
              </div>
            </div>
          )}

          {stage === 'reviewing' && (
            <ol className="flex flex-col gap-4 max-w-5xl mx-auto">
              {pages.map((page, index) => {
                const canOverlay = !page.recipe.includes('perspective-correction');
                const previewUrl = images[index]?.previewUrl;
                const isLowConfidence = page.confidence < CONFIDENCE_WARNING_THRESHOLD;
                return (
                  <li
                    key={`${page.filename}-${index}`}
                    className="grid grid-cols-[280px_1fr] gap-4 p-4 bg-white border border-gray-200 rounded-lg shadow-sm"
                  >
                    <div
                      className="relative w-full overflow-hidden bg-gray-100 rounded-md"
                      style={{ aspectRatio: `${page.width} / ${page.height}` }}
                    >
                      {previewUrl && (
                        <img src={previewUrl} alt="" className="absolute inset-0 w-full h-full object-contain" />
                      )}
                      {canOverlay && (
                        <svg
                          className="ocr-page-overlay absolute inset-0 w-full h-full"
                          viewBox={`0 0 ${page.width} ${page.height}`}
                          preserveAspectRatio="none"
                          aria-hidden="true"
                        >
                          {page.lines.map((line, lineIndex) => {
                            const xs = line.box.map(point => point[0]);
                            const ys = line.box.map(point => point[1]);
                            const x = Math.min(...xs);
                            const y = Math.min(...ys);
                            const width = Math.max(...xs) - x;
                            const height = Math.max(...ys) - y;
                            const warn = line.confidence < CONFIDENCE_WARNING_THRESHOLD;
                            return (
                              <rect
                                key={lineIndex}
                                x={x}
                                y={y}
                                width={width}
                                height={height}
                                className={warn ? 'fill-amber-600/15 stroke-amber-600' : 'fill-blue-600/10 stroke-blue-600'}
                                strokeWidth={2}
                              />
                            );
                          })}
                        </svg>
                      )}
                    </div>

                    <div className="min-w-0 flex flex-col gap-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="min-w-0 truncate text-sm font-semibold text-gray-800" title={page.filename}>
                          {page.filename}
                        </span>
                        {!page.error && (
                          <span
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${
                              isLowConfidence ? 'bg-amber-50 text-amber-700' : 'bg-green-50 text-green-700'
                            }`}
                          >
                            {isLowConfidence && <AlertTriangle size={12} />}
                            Độ tin cậy {Math.round(page.confidence * 100)}%
                          </span>
                        )}
                      </div>

                      {!canOverlay && !page.error && (
                        <ul className="flex flex-wrap gap-1" aria-label={`Độ tin cậy từng dòng của ${page.filename}`}>
                          {page.lines.map((line, lineIndex) => (
                            <li
                              key={lineIndex}
                              className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                                line.confidence < CONFIDENCE_WARNING_THRESHOLD
                                  ? 'bg-amber-50 text-amber-700'
                                  : 'bg-blue-50 text-blue-700'
                              }`}
                            >
                              {Math.round(line.confidence * 100)}%
                            </li>
                          ))}
                        </ul>
                      )}

                      {page.error ? (
                        <p
                          role="alert"
                          className="flex items-center gap-1.5 px-2.5 py-2 rounded-md bg-red-50 border border-red-100 text-red-700 text-xs"
                        >
                          <AlertTriangle size={14} /> Lỗi nhận dạng: {page.error}
                        </p>
                      ) : (
                        <textarea
                          value={page.text}
                          onChange={event => updatePageText(index, event.target.value)}
                          rows={8}
                          aria-label={`Văn bản đã nhận dạng cho ${page.filename}`}
                          className="flex-1 min-h-[160px] p-3 text-sm leading-relaxed bg-gray-50 border border-gray-200 rounded-md resize-y focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
                        />
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </div>

      <Toast toasts={toasts} removeToast={removeToast} />
    </div>
  );
}

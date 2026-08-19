import React, { useState, useRef, type MouseEvent } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import type { PageCallback } from 'react-pdf/dist/shared/types.js';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import { ChevronLeft, ChevronRight, ScanText, Trash2, Loader2, Layers } from 'lucide-react';

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

interface BoundingBox {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  page: number;
}

interface PdfViewerBoxProps {
  file: File | null;
  /**
   * Called with the cropped region images (as PNG blobs) for every box drawn
   * on the page currently being viewed. The caller owns turning those into
   * markdown (upload + OCR) and inserting the result into the document —
   * this component only knows how to crop pixels, not what to do with text.
   * Boxes are cleared once the returned promise resolves; they're kept on
   * rejection so the user can retry.
   */
  onExtractRegions?: (images: Blob[]) => Promise<void>;
}

export const PdfViewerBox: React.FC<PdfViewerBoxProps> = ({ file, onExtractRegions }) => {
  const [numPages, setNumPages] = useState<number | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [scale, setScale] = useState(1.0);

  const [boxes, setBoxes] = useState<BoundingBox[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPos, setStartPos] = useState({ x: 0, y: 0 });
  const [currentBox, setCurrentBox] = useState<{x: number, y: number, w: number, h: number} | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractAllProgress, setExtractAllProgress] = useState<{ current: number; total: number } | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);

  // Tracks which page is actually painted on the canvas right now, and lets
  // async code await a specific page becoming current. A ref (not state) so
  // the extract-all loop below always reads the live value instead of the
  // stale closure a re-rendered `pageNumber` would give it mid-loop.
  const renderedPageRef = useRef<number>(1);
  const pageRenderResolversRef = useRef<Map<number, () => void>>(new Map());

  const handlePageRenderSuccess = (page: PageCallback) => {
    renderedPageRef.current = page.pageNumber;
    const resolve = pageRenderResolversRef.current.get(page.pageNumber);
    if (resolve) {
      pageRenderResolversRef.current.delete(page.pageNumber);
      resolve();
    }
  };

  const waitForPageRender = (targetPage: number): Promise<void> => {
    if (renderedPageRef.current === targetPage) return Promise.resolve();
    return new Promise((resolve) => {
      pageRenderResolversRef.current.set(targetPage, resolve);
      setPageNumber(targetPage);
    });
  };

  const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
    setPageNumber(1);
    setBoxes([]);
  };

  const handleMouseDown = (e: MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return; // Only left click
    if (isExtracting) return; // Don't let drawing interfere with the extract-all page walk
    if (!containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    setIsDrawing(true);
    setStartPos({ x, y });
    setCurrentBox({ x, y, w: 0, h: 0 });
  };

  const handleMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    if (!isDrawing || !containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const currentX = e.clientX - rect.left;
    const currentY = e.clientY - rect.top;

    const x = Math.min(startPos.x, currentX);
    const y = Math.min(startPos.y, currentY);
    const w = Math.abs(currentX - startPos.x);
    const h = Math.abs(currentY - startPos.y);

    setCurrentBox({ x, y, w, h });
  };

  const handleMouseUp = () => {
    if (!isDrawing) return;
    setIsDrawing(false);

    if (currentBox && currentBox.w > 10 && currentBox.h > 10) {
      const newBox: BoundingBox = {
        id: Date.now().toString(),
        x: currentBox.x / scale,
        y: currentBox.y / scale,
        width: currentBox.w / scale,
        height: currentBox.h / scale,
        page: pageNumber
      };
      setBoxes(prev => [...prev, newBox]);
    }
    setCurrentBox(null);
  };

  // Crops one box out of the currently-rendered page canvas. Uses the
  // canvas's actual pixel buffer size (not its CSS size) so this stays
  // correct under devicePixelRatio scaling (e.g. Windows display scaling).
  const cropBoxToBlob = (box: BoundingBox): Promise<Blob | null> => {
    return new Promise((resolve) => {
      const canvas = containerRef.current?.querySelector('canvas');
      if (!canvas) {
        resolve(null);
        return;
      }
      const canvasRect = canvas.getBoundingClientRect();
      const pixelRatioX = canvas.width / canvasRect.width;
      const pixelRatioY = canvas.height / canvasRect.height;

      const cropWidth = Math.max(1, Math.round(box.width * scale * pixelRatioX));
      const cropHeight = Math.max(1, Math.round(box.height * scale * pixelRatioY));

      const cropCanvas = document.createElement('canvas');
      cropCanvas.width = cropWidth;
      cropCanvas.height = cropHeight;
      const ctx = cropCanvas.getContext('2d');
      if (!ctx) {
        resolve(null);
        return;
      }
      ctx.drawImage(
        canvas,
        box.x * scale * pixelRatioX, box.y * scale * pixelRatioY,
        cropWidth, cropHeight,
        0, 0,
        cropWidth, cropHeight
      );
      cropCanvas.toBlob((blob) => resolve(blob), 'image/png');
    });
  };

  const currentPageBoxes = boxes.filter(b => b.page === pageNumber);
  const pagesWithBoxes = Array.from(new Set(boxes.map(b => b.page))).sort((a, b) => a - b);

  const handleExtract = async () => {
    if (currentPageBoxes.length === 0 || !onExtractRegions || isExtracting) return;
    setIsExtracting(true);
    try {
      const blobs = await Promise.all(currentPageBoxes.map(cropBoxToBlob));
      const validBlobs = blobs.filter((b): b is Blob => b !== null);
      await onExtractRegions(validBlobs);
      // Only the boxes that were just sent for extraction are cleared — kept
      // on failure so the user doesn't lose their selection and can retry.
      setBoxes(prev => prev.filter(b => b.page !== pageNumber));
    } catch {
      // Caller is responsible for surfacing the error (e.g. a toast).
    } finally {
      setIsExtracting(false);
    }
  };

  // Walks every page that has a drawn box, one at a time (only one page can
  // be rasterized to the canvas at once), cropping as it goes, then restores
  // whatever page the user was originally looking at.
  const handleExtractAll = async () => {
    if (pagesWithBoxes.length < 2 || !onExtractRegions || isExtracting) return;
    setIsExtracting(true);
    const originalPage = pageNumber;
    try {
      const allBlobs: Blob[] = [];
      for (let i = 0; i < pagesWithBoxes.length; i++) {
        const page = pagesWithBoxes[i];
        setExtractAllProgress({ current: i + 1, total: pagesWithBoxes.length });
        await waitForPageRender(page);
        const pageBoxes = boxes.filter(b => b.page === page);
        const blobs = await Promise.all(pageBoxes.map(cropBoxToBlob));
        allBlobs.push(...blobs.filter((b): b is Blob => b !== null));
      }
      await onExtractRegions(allBlobs);
      setBoxes([]);
    } catch {
      // Caller is responsible for surfacing the error (e.g. a toast).
    } finally {
      setExtractAllProgress(null);
      await waitForPageRender(originalPage);
      setIsExtracting(false);
    }
  };

  if (!file) {
    return (
      <div className="h-full flex items-center justify-center border border-gray-200 bg-gray-50 text-gray-400 text-sm rounded-lg">
        Chưa có file PDF để xem
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-white border border-gray-200 rounded-lg overflow-hidden shadow-sm">
      {/* Toolbar */}
      <div className="flex items-center justify-between p-3 border-b border-gray-100 bg-white">
        <div className="flex items-center gap-4">
          <span className="text-gray-800 text-sm font-semibold">Tài liệu gốc</span>
          <div className="flex items-center gap-2">
            <button
              disabled={pageNumber <= 1 || isExtracting}
              onClick={() => setPageNumber(p => p - 1)}
              className="text-gray-400 hover:text-gray-700 disabled:opacity-30 transition-colors"
            >
              <ChevronLeft size={18} />
            </button>
            <span className="text-xs text-gray-500 font-medium">
              {extractAllProgress
                ? `Đang quét trang ${extractAllProgress.current}/${extractAllProgress.total}...`
                : `Trang ${pageNumber} / ${numPages || '?'}`}
            </span>
            <button
              disabled={numPages === null || pageNumber >= numPages || isExtracting}
              onClick={() => setPageNumber(p => p + 1)}
              className="text-gray-400 hover:text-gray-700 disabled:opacity-30 transition-colors"
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>

        <div className="flex gap-2 items-center">
          <button
            disabled={isExtracting}
            onClick={() => setScale(s => Math.max(0.5, s - 0.2))}
            className="text-xs font-medium text-gray-600 hover:bg-gray-100 rounded px-2 py-1 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            −
          </button>
          <span className="text-xs text-gray-500 font-medium w-10 text-center">{Math.round(scale * 100)}%</span>
          <button
            disabled={isExtracting}
            onClick={() => setScale(s => Math.min(2.0, s + 0.2))}
            className="text-xs font-medium text-gray-600 hover:bg-gray-100 rounded px-2 py-1 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            +
          </button>
        </div>
      </div>

      {/* PDF Viewport */}
      <div className="flex-1 overflow-auto relative flex justify-center bg-gray-50 p-4 cursor-crosshair">
        <div
          ref={containerRef}
          className="relative shadow-md rounded-sm overflow-hidden h-fit"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          <Document
            file={file}
            onLoadSuccess={onDocumentLoadSuccess}
            loading={<div className="text-gray-400 p-10 animate-pulse text-sm">Đang tải PDF...</div>}
          >
            <Page
              pageNumber={pageNumber}
              scale={scale}
              renderTextLayer={false}
              renderAnnotationLayer={false}
              className="bg-white"
              onRenderSuccess={handlePageRenderSuccess}
            />
          </Document>

          {/* Render existing boxes for current page */}
          {currentPageBoxes.map(box => (
            <div
              key={box.id}
              className="absolute border-2 border-blue-500 bg-blue-500/10 pointer-events-none rounded-[2px]"
              style={{
                left: box.x * scale,
                top: box.y * scale,
                width: box.width * scale,
                height: box.height * scale,
              }}
            />
          ))}

          {/* Render current drawing box */}
          {currentBox && (
            <div
              className="absolute border-2 border-dashed border-blue-400 bg-blue-400/10 pointer-events-none rounded-[2px]"
              style={{
                left: currentBox.x,
                top: currentBox.y,
                width: currentBox.w,
                height: currentBox.h,
              }}
            />
          )}
        </div>
      </div>

      {/* Action Footer */}
      <div className="p-3 border-t border-gray-100 bg-white flex items-center justify-between">
        <div className="text-xs text-gray-500">
          Vùng đã chọn: <span className="text-gray-800 font-semibold">{boxes.length}</span>
          {pagesWithBoxes.length > 1 && (
            <span className="text-gray-400"> ({pagesWithBoxes.length} trang)</span>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setBoxes([])}
            disabled={boxes.length === 0 || isExtracting}
            className="flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-gray-700 disabled:opacity-30 disabled:cursor-not-allowed px-2 py-1.5 transition-colors"
          >
            <Trash2 size={13} /> Xóa vùng chọn
          </button>
          {pagesWithBoxes.length > 1 && (
            <button
              disabled={isExtracting}
              onClick={handleExtractAll}
              title="Trích xuất tất cả các vùng đã chọn trên mọi trang"
              className="flex items-center gap-1.5 bg-white hover:bg-blue-50 disabled:bg-gray-100 disabled:text-gray-400 text-blue-700 border border-blue-200 text-xs font-medium px-3 py-1.5 rounded-md transition-colors"
            >
              {extractAllProgress ? <Loader2 size={13} className="animate-spin" /> : <Layers size={13} />}
              {extractAllProgress ? `Đang xử lý ${extractAllProgress.current}/${extractAllProgress.total}...` : `Trích xuất tất cả (${boxes.length}, ${pagesWithBoxes.length} trang)`}
            </button>
          )}
          <button
            disabled={currentPageBoxes.length === 0 || isExtracting}
            onClick={handleExtract}
            className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-200 disabled:text-gray-400 text-white text-xs font-medium px-3 py-1.5 rounded-md transition-colors"
          >
            {isExtracting && !extractAllProgress ? <Loader2 size={13} className="animate-spin" /> : <ScanText size={13} />}
            {isExtracting && !extractAllProgress ? 'Đang trích xuất...' : `Trích xuất trang này (${currentPageBoxes.length})`}
          </button>
        </div>
      </div>
    </div>
  );
};

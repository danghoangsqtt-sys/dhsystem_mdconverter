import React, { useState, useRef, useEffect, MouseEvent } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import { TerminalButton } from './TerminalButton';
import { ChevronLeft, ChevronRight, Minimize, Target } from 'lucide-react';

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
  onBoxCreated?: (box: BoundingBox) => void;
  onExtractMinerU?: (boxes: BoundingBox[]) => void;
}

export const PdfViewerBox: React.FC<PdfViewerBoxProps> = ({ file, onBoxCreated, onExtractMinerU }) => {
  const [numPages, setNumPages] = useState<number | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [scale, setScale] = useState(1.0);
  
  const [boxes, setBoxes] = useState<BoundingBox[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPos, setStartPos] = useState({ x: 0, y: 0 });
  const [currentBox, setCurrentBox] = useState<{x: number, y: number, w: number, h: number} | null>(null);
  
  const containerRef = useRef<HTMLDivElement>(null);

  const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
    setPageNumber(1);
    setBoxes([]);
  };

  const handleMouseDown = (e: MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return; // Only left click
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
      setBoxes([...boxes, newBox]);
      if (onBoxCreated) onBoxCreated(newBox);
    }
    setCurrentBox(null);
  };

  if (!file) {
    return (
      <div className="h-full flex items-center justify-center border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-muted)] rounded-[var(--radius-md)]">
        SELECT A PDF FILE TO PREVIEW
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-md)] overflow-hidden shadow-subtle">
      {/* Toolbar */}
      <div className="flex items-center justify-between p-3 border-b border-[var(--color-border)] bg-[var(--color-bg)]">
        <div className="flex items-center gap-4">
          <span className="text-[var(--color-primary)] text-sm font-bold uppercase font-['Urbanist'] tracking-wide">PDF Scanner</span>
          <div className="flex items-center gap-2">
            <button 
              disabled={pageNumber <= 1}
              onClick={() => setPageNumber(p => p - 1)}
              className="text-[var(--color-tertiary)] hover:text-[var(--color-primary)] disabled:opacity-30 transition-colors"
            >
              <ChevronLeft size={18} />
            </button>
            <span className="text-xs text-[var(--color-text-muted)] font-semibold">PAGE {pageNumber} / {numPages || '?'}</span>
            <button 
              disabled={numPages === null || pageNumber >= numPages}
              onClick={() => setPageNumber(p => p + 1)}
              className="text-[var(--color-tertiary)] hover:text-[var(--color-primary)] disabled:opacity-30 transition-colors"
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
        
        <div className="flex gap-2 items-center">
          <TerminalButton size="sm" variant="secondary" onClick={() => setScale(s => Math.max(0.5, s - 0.2))}>-</TerminalButton>
          <span className="text-xs text-[var(--color-text-muted)] font-semibold flex items-center w-12 justify-center">{Math.round(scale * 100)}%</span>
          <TerminalButton size="sm" variant="secondary" onClick={() => setScale(s => Math.min(2.0, s + 0.2))}>+</TerminalButton>
        </div>
      </div>

      {/* PDF Viewport */}
      <div className="flex-1 overflow-auto relative flex justify-center bg-[var(--color-bg)] p-4 cursor-crosshair">
        <div 
          ref={containerRef}
          className="relative shadow-medium rounded-sm overflow-hidden"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          <Document
            file={file}
            onLoadSuccess={onDocumentLoadSuccess}
            loading={<div className="text-[var(--color-primary)] p-10 animate-pulse font-bold text-sm">LOADING PDF...</div>}
          >
            <Page 
              pageNumber={pageNumber} 
              scale={scale} 
              renderTextLayer={false}
              renderAnnotationLayer={false}
              className="bg-white"
            />
          </Document>

          {/* Render existing boxes for current page */}
          {boxes.filter(b => b.page === pageNumber).map(box => (
            <div 
              key={box.id}
              className="absolute border-2 border-[var(--color-primary)] bg-[var(--color-primary)]/10 flex items-start justify-end p-1 pointer-events-none rounded-[4px]"
              style={{
                left: box.x * scale,
                top: box.y * scale,
                width: box.width * scale,
                height: box.height * scale,
              }}
            >
              <span className="bg-[var(--color-primary)] text-white text-[10px] px-1.5 py-0.5 font-bold rounded-bl-[4px] rounded-tr-[2px]">MinerU</span>
            </div>
          ))}

          {/* Render current drawing box */}
          {currentBox && (
            <div 
              className="absolute border-2 border-dashed border-[var(--color-secondary)] bg-[var(--color-secondary)]/10 pointer-events-none rounded-[4px]"
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
      <div className="p-3 border-t border-[var(--color-border)] bg-[var(--color-bg)] flex items-center justify-between">
        <div className="text-xs text-[var(--color-text-muted)] font-semibold">
          ZONES MARKED: <span className="text-[var(--color-primary)] font-bold">{boxes.length}</span>
        </div>
        <div className="flex gap-2">
          <TerminalButton size="sm" variant="ghost" onClick={() => setBoxes([])}>CLEAR</TerminalButton>
          <TerminalButton 
            size="sm" 
            prefixChar=""
            disabled={boxes.length === 0}
            onClick={() => onExtractMinerU && onExtractMinerU(boxes)}
          >
            EXTRACT WITH MINER-U
          </TerminalButton>
        </div>
      </div>
    </div>
  );
};

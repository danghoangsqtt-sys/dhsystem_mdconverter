import { useMemo, useRef, useState } from 'react';
import {
  FileOutput,
  FileText,
  FolderOpen,
  Images,
  RotateCcw,
  ScanText,
  ShieldCheck,
  Sparkles,
  Upload,
} from 'lucide-react';
import { productStorageKey } from '../../shared/product';
import './tini-ocr.css';

type ImageItem = {
  id: string;
  name: string;
  size: number;
};

const ACCEPTED_IMAGE_TYPES = 'image/jpeg,image/png,image/tiff,image/bmp,image/webp';

function formatFileSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function TiniOcrApp() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [images, setImages] = useState<ImageItem[]>([]);

  const totalSize = useMemo(
    () => images.reduce((total, image) => total + image.size, 0),
    [images],
  );

  const handleFiles = (files: FileList | null) => {
    if (!files) return;
    const nextImages = Array.from(files).map((file, index) => ({
      id: `${file.name}-${file.size}-${file.lastModified}-${index}`,
      name: file.name,
      size: file.size,
    }));
    setImages(nextImages);
    localStorage.setItem(productStorageKey('tini-ocr', 'last-import-count'), String(nextImages.length));
  };

  return (
    <div className="ocr-app" data-testid="tini-ocr-shell">
      <header className="ocr-header">
        <div className="ocr-brand">
          <img className="ocr-brand-icon" src="/tini-ocr.png" alt="" aria-hidden="true" />
          <div>
            <p className="ocr-eyebrow">Tini Suite</p>
            <h1>Tini OCR</h1>
          </div>
        </div>
        <div className="ocr-local-badge"><ShieldCheck size={16} /> Xử lý hoàn toàn trên máy</div>
      </header>

      <main className="ocr-main">
        <section className="ocr-hero" aria-labelledby="ocr-heading">
          <div className="ocr-hero-copy">
            <span className="ocr-kicker"><Sparkles size={15} /> Image to Text &amp; Word</span>
            <h2 id="ocr-heading">Biến ảnh chụp tài liệu thành nội dung có thể chỉnh sửa</h2>
            <p>
              Nhập ảnh JPG, PNG hoặc nhiều trang liên tiếp. Tini OCR sẽ hiệu chỉnh ảnh,
              nhận dạng tiếng Việt–Anh và chuẩn bị văn bản trước khi xuất Word.
            </p>
          </div>

          <div className="ocr-workflow" aria-label="Quy trình xử lý">
            <div><Images size={20} /><strong>1. Chọn ảnh</strong><span>Một ảnh hoặc cả bộ trang</span></div>
            <div><RotateCcw size={20} /><strong>2. Làm rõ</strong><span>Xoay, cắt và sửa phối cảnh</span></div>
            <div><ScanText size={20} /><strong>3. Nhận dạng</strong><span>Rà soát chữ và độ tin cậy</span></div>
            <div><FileOutput size={20} /><strong>4. Xuất file</strong><span>TXT, Markdown hoặc DOCX</span></div>
          </div>
        </section>

        <section className="ocr-workspace" aria-labelledby="import-heading">
          <div className="ocr-section-heading">
            <div>
              <p className="ocr-eyebrow">Bắt đầu</p>
              <h2 id="import-heading">Chọn ảnh tài liệu</h2>
            </div>
            {images.length > 0 && (
              <span className="ocr-selection-summary">{images.length} ảnh · {formatFileSize(totalSize)}</span>
            )}
          </div>

          <input
            ref={fileInputRef}
            className="ocr-visually-hidden"
            type="file"
            accept={ACCEPTED_IMAGE_TYPES}
            multiple
            onChange={event => handleFiles(event.target.files)}
          />

          {images.length === 0 ? (
            <div className="ocr-dropzone">
              <div className="ocr-dropzone-icon" aria-hidden="true"><Upload size={30} /></div>
              <h3>Ảnh chụp từ điện thoại của bạn</h3>
              <p>Chọn JPG, PNG, TIFF, BMP hoặc WebP. Ảnh gốc sẽ không bị thay đổi.</p>
              <button className="ocr-primary-button" type="button" onClick={() => fileInputRef.current?.click()}>
                <Images size={18} /> Chọn ảnh
              </button>
              <button className="ocr-secondary-button" type="button" disabled title="Sẽ được kích hoạt cùng pipeline OCR">
                <FolderOpen size={18} /> Chọn cả thư mục
              </button>
            </div>
          ) : (
            <div className="ocr-selection">
              <ol className="ocr-file-list" aria-label="Ảnh đã chọn">
                {images.map((image, index) => (
                  <li key={image.id}>
                    <span className="ocr-file-order">{index + 1}</span>
                    <FileText size={18} aria-hidden="true" />
                    <span className="ocr-file-name">{image.name}</span>
                    <span className="ocr-file-size">{formatFileSize(image.size)}</span>
                  </li>
                ))}
              </ol>
              <div className="ocr-selection-actions">
                <button className="ocr-secondary-button" type="button" onClick={() => fileInputRef.current?.click()}>
                  <Images size={18} /> Chọn lại
                </button>
                <button className="ocr-primary-button" type="button" disabled title="Bộ máy OCR được kích hoạt ở bước triển khai tiếp theo">
                  <ScanText size={18} /> Bắt đầu nhận dạng
                </button>
              </div>
              <p className="ocr-pipeline-note" role="status">
                Giao diện Tini OCR đã sẵn sàng. Bộ máy nhận dạng offline sẽ được kích hoạt trong bước tiếp theo.
              </p>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

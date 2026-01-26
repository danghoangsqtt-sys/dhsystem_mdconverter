import * as pdfjsLib from 'pdfjs-dist';
import Tesseract from 'tesseract.js';
// Worker cho PDF.js trong Vite
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

// Helper: Chuyển trang PDF thành ảnh để OCR
const renderPageToImage = async (page: any): Promise<string> => {
  const viewport = page.getViewport({ scale: 2.0 }); // Scale 2.0 để tăng độ nét cho OCR
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');

  if (!context) return '';

  canvas.height = viewport.height;
  canvas.width = viewport.width;

  await page.render({ canvasContext: context, viewport }).promise;
  return canvas.toDataURL('image/png');
};

// Helper: Chạy OCR
const performOCR = async (imageBase64: string, onStatus?: (status: string) => void): Promise<string> => {
  try {
    const { data: { text } } = await Tesseract.recognize(imageBase64, 'vie', {
      logger: m => {
        if (onStatus && m.status === 'recognizing text') {
          onStatus(`OCR: ${(m.progress * 100).toFixed(0)}%`);
        }
      }
    });
    return text;
  } catch (error) {
    console.error("OCR Error:", error);
    return "";
  }
};

export const extractTextFromPdf = async (file: File, onProgress?: (msg: string) => void): Promise<string> => {
  try {
    const arrayBuffer = await file.arrayBuffer();
    if (onProgress) onProgress(`Đang tải file (${(file.size / 1024).toFixed(0)} KB)...`);

    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let fullText = "";

    for (let i = 1; i <= pdf.numPages; i++) {
      if (onProgress) onProgress(`Đang xử lý trang ${i}/${pdf.numPages}...`);

      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();

      // 1. Thử lấy text layer (nhanh)
      let pageText = textContent.items
        .map((item: any) => item.hasEOL ? item.str + '\n' : item.str + ' ')
        .join('');

      // 2. Nếu ít chữ quá (< 50 ký tự) -> Khả năng là file Scan -> Bật OCR
      if (pageText.trim().length < 50) {
        if (onProgress) onProgress(`Trang ${i} là ảnh quét. Đang chạy OCR...`);
        const img = await renderPageToImage(page);
        const ocrText = await performOCR(img, (s) => onProgress && onProgress(`Trang ${i} ${s}`));
        if (ocrText.trim().length > 0) pageText = ocrText;
      }

      fullText += `--- TRANG ${i} ---\n${pageText}\n\n`;
    }

    return fullText;
  } catch (error) {
    console.error("PDF Extract Error:", error);
    throw new Error("Lỗi đọc PDF. File có thể bị hỏng hoặc có mật khẩu.");
  }
};
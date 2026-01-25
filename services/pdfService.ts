import * as pdfjsLib from 'pdfjs-dist';
// Giữ nguyên import worker cho Vite
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

export const extractTextFromPdf = async (file: File, onProgress?: (msg: string) => void): Promise<string> => {
  try {
    const arrayBuffer = await file.arrayBuffer();
    if (onProgress) onProgress(`Đang tải file ${file.name} (${(file.size / 1024).toFixed(0)} KB)...`);

    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

    if (onProgress) onProgress(`Đã mở PDF. Tổng số trang: ${pdf.numPages}`);

    let fullText = "";

    for (let i = 1; i <= pdf.numPages; i++) {
      if (onProgress) onProgress(`Đang trích xuất văn bản trang ${i}/${pdf.numPages}...`);

      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();

      // SỬA ĐỔI QUAN TRỌNG: Xử lý xuống dòng (EOL)
      const pageText = textContent.items
        .map((item: any) => {
          // Kiểm tra thuộc tính hasEOL (End of Line)
          // Thêm ký tự xuống dòng nếu là cuối dòng, ngược lại thêm khoảng trắng để tránh dính chữ
          return item.hasEOL ? item.str + '\n' : item.str + ' ';
        })
        .join(''); // Join bằng chuỗi rỗng vì đã xử lý khoảng trắng ở trên

      // Basic check for scanned content
      if (pageText.trim().length < 20) {
        if (onProgress) onProgress(`Cảnh báo: Trang ${i} có rất ít văn bản, có thể là ảnh quét hoặc trang trắng.`);
      }

      fullText += `--- TRANG ${i} ---\n${pageText}\n\n`;
    }

    if (onProgress) onProgress("Hoàn tất trích xuất dữ liệu thô.");
    return fullText;
  } catch (error) {
    console.error("PDF Extraction Error:", error);
    throw new Error("Không thể đọc nội dung file PDF. File có thể bị hỏng hoặc có mật khẩu.");
  }
};
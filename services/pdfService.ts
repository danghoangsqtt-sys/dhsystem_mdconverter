import * as pdfjsLib from 'pdfjs-dist';
// Sử dụng tính năng ?url của Vite để lấy đường dẫn file worker đã được bundle
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

export const extractTextFromPdf = async (file: File, onProgress?: (msg: string) => void): Promise<string> => {
  try {
    const arrayBuffer = await file.arrayBuffer();
    if (onProgress) onProgress(`Đang tải file ${file.name} (${(file.size / 1024).toFixed(0)} KB)...`);

    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    
    if (onProgress) onProgress(`Đã mở PDF. Tổng số trang: ${pdf.numPages}`);

    let fullText = "";
    
    // Iterate over all pages
    for (let i = 1; i <= pdf.numPages; i++) {
      if (onProgress) onProgress(`Đang trích xuất văn bản trang ${i}/${pdf.numPages}...`);
      
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      
      // Combine text items, adding spaces/newlines as appropriate
      const pageText = textContent.items
        .map((item: any) => item['str'])
        .join(' ');
      
      // Basic check for scanned content
      if (pageText.length < 50) {
        if (onProgress) onProgress(`Cảnh báo: Trang ${i} có rất ít văn bản, có thể là ảnh quét.`);
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
import * as pdfjsLib from 'pdfjs-dist';

// Sử dụng tính năng ?url của Vite để lấy đường dẫn file worker đã được bundle
// Điều này sửa lỗi "Invalid URL" và đảm bảo file worker có sẵn khi đóng gói offline
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

export const extractTextFromPdf = async (file: File): Promise<string> => {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    
    let fullText = "";
    
    // Iterate over all pages
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      
      // Combine text items, adding spaces/newlines as appropriate
      const pageText = textContent.items
        .map((item: any) => item['str'])
        .join(' ');
        
      fullText += `--- TRANG ${i} ---\n${pageText}\n\n`;
    }
    
    return fullText;
  } catch (error) {
    console.error("PDF Extraction Error:", error);
    throw new Error("Không thể đọc nội dung file PDF. Vui lòng kiểm tra lại file.");
  }
};
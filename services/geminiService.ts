import { GoogleGenAI } from "@google/genai";
import { extractTextFromPdf } from './pdfService';
import { TEMPLATE_INSTRUCTION, ProcessingStage } from '../types';

export const convertPdfToMarkdownGemini = async (
  file: File, 
  apiKey: string, 
  onUpdate: (stage: ProcessingStage, message: string) => void
): Promise<string> => {
  if (!apiKey) throw new Error("Vui lòng nhập Gemini API Key trong phần Cấu hình.");

  try {
    // 1. Extract text
    onUpdate('extracting', "Bắt đầu quy trình xử lý...");
    const extractedText = await extractTextFromPdf(file, (msg) => onUpdate('extracting', msg));
    
    if (!extractedText.trim() || extractedText.length < 50) {
      throw new Error("Không tìm thấy văn bản khả dụng trong file PDF. File có thể là ảnh scan (cần OCR).");
    }
    
    onUpdate('extracting', `Đã trích xuất thành công ${extractedText.length} ký tự.`);

    // 2. Initialize Gemini
    onUpdate('uploading', "Đang khởi tạo kết nối tới Google Gemini...");
    const ai = new GoogleGenAI({ apiKey: apiKey });

    // 3. Prepare Prompt
    const prompt = `
      ĐÓNG VAI TRÒ: Bạn là một "Máy định dạng văn bản chính xác" (Precision Text Formatter).
      NHIỆM VỤ: Chuyển đổi văn bản thô từ PDF sang định dạng Markdown, tuân thủ tuyệt đối nội dung gốc.

      NGUYÊN TẮC BẤT KHẢ XÂM PHẠM (BẮT BUỘC):
      1. GIỮ NGUYÊN VẸN NỘI DUNG: Không được tóm tắt, không được cắt bỏ, không được viết lại bất kỳ câu chữ nào của văn bản gốc.
      2. CHÍNH XÁC TUYỆT ĐỐI: Giữ nguyên các số liệu, ngày tháng, tên riêng, điều khoản, số thứ tự.
      3. KHÔNG SÁNG TẠO: Không thêm lời dẫn, không thêm nhận xét, không thêm phần kết luận nếu văn bản gốc không có.
      4. CẤU TRÚC: Sử dụng Template dưới đây để định hình cấu trúc (Header, Metadata), nhưng nội dung chi tiết phải lấy từ văn bản gốc.

      TEMPLATE CẤU TRÚC (Sử dụng làm khung, điền nội dung gốc vào):
      ${TEMPLATE_INSTRUCTION}

      VĂN BẢN GỐC TỪ FILE PDF (Cần xử lý):
      ${extractedText}

      YÊU CẦU ĐẦU RA:
      - Chỉ trả về Markdown raw.
      - Không dùng code block (\`\`\`).
      - Ưu tiên sử dụng định dạng danh sách (1. , - ) cho các điều khoản để dễ đọc.
    `;

    // 4. Call API
    onUpdate('generating', "Đang gửi Context tới Gemini Flash 3.0 Preview...");
    onUpdate('generating', "AI đang phân tích cấu trúc văn bản...");
    
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
    });

    onUpdate('formatting', "Đang nhận phản hồi từ AI...");

    if (!response.text) {
        throw new Error("Gemini không trả về kết quả văn bản.");
    }
    
    onUpdate('formatting', "Đang hoàn tất định dạng Markdown...");

    return response.text;
  } catch (error: any) {
    console.error("Gemini Error:", error);
    
    // Enhance error messages
    let msg = error.message;
    if (msg.includes("401") || msg.includes("API key")) {
        msg = "API Key không hợp lệ hoặc đã hết hạn. Vui lòng kiểm tra lại cấu hình.";
    } else if (msg.includes("429")) {
        msg = "Đã vượt quá giới hạn request (Quota Exceeded). Vui lòng thử lại sau.";
    } else if (msg.includes("fetch failed")) {
        msg = "Lỗi kết nối mạng. Không thể liên hệ với máy chủ Google.";
    }

    throw new Error(msg);
  }
};
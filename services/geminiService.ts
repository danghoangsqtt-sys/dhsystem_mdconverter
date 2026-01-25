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

    // 3. Prepare Prompt - CẬP NHẬT MẠNH MẼ
    const prompt = `
      VAI TRÒ: Bạn là Chuyên gia Số hóa Tài liệu Pháp quy Chính xác.
      
      NHIỆM VỤ TỐI THƯỢNG:
      Trích xuất thông tin từ phần "DỮ LIỆU NGUỒN (PDF)" và điền vào "KHUNG ĐỊNH DẠNG".

      QUY TẮC BẮT BUỘC (TUÂN THỦ 100%):
      1. NGUỒN SỰ THẬT DUY NHẤT: Chỉ được lấy thông tin từ phần "DỮ LIỆU NGUỒN (PDF)" bên dưới.
      2. CẤM BỊA ĐẶT: Tuyệt đối KHÔNG sử dụng bất kỳ thông tin giả định nào. Nếu không thấy trong PDF, ghi "[Không tìm thấy]".
      3. KHÔNG DÙNG THÔNG TIN CŨ: Bỏ qua mọi ví dụ trong template cũ. Nếu PDF là "Thông tư 193", phải ghi "Thông tư 193".
      4. GIỮ NGUYÊN VĂN: Các điều khoản, số liệu, ngày tháng phải chính xác từng ký tự so với bản gốc.
      5. ĐỊNH DẠNG: Markdown chuẩn, sử dụng các cấp tiêu đề #, ##, ### hợp lý.

      ---
      KHUNG ĐỊNH DẠNG (Template):
      ${TEMPLATE_INSTRUCTION}
      ---

      DỮ LIỆU NGUỒN (PDF) - HÃY XỬ LÝ NỘI DUNG NÀY:
      ${extractedText}

      YÊU CẦU ĐẦU RA:
      Trả về kết quả Markdown hoàn chỉnh. Không kèm lời dẫn.
    `;

    // 4. Call API
    onUpdate('generating', "Đang gửi Context tới Gemini Flash 3.0 Preview...");
    onUpdate('generating', "AI đang phân tích dữ liệu thực tế...");

    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash-exp', // Hoặc 'gemini-1.5-flash' tùy key của bạn, 'gemini-3-flash-preview' chưa ổn định public
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